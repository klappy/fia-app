import {createHash} from 'node:crypto';
import {canonicalJSONString,sha256} from './contract.mjs';
import {createFreshSourceObservations,createProfileJsonPort} from './executor/fresh-source-observation.mjs';
// guide-fragment@1: request-driven, version-bound retention of one class-A publisher guide file, inside the existing
// FIA_PREPARATION_JOBS Durable Object and FIA_ORIGINALS bucket, on the fresh-source-observation primitive's JSON port. It is the
// producer behind source-associations/composer.mjs, which asks for exactly the file the retained archive describes and turns the
// verified read() plus whole bytes into a branded producer receipt. One file per demand; no corpus batch. Not routed.
export const GUIDE_FRAGMENT_JOB='guide-fragment@1';
// The class-A acquisition profile (draft CONTRACT Q24). Its sha256 is part of the policy revision, and so of every observation binding:
// a profile change is a recipe change. 6 MiB inside the primitive's 16 MiB ceiling; the guide files observed at 96bb were 1.72-2.62 MB.
export const GUIDE_ACQUISITION_PROFILE=Object.freeze({schema:'fia-guide-acquisition-profile@1',contractClause:'CONTRACT Q24 (proposed, fia-app-cookbook PR 266)',sourceClass:'A',owner:'BibleAquifer',collections:Object.freeze(['FIATranslationGuide']),origin:'https://raw.githubusercontent.com',path:'<lang>/json/<NN>.content.json',languages:Object.freeze(['eng','spa']),revision:'exact 40-hex publisher-version, taken from the retained archive descriptor',media:Object.freeze(['application/json','text/plain']),mediaRule:'text/plain admitted only for this profile\'s composed class-A URL; under either type the body must begin with [, equal the known Content-Length within maxBytes, decode as strict UTF-8 and parse as one top-level JSON array before quarantine; promoted only when sha256 equals the descriptor; observed Content-Type recorded verbatim in the receipt; any other type unsupported',shape:'top-level JSON array',maxBytes:6291456,totalMs:30000,progressMs:15000,redirects:'refused',query:'refused',credentials:'none',expectedSha256:'required, from the retained archive descriptor'});
const profileSha256=createHash('sha256').update(canonicalJSONString(GUIDE_ACQUISITION_PROFILE)).digest('hex');
export const GUIDE_FRAGMENT_POLICY=Object.freeze({revision:`fia-guide-fragment@1:profile:${profileSha256}`,maxBytes:GUIDE_ACQUISITION_PROFILE.maxBytes,totalMs:GUIDE_ACQUISITION_PROFILE.totalMs,progressMs:GUIDE_ACQUISITION_PROFILE.progressMs});
export const GUIDE_REPOSITORY='BibleAquifer/FIATranslationGuide';
// The guide-fragment job's own JSON port, built from the profile's media list. Its source-URL rule is this profile's composed
// class-A URL shape (origin, owner, an allowed collection, an exact revision, a guide path), so text/plain reaches nothing else.
const CLASS_A_URL=new RegExp(`^https://raw\\.githubusercontent\\.com/${GUIDE_ACQUISITION_PROFILE.owner}/(?:${GUIDE_ACQUISITION_PROFILE.collections.join('|')})/[a-f0-9]{40}/(?:eng|spa)/json/\\d{1,3}\\.content\\.json$`);
const GUIDE_PORT=createProfileJsonPort({media:[...GUIDE_ACQUISITION_PROFILE.media],sourceUrl:url=>CLASS_A_URL.test(url)});
const JOB_KEY='guide-fragment:job',hex=x=>createHash('sha256').update(x).digest('hex');
const ticketFor=n=>({checkId:n===1?'guide-fragment@1:first':`guide-fragment@1:retry-${n}`,sequence:n,expectedPreviousObservationSha256:null,previousSourceSha256:null});
// Final refusals for this exact file under this recipe; ineligibility and interruptions are never final (Retry rules as visual-original).
const UNSUPPORTED=new Set(['fresh-response-refused','fresh-response-status','fresh-known-length-required','fresh-byte-limit','fresh-byte-length','fresh-signature-mismatch','fresh-shape-mismatch','fresh-media-refused','fresh-source-policy']);
export const GUIDE_UNSUPPORTED_REASONS=Object.freeze([...UNSUPPORTED]);
const refusal=r=>UNSUPPORTED.has(r)?{reason:'guide-unsupported',subReason:r,final:true}:r==='fresh-ineligible'?{reason:'guide-ineligible',subReason:r,final:false}:{reason:'interrupted',subReason:r??null,final:false};
const custodyRefusal=error=>error?.message==='fresh-ineligible'?{reason:'guide-ineligible',subReason:'fresh-ineligible',final:false}:{reason:'retained-evidence-unavailable',subReason:error?.message??null,final:false};
function trusted(v){
 const [owner,collection]=typeof v?.repo==='string'?v.repo.split('/'):[];
 if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).sort().join()!=='path,repo,revision'||owner!==GUIDE_ACQUISITION_PROFILE.owner||!GUIDE_ACQUISITION_PROFILE.collections.includes(collection)||v.repo!==`${owner}/${collection}`||typeof v.revision!=='string'||!/^[a-f0-9]{40}$/.test(v.revision)||typeof v.path!=='string'||!/^(?:eng|spa)\/json\/\d{1,3}\.content\.json$/.test(v.path))throw Error('guide-source');
 return {repo:v.repo,revision:v.revision,path:v.path};
}
const sourceOf=({repo,revision,path})=>({repo,revision,path});
// The expected whole-file sha is required: the composer takes it from the retained archive descriptor, so nothing unpinned is promoted.
const expectedOf=v=>{if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))throw Error('guide-expected-sha256');return v;};
export async function guideFragmentIdentity(source){
 const s=trusted(source),logicalId=canonicalJSONString({schema:'fia-guide-fragment-source@1',...s}),sourceIdentitySha256=await sha256(logicalId);
 return {logicalId,sourceIdentitySha256,name:`${GUIDE_FRAGMENT_JOB}:${sourceIdentitySha256}`,url:`https://raw.githubusercontent.com/${s.repo}/${s.revision}/${s.path}`};
}
export async function guideFragmentObject(env,source){const {name}=await guideFragmentIdentity(source);return env.FIA_PREPARATION_JOBS.get(env.FIA_PREPARATION_JOBS.idFromName(name));}
// Runs inside the guide object: storage is ctx.storage, bucket is env.FIA_ORIGINALS. eligibility is the caller's current trusted admission
// check and receives the primitive's full synchronous context; phase 'demand' precedes any write.
export function createGuideFragmentJob({storage,bucket,eligibility,fetchSource,makeStream,now}){
 if(typeof eligibility!=='function'||typeof storage?.transaction!=='function'||!bucket)throw Error('guide-capability');
 const strict=context=>{try{const result=eligibility(context);if(result&&typeof result.then==='function')Promise.resolve(result).catch(()=>{});return result===true;}catch{return false;}};
 async function context(source){const s=trusted(sourceOf(source??{})),identity=await guideFragmentIdentity(s);return {s,identity,source:{logicalId:identity.logicalId,url:identity.url,sourceVersionKind:'publisher-version',sourceVersion:s.revision,publisherVersion:s.revision}};}
 // An expected whole-file sha is checked at head promotion and on read: a mismatching file is never promoted or exposed.
 const observer=(c,n=1,expected=null,seen={})=>createFreshSourceObservations({storage,bucket,source:c.source,policy:{...GUIDE_FRAGMENT_POLICY},admissions:[ticketFor(n)],content:GUIDE_PORT,
  eligibility:ctx=>{if(ctx.source.url!==c.source.url||ctx.source.sourceVersion!==c.s.revision)return false;if(expected&&ctx.observedContent&&ctx.observedContent.sha256!==expected){seen.mismatch=true;return false;}return strict(ctx);},
  ...(fetchSource?{fetchSource}:{}),...(makeStream?{makeStream}:{}),...(now?{now}:{})});
 const base=c=>({job:GUIDE_FRAGMENT_JOB,recipe:GUIDE_FRAGMENT_POLICY.revision,sourceIdentitySha256:c.identity.sourceIdentitySha256,source:c.s});
 const attemptOf=marker=>{if(!Number.isSafeInteger(marker?.attempt)||marker.attempt<1)throw Error('guide-identity-corrupt');return marker.attempt;};
 async function bind(c){return storage.transaction(async tx=>{const marker=await tx.get(JOB_KEY);if(marker&&marker.logicalId!==c.identity.logicalId)throw Error('guide-identity-corrupt');if(marker)return attemptOf(marker);await tx.put(JOB_KEY,{schema:'fia-guide-fragment-job@1',logicalId:c.identity.logicalId,attempt:1});return 1;});}
 async function reopen(c,n){const row=(await observer(c,n).status(ticketFor(n).checkId)).operation;const reopenable=row?.state==='uncertain'&&!refusal(row.reason).final||row?.state==='completed'&&row.promoted===false&&row.reason==='fresh-ineligible';if(!reopenable)return n;return storage.transaction(async tx=>{const marker=await tx.get(JOB_KEY),current=attemptOf(marker);if(current!==n)return current;await tx.put(JOB_KEY,{...marker,attempt:n+1});return n+1;});}
 async function retained(c,expected,seen={}){const head=await observer(c,1,expected,seen).read();if(head.state!=='observed')return null;const o=head.observation;return {...base(c),state:'retained',file:{sha256:o.sha256,bytes:o.bytes,contentType:o.contentType,sourceKey:o.sourceKey,observationSha256:head.observationSha256}};}
 const mismatch=(c,seen)=>seen.mismatch?{...base(c),state:'unavailable',reason:'guide-sha-mismatch',final:false,custody:'none'}:null;
 // A demand fetches at most once per attempt; a repeat or concurrent demand joins the current ticket; only retry:true reopens.
 async function demand({repo,revision,path,expectedSha256,signal,retry=false}={}){
  let c,expected;try{c=await context({repo,revision,path});expected=expectedOf(expectedSha256);}catch(error){return {job:GUIDE_FRAGMENT_JOB,state:'unavailable',reason:'guide-unsupported',subReason:error.message,final:true,custody:'none'};}
  if(signal?.aborted)return {...base(c),state:'unavailable',reason:'interrupted',subReason:'fresh-aborted',final:false,custody:'none'};
  try{observer(c);}catch(error){return {...base(c),state:'unavailable',reason:'guide-unsupported',subReason:error.message,final:true,custody:'none'};}
  if(!strict({phase:'demand',source:structuredClone(c.source),admission:null,observedContent:null}))return {...base(c),state:'unavailable',reason:'guide-ineligible',subReason:'fresh-ineligible',final:false,custody:'none'};
  let n;try{n=await bind(c);}catch(error){return {...base(c),state:'unavailable',reason:'guide-unsupported',subReason:error.message,final:true,custody:'none'};}
  const seen={};
  try{const prior=await retained(c,expected,seen);if(prior)return prior;}catch(error){return mismatch(c,seen)??{...base(c),state:'unavailable',...custodyRefusal(error),custody:'unverified'};}
  if(retry===true)n=await reopen(c,n);
  let outcome;try{outcome=await observer(c,n,expected,seen).observe(ticketFor(n).checkId,{signal});}catch(error){return {...base(c),state:'unavailable',...refusal(error.message),custody:'none'};}
  if(outcome.state==='preparing')return {...base(c),state:'preparing',custody:'none'};
  if(outcome.state==='uncertain')return {...base(c),state:'unavailable',...refusal(outcome.reason),custody:'none'};
  try{const kept=await retained(c,expected,seen);if(kept)return kept;}catch(error){return mismatch(c,seen)??{...base(c),state:'unavailable',...custodyRefusal(error),custody:'unverified'};}
  return mismatch(c,seen)??{...base(c),state:'unavailable',...(outcome.reason?refusal(outcome.reason):{reason:'guide-not-promoted',subReason:null,final:false}),custody:'none'};
 }
 // The producer output for the composer: the primitive's verified read() result and the whole retained bytes, re-hashed here
 // against that receipt. The composer, not this job, brands it (source-associations/producer-receipt.mjs).
 async function retainedGuideFile({repo,revision,path,expectedSha256}={}){
  const none=extra=>({job:GUIDE_FRAGMENT_JOB,state:'unavailable',...extra});
  let c,expected;try{c=await context({repo,revision,path});expected=expectedOf(expectedSha256);}catch(error){return none({reason:'guide-unsupported',subReason:error.message});}
  const marker=await storage.get(JOB_KEY);if(!marker||marker.logicalId!==c.identity.logicalId)return none({...base(c),reason:'guide-not-retained'});
  const seen={};let read;try{read=await observer(c,1,expected,seen).read();}catch(error){return none(mismatch(c,seen)??{...base(c),...custodyRefusal(error)});}
  if(read.state!=='observed')return none({...base(c),reason:'guide-not-retained'});
  const o=read.observation,object=await bucket.get(o.sourceKey);if(!object||object.size!==o.bytes)return none({...base(c),reason:'retained-evidence-unavailable',subReason:'guide-bytes-missing'});
  const bytes=new Uint8Array(await object.arrayBuffer());if(bytes.length!==o.bytes||hex(bytes)!==o.sha256)return none({...base(c),reason:'retained-evidence-unavailable',subReason:'guide-bytes-integrity'});
  return {...base(c),state:'retained',read,bytes};
 }
 // Whether this identity already has a promoted head, and its source sha (the primitive's head record, fresh-source-observation
 // keys(): `fresh-head:<sha256(logicalId)>`). Admission uses it to refuse any further check as refresh-unavailable (Q24).
 async function promotedHead({repo,revision,path}={}){const c=await context({repo,revision,path}),h=await storage.get(`fresh-head:${await sha256(c.identity.logicalId)}`);return h?{exists:true,sourceSha256:h.sourceSha256,bytes:h.bytes}:{exists:false};}
 return Object.freeze({demand,retainedGuideFile,promotedHead});
}

