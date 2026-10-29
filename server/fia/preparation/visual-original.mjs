import {canonicalJSONString,sha256} from './contract.mjs';
import {createFreshSourceObservations,VISUAL_CONTENT} from './executor/fresh-source-observation.mjs';
import {createHash} from 'node:crypto';
import {decodeVisual,VisualDecodeRefusal,PNG_DECODER,JPEG_DECODER} from './visual-decode.mjs';
// visual-original@1: lazy fetch-and-store of one trusted picture or map original, inside the existing
// FIA_PREPARATION_JOBS Durable Object and FIA_ORIGINALS bucket, on the fresh-source-observation primitive.
// Decode (F6, T5 YES with conditions at cookbook d922aa5): a full decode of the read-back retained bytes is the only way to "ready".
// Ready here is source custody plus decode proof; display readiness still needs coherent publication (SOURCE-TO-APP, F7b).
export const VISUAL_ORIGINAL_JOB='visual-original@1';
// 12 MiB inside the primitive's 16 MiB ceiling: c4 (5,092,889 B) uses 40%, the largest map c5 (7,889,557 B) 63%.
export const VISUAL_ORIGINAL_POLICY=Object.freeze({revision:'fia-visual-original@1',maxBytes:12582912,totalMs:30000,progressMs:15000});
// The versioned recipe. Custody (the fetch policy above) is bound into each observation and is unchanged; decode is a separate
// validation step that re-checks the read-back bytes and fetches nothing. @2 adds the decoders, format subsets and decode limits,
// so its identity (recipeSha256) is carried by every decode record; a recipe change re-decodes retained bytes, never refetches.
const freeze=o=>Object.freeze(o);
export const VISUAL_ORIGINAL_RECIPE=freeze({schema:'fia-visual-original-recipe@2',job:'visual-original@1',custody:VISUAL_ORIGINAL_POLICY.revision,
 formats:freeze(['image/jpeg','image/png']),
 signatures:freeze({'image/png':'89504e470d0a1a0a','image/jpeg':'ffd8ff'}),
 subsets:freeze({'image/png':'8-bit samples, colour types 0/2/3/4/6, non-interlaced (interlaced: decode-not-streamable)','image/jpeg':'8-bit baseline, extended or progressive Huffman (SOF0/1/2), 1 or 3 components, at most maxJpegPixels (larger: decode-not-streamable)'}),
 // maxPixels 17 MP fits the largest map c175 (16.0 MP); maxJpegPixels 2 MP fits every 1000 px picture. decodeMs is a wall deadline; the CPU ceiling is the platform's.
 limits:freeze({maxBytes:VISUAL_ORIGINAL_POLICY.maxBytes,totalMs:VISUAL_ORIGINAL_POLICY.totalMs,progressMs:VISUAL_ORIGINAL_POLICY.progressMs,maxDimension:8192,maxPixels:17000000,maxJpegPixels:2000000,maxJpegMemoryMB:64,maxJpegScans:32,maxPngChunks:16384,decodeMs:20000}),
 decoder:freeze({'image/png':PNG_DECODER,'image/jpeg':JPEG_DECODER})});
