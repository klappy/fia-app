import {canonicalJSONString,sha256} from './contract.mjs';
import {createFreshSourceObservations,VISUAL_CONTENT} from './executor/fresh-source-observation.mjs';
// visual-original@1: lazy fetch-and-store of one trusted picture or map original, inside the existing
// FIA_PREPARATION_JOBS Durable Object and FIA_ORIGINALS bucket, on the fresh-source-observation primitive.
// Custody only: decode evidence waits for T5, so no outcome of this job is ever "ready".
export const VISUAL_ORIGINAL_JOB='visual-original@1';
// 12 MiB inside the primitive's 16 MiB ceiling: c4 (5,092,889 B) uses 40%, the largest map c5 (7,889,557 B) 63%.
export const VISUAL_ORIGINAL_POLICY=Object.freeze({revision:'fia-visual-original@1',maxBytes:12582912,totalMs:30000,progressMs:15000});
// The versioned recipe. Custody (the fetch policy above) is bound into each observation; decode is a separate, later
// validation step (F6, T5 ruled at cookbook d922aa5) that re-checks the read-back bytes and fetches nothing, so adding
// a decoder fills `decoder` here and the null fields of `decode` below without changing the custody receipt.
export const VISUAL_ORIGINAL_RECIPE=Object.freeze({schema:'fia-visual-original-recipe@1',job:'visual-original@1',custody:VISUAL_ORIGINAL_POLICY.revision,formats:Object.freeze(['image/jpeg','image/png']),limits:Object.freeze({maxBytes:VISUAL_ORIGINAL_POLICY.maxBytes,totalMs:VISUAL_ORIGINAL_POLICY.totalMs,progressMs:VISUAL_ORIGINAL_POLICY.progressMs,maxPixels:null}),decoder:null});
const KINDS=new Set(['photo','illustration','map']),CHECK='visual-original@1:first',JOB_KEY='visual-original:job';
// Final typed refusals for this source under this recipe, named as SOURCE-TO-APP's `visual-unsupported` (cookbook PR265) with the
// recipe sub-reason; `fresh-ineligible` is `visual-ineligible`. Anything else is an interrupted attempt, never a verdict.
const UNSUPPORTED=new Set(['fresh-response-refused','fresh-known-length-required','fresh-byte-limit','fresh-byte-length','fresh-signature-mismatch','fresh-source-policy']);
const refusal=r=>UNSUPPORTED.has(r)?{reason:'visual-unsupported',subReason:r,final:true}:r==='fresh-ineligible'?{reason:'visual-ineligible',subReason:r,final:true}:{reason:'interrupted',subReason:r??null,final:false};
function trusted(v){
 if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).sort().join()!=='kind,sourceVersion,url'||!KINDS.has(v.kind)||typeof v.url!=='string'||typeof v.sourceVersion!=='string'||!v.sourceVersion||v.sourceVersion.length>256)throw Error('visual-source');
 const url=new URL(v.url);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||v.url.length>1024)throw Error('visual-source');
 return {kind:v.kind,url:v.url,sourceVersion:v.sourceVersion};
}
// One identity per source (URL and version), shared across packs and languages; the kind is part of the reviewed source.
export async function visualOriginalIdentity(source){
 const s=trusted(structuredClone(source)),logicalId=canonicalJSONString({schema:'fia-visual-original-source@1',...s}),sourceIdentitySha256=await sha256(logicalId);
 return {logicalId,sourceIdentitySha256,name:`${VISUAL_ORIGINAL_JOB}:${sourceIdentitySha256}`};
}
export async function visualOriginalObject(env,source){const {name}=await visualOriginalIdentity(source);return env.FIA_PREPARATION_JOBS.get(env.FIA_PREPARATION_JOBS.idFromName(name));}
function observed(receipt,observationSha256){return {sha256:receipt.sha256,bytes:receipt.bytes,contentType:receipt.contentType,sourceKey:receipt.sourceKey,observationSha256};}
// Decode evidence slot: never 'ready' in this slice; F6 fills decoder, width, height and pixelsSha256 from the read-back bytes.
const decode=Object.freeze({state:'unavailable',reason:'decoder-unavailable',decoder:null,width:null,height:null,pixelsSha256:null});
// Runs inside the visual object: storage is ctx.storage, bucket is env.FIA_ORIGINALS. eligibility is the caller's current trusted admission check.
export function createVisualOriginalJob({storage,bucket,source,eligibility,fetchSource,makeStream,now}){
 const s=trusted(structuredClone(source));if(typeof eligibility!=='function'||typeof storage?.transaction!=='function'||!bucket)throw Error('visual-capability');
 async function context(){const identity=await visualOriginalIdentity(s);return {identity,source:{logicalId:identity.logicalId,url:s.url,sourceVersionKind:'discovery-snapshot',sourceVersion:s.sourceVersion,publisherVersion:null}};}
 const ticket={checkId:CHECK,sequence:1,expectedPreviousObservationSha256:null,previousSourceSha256:null};
 const observer=c=>createFreshSourceObservations({storage,bucket,source:c.source,policy:{...VISUAL_ORIGINAL_POLICY},admissions:[ticket],content:VISUAL_CONTENT,eligibility:({source:seen})=>seen.url===s.url&&seen.sourceVersion===s.sourceVersion&&eligibility()===true,...(fetchSource?{fetchSource}:{}),...(makeStream?{makeStream}:{}),...(now?{now}:{})});
 const base=c=>({job:VISUAL_ORIGINAL_JOB,recipe:VISUAL_ORIGINAL_RECIPE,sourceIdentitySha256:c.identity.sourceIdentitySha256,kind:s.kind});
 async function bind(c){await storage.transaction(async tx=>{const marker=await tx.get(JOB_KEY);if(marker&&marker.logicalId!==c.identity.logicalId)throw Error('visual-identity-corrupt');if(!marker)await tx.put(JOB_KEY,{schema:'fia-visual-original-job@1',logicalId:c.identity.logicalId});});}
 async function retained(c){const head=await observer(c).read();if(head.state!=='observed')return null;return {...base(c),state:'unavailable',reason:'decoder-unavailable',custody:'retained',original:observed(head.observation,head.observationSha256),decode};}
 // A demand fetches at most once per source under this recipe: a repeat or a concurrent demand joins the one ticket.
 async function demand({signal}={}){
  const c=await context();await bind(c);
  try{const prior=await retained(c);if(prior)return prior;}catch(error){return {...base(c),state:'unavailable',reason:'retained-evidence-unavailable',subReason:error.message,final:false,custody:'unverified',decode};}
  let outcome;try{outcome=await observer(c).observe(CHECK,{signal});}catch(error){return {...base(c),state:'unavailable',...refusal(error.message),custody:'none',decode};}
  if(outcome.state==='preparing')return {...base(c),state:'preparing',custody:'none',decode};
  if(outcome.state==='uncertain')return {...base(c),state:'unavailable',...refusal(outcome.reason),custody:'none',decode};
  return (await retained(c))??{...base(c),state:'unavailable',reason:outcome.reason??'visual-not-promoted',custody:'none',decode};
 }
 async function read(){const c=await context();return (await retained(c))??{...base(c),state:'unavailable',reason:'visual-not-requested',custody:'none',decode};}
 return Object.freeze({demand,read});
}