// Internal dispatch for FiaPreparationJobs (worker.mjs). It answers only https://guide-fragment.internal and returns null for
// every other origin, so no public request reaches it. The object must be the one named for the requested source identity.
// Ticket admission is not built, so eligibility refuses by default: every demand is typed guide-ineligible before any write.
// The dispatch is wired but inert. read returns metadata only, never bytes; receipts are issued only inside a trusted composer.
const INTERNAL_ORIGIN='https://guide-fragment.internal',reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export async function serveGuideFragmentObject(request,ctx,env,capabilities){
 const url=new URL(request.url);if(url.origin!==INTERNAL_ORIGIN)return null;
 // The dispatch passes {snapshot}: the trusted build snapshot (entry.mjs), or null when the object has none. With a snapshot the
 // reviewed admission component (guide-fragment-admission.mjs) serves the demand; with null it is refused, typed. Called without
 // capabilities, the handler keeps its inert form: eligibility refuses every demand.
 if(capabilities!==undefined){
  if(!capabilities||typeof capabilities!=='object'||Object.keys(capabilities).join()!=='snapshot')return reply(500,{job:GUIDE_FRAGMENT_JOB,state:'unavailable',reason:'guide-admission-unavailable',subReason:'guide-capabilities-shape'});
  if(!capabilities.snapshot)return reply(503,{job:GUIDE_FRAGMENT_JOB,state:'unavailable',reason:'guide-admission-unavailable',subReason:'guide-no-trusted-snapshot'});
  const {serveGuideAdmission}=await import('./guide-fragment-admission.mjs');return serveGuideAdmission(request,ctx,env,capabilities.snapshot);
 }
 const eligibility=()=>false;
 const op=url.pathname;if(request.method!=='POST'||!['/demand','/read'].includes(op))return reply(404,{job:GUIDE_FRAGMENT_JOB,state:'unavailable',reason:'guide-unknown-operation'});
 let body;try{body=await request.json();}catch{return reply(400,{job:GUIDE_FRAGMENT_JOB,state:'unavailable',reason:'guide-unsupported',subReason:'guide-request-shape'});}
 const source={repo:body?.repo,revision:body?.revision,path:body?.path};
 let identity;try{identity=await guideFragmentIdentity(source);}catch{return reply(400,{job:GUIDE_FRAGMENT_JOB,state:'unavailable',reason:'guide-unsupported',subReason:'guide-source'});}
 if(!env?.FIA_PREPARATION_JOBS||!env?.FIA_ORIGINALS||ctx.id.toString()!==env.FIA_PREPARATION_JOBS.idFromName(identity.name).toString())return reply(403,{job:GUIDE_FRAGMENT_JOB,state:'unavailable',reason:'guide-object-identity'});
 const job=createGuideFragmentJob({storage:ctx.storage,bucket:env.FIA_ORIGINALS,eligibility});
 if(op==='/demand')return reply(200,await job.demand({...source,expectedSha256:body.expectedSha256,...(body.retry===true?{retry:true}:{})}));
 const file=await job.retainedGuideFile({...source,expectedSha256:body.expectedSha256});const {read,bytes,...meta}=file;
 return reply(200,file.state==='retained'?{...meta,file:{sha256:read.observation.sha256,bytes:read.observation.bytes,contentType:read.observation.contentType}}:meta);
}