const RECIPE_SHA256=createHash('sha256').update(canonicalJSONString(VISUAL_ORIGINAL_RECIPE)).digest('hex');
export const VISUAL_ORIGINAL_RECIPE_SHA256=RECIPE_SHA256;
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
// Decode evidence slot before any retained bytes exist. With retained bytes it is filled from the read-back bytes (decodeRetained).
const decode=Object.freeze({state:'unavailable',reason:'decoder-unavailable',decoder:null,width:null,height:null,pixelsSha256:null});
// Read back the retained original and prove it: unchanged nonzero length and sha256, observed MIME agreeing with the raster signature,
// and a full decode within the recipe. Pixels stay in this function; only dimensions and a pixel hash leave it.
// Both readback awaits share one bound (the recipe's progressMs); expiry is a non-final interruption, never a hang.
function bounded(promise,deadline){let timer;const expiry=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new VisualDecodeRefusal('readback-deadline',{final:false})),Math.max(0,deadline-Date.now()));});return Promise.race([promise,expiry]).finally(()=>clearTimeout(timer));}
async function readBack(bucket,original,readbackMs){
 if(!Number.isSafeInteger(original.bytes)||original.bytes<1||!/^[a-f0-9]{64}$/.test(original.sha256)||/^0{64}$/.test(original.sha256))throw Error('visual-retained-identity');
 const deadline=Date.now()+readbackMs;
 const object=await bounded(bucket.get(original.sourceKey),deadline);if(!object||object.size!==original.bytes)throw Error('visual-retained-size');
 const bytes=new Uint8Array(await bounded(object.arrayBuffer(),deadline));if(bytes.length!==original.bytes)throw Error('visual-retained-size');
 if(createHash('sha256').update(bytes).digest('hex')!==original.sha256)throw Error('visual-retained-hash');
 return bytes;
}
export async function decodeRetained(bucket,original,{clock,readbackMs=VISUAL_ORIGINAL_RECIPE.limits.progressMs}={}){
 try{const bytes=await readBack(bucket,original,readbackMs);
  const r=await decodeVisual(bytes,{mime:original.contentType,limits:{...VISUAL_ORIGINAL_RECIPE.limits,formats:VISUAL_ORIGINAL_RECIPE.formats},clock});
  return {state:'ready',reason:null,subReason:null,final:true,recipeSha256:RECIPE_SHA256,originalSha256:original.sha256,bytes:original.bytes,mime:r.format,decoder:r.decoder,width:r.width,height:r.height,pixelsSha256:r.pixelsSha256};}
 catch(error){if(!(error instanceof VisualDecodeRefusal))throw error;
  return {state:'unavailable',reason:error.final?'visual-unsupported':'interrupted',subReason:error.subReason,final:error.final,recipeSha256:RECIPE_SHA256,originalSha256:original.sha256,bytes:original.bytes,mime:original.contentType,decoder:null,width:null,height:null,pixelsSha256:null};}
}
// A kept decode row is accepted only in its exact shape with the invariants of its state; anything else fails closed as corrupt.
const DECODE_FIELDS='bytes,decoder,final,height,mime,originalSha256,pixelsSha256,reason,recipeSha256,state,subReason,width';
const dimension=v=>Number.isSafeInteger(v)&&v>=1&&v<=VISUAL_ORIGINAL_RECIPE.limits.maxDimension;
function keptDecode(r,original){
 const shape=r&&typeof r==='object'&&Object.getPrototypeOf(r)===Object.prototype&&Object.keys(r).sort().join()===DECODE_FIELDS&&r.recipeSha256===RECIPE_SHA256&&r.originalSha256===original.sha256&&r.bytes===original.bytes&&r.mime===original.contentType&&r.final===true;
 const ready=shape&&r.state==='ready'&&r.reason===null&&r.subReason===null&&Object.hasOwn(VISUAL_ORIGINAL_RECIPE.decoder,r.mime)&&canonicalJSONString(r.decoder)===canonicalJSONString(VISUAL_ORIGINAL_RECIPE.decoder[r.mime])&&dimension(r.width)&&dimension(r.height)&&r.width*r.height<=VISUAL_ORIGINAL_RECIPE.limits.maxPixels&&typeof r.pixelsSha256==='string'&&/^[a-f0-9]{64}$/.test(r.pixelsSha256);
 const refused=shape&&r.state==='unavailable'&&r.reason==='visual-unsupported'&&typeof r.subReason==='string'&&/^[a-z0-9-]{1,64}$/.test(r.subReason)&&r.decoder===null&&r.width===null&&r.height===null&&r.pixelsSha256===null;
 if(!ready&&!refused)throw Error('visual-decode-record-corrupt');
 return r;
}
// Runs inside the visual object: storage is ctx.storage, bucket is env.FIA_ORIGINALS. eligibility is the caller's current trusted admission check;
// it receives the primitive's full synchronous context {phase,source,admission,observedContent} (phase 'demand' before any write), so a
// known-bad observed hash is refused at head promotion and on every later read.
export function createVisualOriginalJob({storage,bucket,source,eligibility,fetchSource,makeStream,now}){
 const s=trusted(structuredClone(source));if(typeof eligibility!=='function'||typeof storage?.transaction!=='function'||!bucket)throw Error('visual-capability');
 async function context(){const identity=await visualOriginalIdentity(s);return {identity,source:{logicalId:identity.logicalId,url:s.url,sourceVersionKind:'discovery-snapshot',sourceVersion:s.sourceVersion,publisherVersion:null}};}
  const observer=(c,n=1)=>createFreshSourceObservations({storage,bucket,source:c.source,policy:{...VISUAL_ORIGINAL_POLICY},admissions:[ticketFor(n)],content:VISUAL_CONTENT,eligibility:context=>context.source.url===s.url&&context.source.sourceVersion===s.sourceVersion&&strict(context),...(fetchSource?{fetchSource}:{}),...(makeStream?{makeStream}:{}),...(now?{now}:{})});
 // Strict synchronous true, like the primitive's allowed(): a returned promise is observed so a rejection is never left unhandled.
 const strict=context=>{try{const result=eligibility(context);if(result&&typeof result.then==='function')Promise.resolve(result).catch(()=>{});return result===true;}catch{return false;}};
 const base=c=>({job:VISUAL_ORIGINAL_JOB,recipe:VISUAL_ORIGINAL_RECIPE,recipeSha256:RECIPE_SHA256,sourceIdentitySha256:c.identity.sourceIdentitySha256,kind:s.kind});
 const attemptOf=marker=>{if(!Number.isSafeInteger(marker?.attempt)||marker.attempt<1)throw Error('visual-identity-corrupt');return marker.attempt;};
 async function bind(c){return storage.transaction(async tx=>{const marker=await tx.get(JOB_KEY);if(marker&&marker.logicalId!==c.identity.logicalId)throw Error('visual-identity-corrupt');if(marker)return attemptOf(marker);await tx.put(JOB_KEY,{schema:'fia-visual-original-job@1',logicalId:c.identity.logicalId,attempt:1});return 1;});}
 // A deliberate Retry opens the next ticket only when the current attempt ended uncertain with a non-final reason; concurrent Retries share it.
 async function reopen(c,n){const row=(await observer(c,n).status(ticketFor(n).checkId)).operation;// Reopenable: an uncertain attempt with a non-final reason, or a completed attempt whose observed bytes were refused at head
  // promotion (fresh-ineligible, never promoted), since eligibility is the caller's current state and may since have cleared.
  const reopenable=row?.state==='uncertain'&&!refusal(row.reason).final||row?.state==='completed'&&row.promoted===false&&row.reason==='fresh-ineligible';if(!reopenable)return n;return storage.transaction(async tx=>{const marker=await tx.get(JOB_KEY),current=attemptOf(marker);if(current!==n)return current;await tx.put(JOB_KEY,{...marker,attempt:n+1});return n+1;});}
 // A final decode verdict is kept per recipe identity and original sha256, so a repeat or a read neither refetches nor re-decodes.
 async function decoded(c,original){
  const key=`visual-original:decode:${RECIPE_SHA256}:${original.sha256}`,prior=await storage.get(key);
  if(prior)return keptDecode(prior,original);
  const record=await decodeRetained(bucket,original);
  if(record.final)await storage.transaction(async tx=>{if(!await tx.get(key))await tx.put(key,record);});
  return record;
 }
 async function retained(c){
  const head=await observer(c).read();if(head.state!=='observed')return null;
  const original=observed(head.observation,head.observationSha256),d=await decoded(c,original);
  const slot={state:d.state,reason:d.reason,subReason:d.subReason,decoder:d.decoder,width:d.width,height:d.height,pixelsSha256:d.pixelsSha256};
  return d.state==='ready'?{...base(c),state:'ready',custody:'retained',original,decode:slot}:{...base(c),state:'unavailable',reason:d.reason,subReason:d.subReason,final:d.final,custody:'retained',original,decode:slot};
 }
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
