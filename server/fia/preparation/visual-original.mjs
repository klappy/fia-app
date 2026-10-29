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
const KINDS=new Set(['photo','illustration','map']),JOB_KEY='visual-original:job';
// One fenced ticket per attempt: attempt 1 on the first demand, and a new one only on a deliberate Retry after a non-final interruption.
const ticketFor=n=>({checkId:n===1?'visual-original@1:first':`visual-original@1:retry-${n}`,sequence:n,expectedPreviousObservationSha256:null,previousSourceSha256:null});
// Final typed refusals for this source under this recipe, named as SOURCE-TO-APP's `visual-unsupported` (cookbook PR265) with the
// recipe sub-reason; `fresh-ineligible` is `visual-ineligible`. Anything else is an interrupted attempt, never a verdict.
// HTTP status: a redirect (fresh-response-refused) and a non-transient status such as 404 or 410 (fresh-response-status) are final,
// because the identity is the exact URL and version; 408, 425, 429 and 5xx (fresh-response-status-transient) are interrupted.
const UNSUPPORTED=new Set(['fresh-response-refused','fresh-response-status','fresh-known-length-required','fresh-byte-limit','fresh-byte-length','fresh-signature-mismatch','fresh-source-policy']);
// Ineligibility belongs to the caller's current admission, not to the source, so it is never final for the shared job.
const custodyRefusal=error=>error?.message==='fresh-ineligible'?{reason:'visual-ineligible',subReason:'fresh-ineligible',final:false}:{reason:'retained-evidence-unavailable',subReason:error?.message??null,final:false};
const refusal=r=>UNSUPPORTED.has(r)?{reason:'visual-unsupported',subReason:r,final:true}:r==='fresh-ineligible'?{reason:'visual-ineligible',subReason:r,final:false}:{reason:'interrupted',subReason:r??null,final:false};
function trusted(v){
 if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).sort().join()!=='kind,sourceVersion,url'||!KINDS.has(v.kind)||typeof v.url!=='string'||typeof v.sourceVersion!=='string'||!v.sourceVersion.trim()||v.sourceVersion.length>256)throw Error('visual-source');
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
// Runs inside the visual object: storage is ctx.storage, bucket is env.FIA_ORIGINALS. eligibility is the caller's current trusted admission check;
// it receives the primitive's full synchronous context {phase,source,admission,observedContent} (phase 'demand' before any write), so a
// known-bad observed hash is refused at head promotion and on every later read.
export function createVisualOriginalJob({storage,bucket,source,eligibility,fetchSource,makeStream,now}){
 const s=trusted(structuredClone(source));if(typeof eligibility!=='function'||typeof storage?.transaction!=='function'||!bucket)throw Error('visual-capability');
 async function context(){const identity=await visualOriginalIdentity(s);return {identity,source:{logicalId:identity.logicalId,url:s.url,sourceVersionKind:'discovery-snapshot',sourceVersion:s.sourceVersion,publisherVersion:null}};}
  const observer=(c,n=1)=>createFreshSourceObservations({storage,bucket,source:c.source,policy:{...VISUAL_ORIGINAL_POLICY},admissions:[ticketFor(n)],content:VISUAL_CONTENT,eligibility:context=>context.source.url===s.url&&context.source.sourceVersion===s.sourceVersion&&strict(context),...(fetchSource?{fetchSource}:{}),...(makeStream?{makeStream}:{}),...(now?{now}:{})});
 // Strict synchronous true, like the primitive's allowed(): a returned promise is observed so a rejection is never left unhandled.
 const strict=context=>{try{const result=eligibility(context);if(result&&typeof result.then==='function')Promise.resolve(result).catch(()=>{});return result===true;}catch{return false;}};
 const base=c=>({job:VISUAL_ORIGINAL_JOB,recipe:VISUAL_ORIGINAL_RECIPE,sourceIdentitySha256:c.identity.sourceIdentitySha256,kind:s.kind});
 const attemptOf=marker=>{if(!Number.isSafeInteger(marker?.attempt)||marker.attempt<1)throw Error('visual-identity-corrupt');return marker.attempt;};
 async function bind(c){return storage.transaction(async tx=>{const marker=await tx.get(JOB_KEY);if(marker&&marker.logicalId!==c.identity.logicalId)throw Error('visual-identity-corrupt');if(marker)return attemptOf(marker);await tx.put(JOB_KEY,{schema:'fia-visual-original-job@1',logicalId:c.identity.logicalId,attempt:1});return 1;});}
 // A deliberate Retry opens the next ticket only when the current attempt ended uncertain with a non-final reason; concurrent Retries share it.
 async function reopen(c,n){const row=(await observer(c,n).status(ticketFor(n).checkId)).operation;// Reopenable: an uncertain attempt with a non-final reason, or a completed attempt whose observed bytes were refused at head
  // promotion (fresh-ineligible, never promoted), since eligibility is the caller's current state and may since have cleared.
  const reopenable=row?.state==='uncertain'&&!refusal(row.reason).final||row?.state==='completed'&&row.promoted===false&&row.reason==='fresh-ineligible';if(!reopenable)return n;return storage.transaction(async tx=>{const marker=await tx.get(JOB_KEY),current=attemptOf(marker);if(current!==n)return current;await tx.put(JOB_KEY,{...marker,attempt:n+1});return n+1;});}
 async function retained(c){const head=await observer(c).read();if(head.state!=='observed')return null;return {...base(c),state:'unavailable',reason:'decoder-unavailable',custody:'retained',original:observed(head.observation,head.observationSha256),decode};}
 // A demand fetches at most once per attempt: a repeat or a concurrent demand joins the current ticket. After a non-final
 // interruption a plain demand reports `interrupted` with 0 fetches; only `retry:true` (SOURCE-TO-APP's deliberate Retry) opens a new attempt.
 async function demand({signal,retry=false}={}){
  const c=await context();
  // A demand already cancelled is refused before any row is written, so it cannot consume the shared ticket.
  if(signal?.aborted)return {...base(c),state:'unavailable',reason:'interrupted',subReason:'fresh-aborted',final:false,custody:'none',decode};
  // An ineligible demand is refused before the job marker, sequence or attempt rows exist, so it cannot poison the shared job.
  // The primitive's own source checks run before any durable write, so a source it would refuse never leaves a job marker.
  try{observer(c);}catch(error){return {...base(c),state:'unavailable',reason:'visual-unsupported',subReason:error.message,final:true,custody:'none',decode};}
  const admitted=strict({phase:'demand',source:structuredClone(c.source),admission:null,observedContent:null});if(!admitted)return {...base(c),state:'unavailable',reason:'visual-ineligible',subReason:'fresh-ineligible',final:false,custody:'none',decode};
  let n=await bind(c);
  try{const prior=await retained(c);if(prior)return prior;}catch(error){return {...base(c),state:'unavailable',...custodyRefusal(error),custody:'unverified',decode};}
  if(retry===true)n=await reopen(c,n);
  let outcome;try{outcome=await observer(c,n).observe(ticketFor(n).checkId,{signal});}catch(error){return {...base(c),state:'unavailable',...refusal(error.message),custody:'none',decode};}
  if(outcome.state==='preparing')return {...base(c),state:'preparing',custody:'none',decode};
  if(outcome.state==='uncertain')return {...base(c),state:'unavailable',...refusal(outcome.reason),custody:'none',decode};
  try{const kept=await retained(c);if(kept)return kept;}catch(error){return {...base(c),state:'unavailable',...custodyRefusal(error),custody:'unverified',decode};}
  return {...base(c),state:'unavailable',...(outcome.reason?refusal(outcome.reason):{reason:'visual-not-promoted',subReason:null,final:false}),custody:'none',decode};
 }
 async function read(){const c=await context();let kept;try{kept=await retained(c);}catch(error){return {...base(c),state:'unavailable',...custodyRefusal(error),custody:'unverified',decode};}return kept??{...base(c),state:'unavailable',reason:'visual-not-requested',custody:'none',decode};}
 return Object.freeze({demand,read});
}
