import {createHash} from 'node:crypto';
import {canonicalJSONString} from './contract.mjs';
import {createCanonicalGuideRecords,createGuideComposer,descriptorOf} from './source-associations/composer.mjs';
import {createGuideFragmentJob,guideFragmentIdentity,GUIDE_FRAGMENT_JOB,GUIDE_ACQUISITION_PROFILE,GUIDE_FRAGMENT_POLICY} from './guide-fragment.mjs';
import {SOURCE_ASSOCIATION_RECIPE,ASSOCIATION_SOURCE_SCHEMA,buildSourceIndex,associatePack} from './source-associations/index.mjs';
import {createCanonicalGuideReader} from './executable-presentation-resolver.mjs';
// The reviewed admission component for the first acquisition of an archive-pinned guide snapshot (Terry ANSWER-Q24-FIRST-
// ACQUISITION, cookbook eb4d8d5; CONTRACT Q24 as amended by cookbook PR268). It runs inside the guide object, with the trusted build
// snapshot the dispatch passes ({snapshot}, from FiaPreparationJobs.presentationExecutionCapabilities() in entry.mjs).
//
// - A demand names only a canonical selection: exactly {packId}, or {packId, retry: true}. Any caller URL, revision, sha,
//   fragment, descriptor, batch or polling key is refused, typed. One file per demand.
// - The source is composed from trusted canonical selection (the snapshot's canonicalSources guide record, read and re-hashed
//   through createCanonicalGuideReader) under the Q24 class rule: https://raw.githubusercontent.com/<owner>/<collection>/
//   <revision>/<sourceFile>, expected sha256 = the archive's sourceFileSha256. No other revision can be composed.
// - Tickets: sequence 1 with both prior fields null; a deliberate Retry only while no promoted head exists (the guide-fragment
//   job's ticket and Retry rules).
// - Eligibility is strict at every phase the primitive checks: true only when the source context equals the composed URL and
//   pinned publisher version, the snapshot row is still the one the descriptor came from, the record is a `source` provenance
//   record of an allowed class-A collection, and any observed sha equals the archive's.
// - Once a promoted head exists, any further check (a Retry, or a head whose sha differs from the current descriptor) is a typed
//   refresh-unavailable: the Q14 guide-text refresh seam is not built. A warm demand only verifies the retained head (no fetch).
// - /fragment {packId} is read-only: the same canonical selection and refusals as /demand (no retry), then the composer's
//   composeRetained over this object's retained head. It never demands, writes or fetches; a file that is not retained is a typed
//   guide-not-retained. It answers plain JSON: the receipt's metadata and the pack's paragraphs as {jsonPath, htmlSha256}. The
//   branded receipt never leaves this object. The association decisions are computed here too: buildSourceIndex and associatePack
//   over the pack's compiled inputs (the snapshot's associationSources row, read and re-hashed like a guide record; manifest,
//   resources and guide-units pinned by source-bindings.json at export) with the receipt as raw evidence. Without that row the
//   decisions are a typed unavailable, never an index built from the guide alone.
//   Every answer is the closed schema GUIDE_FRAGMENT_READ_SCHEMA with exactly the keys below, carrying what the runtime consumer
//   binds (Terry ANSWER-FRAGMENT-CROSS-OBJECT-AUTHORITY, cookbook 0a36cb2, bindings 2, 3 and 5): the source identity (logicalId, url,
//   publisherVersion), the producer policy revision and the index recipe, and the receipt's observation, file sha and descriptor.
//   It is evidence for the runtime's own re-verification, never authority on its own (binding 6: internal origin, object-id check).
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const refuse=(status,reason,subReason=null,extra={})=>reply(status,{job:GUIDE_FRAGMENT_JOB,state:'unavailable',reason,subReason,final:true,custody:'none',...extra});
export function admissionEligibility({url,descriptor,row,rowFor,guide}){
 return context=>{
  if(!context?.source||context.source.url!==url||context.source.sourceVersionKind!=='publisher-version'||context.source.sourceVersion!==descriptor.revision||context.source.publisherVersion!==descriptor.revision)return false;
  if(rowFor(guide.packId)!==row||guide.provenance?.status!=='source'||!GUIDE_ACQUISITION_PROFILE.collections.includes(descriptor.collection)||descriptor.owner!==GUIDE_ACQUISITION_PROFILE.owner)return false;
  if(context.observedContent&&context.observedContent.sha256!==descriptor.fileSha256)return false;
  return true;
 };
}
export async function serveGuideAdmission(request,ctx,env,snapshot){
 const op=new URL(request.url).pathname;if(request.method!=='POST'||!['/demand','/read','/fragment'].includes(op))return refuse(404,'guide-unknown-operation');
 let body;try{body=await request.json();}catch{return refuse(400,'guide-unsupported','guide-request-shape');}
 if(!body||typeof body!=='object'||Array.isArray(body))return refuse(400,'guide-unsupported','guide-request-shape');
 const keys=Object.keys(body);
 if(keys.some(k=>/^pack(?:Id)?s$|batch|poll|schedule|cron|interval/i.test(k)))return refuse(400,'guide-unsupported','guide-batch-refused');
 if(keys.some(k=>!['packId','retry'].includes(k)))return refuse(400,'guide-unsupported','guide-caller-authority',{fields:keys.filter(k=>!['packId','retry'].includes(k)).sort()});
 if(typeof body.packId!=='string'||!/^(eng|spa)\.(?:MRK|LUK)-[0-9-]+$/.test(body.packId)||body.retry!==undefined&&(body.retry!==true||op==='/fragment'))return refuse(400,'guide-unsupported','guide-request-shape');
 if(!env?.FIA_PREPARATION_JOBS||!env?.FIA_ORIGINALS||!env?.ASSETS)return refuse(503,'guide-admission-unavailable','guide-bindings');
 let records;try{records=createCanonicalGuideRecords({snapshot,fetchAsset:path=>env.ASSETS.fetch(new Request(new URL(path,env.FIA_API_ORIGIN),{redirect:'manual'}))});}catch{return refuse(503,'guide-admission-unavailable','guide-no-trusted-snapshot');}
 const loaded=await records.guideRecordFor(body.packId);if(loaded.refused)return refuse(404,'guide-unsupported',loaded.refused,{subSubReason:loaded.subReason??null});
 const descriptor=descriptorOf(loaded.guide);if(!descriptor)return refuse(422,'guide-unsupported','composer-descriptor-incomplete');
 const source={repo:`${descriptor.owner}/${descriptor.collection}`,revision:descriptor.revision,path:descriptor.path};
 let identity;try{identity=await guideFragmentIdentity(source);}catch{return refuse(422,'guide-unsupported','guide-source');}
 if(ctx.id.toString()!==env.FIA_PREPARATION_JOBS.idFromName(identity.name).toString())return refuse(403,'guide-object-identity');
 const eligibility=admissionEligibility({url:identity.url,descriptor,row:loaded.row,rowFor:records.rowFor,guide:loaded.guide}),job=createGuideFragmentJob({storage:ctx.storage,bucket:env.FIA_ORIGINALS,eligibility});
 const pinned={...source,expectedSha256:descriptor.fileSha256},base={packId:body.packId,descriptor};
 if(op==='/read'){const file=await job.retainedGuideFile(pinned);const {read,bytes,...meta}=file;return reply(200,{...base,...meta,...(file.state==='retained'?{file:{sha256:read.observation.sha256,bytes:read.observation.bytes,contentType:read.observation.contentType}}:{})});}
 if(op==='/fragment')return fragment(job,base,descriptor,identity,loaded,snapshot,env);
 const head=await job.promotedHead(source);
 if(head.exists&&(head.sourceSha256!==descriptor.fileSha256||body.retry===true))return refuse(409,'refresh-unavailable',head.sourceSha256!==descriptor.fileSha256?'guide-head-differs-from-descriptor':'guide-retry-after-head',base);
 return reply(200,{...base,...await job.demand({...pinned,...(body.retry===true?{retry:true}:{})})});
}
// The read-only fragment answer. The composer reads the guide record again through the trusted snapshot and must arrive at the same
// descriptor; its producer can only read the retained file (demand refuses), so no path here can acquire.
export const GUIDE_FRAGMENT_READ_SCHEMA='fia-guide-fragment-read@1';
export const GUIDE_FRAGMENT_READ_KEYS=Object.freeze({
 answer:Object.freeze(['schema','job','packId','descriptor','identity','policyRevision','recipe','state','reason','subReason','custody','receipt','paragraphs','associations']),
 identity:Object.freeze(['logicalId','url','publisherVersion']),
 receipt:Object.freeze(['schema','owner','collection','revision','path','fileSha256','bytes','contentType','observationSha256']),
 paragraph:Object.freeze(['jsonPath','htmlSha256']),
 associations:Object.freeze(['state','reason','subReason','indexSha256','decisions']),
});
// Every decision carries exactly these keys, null where its type has none: associatePack's own fields, plus the explicit consumer
// fields (contentId, jsonPath, htmlSha256, bindingSha256). A decision with any other key refuses the whole decision list.
export const GUIDE_FRAGMENT_DECISION_KEYS=Object.freeze(['packId','unitId','stepId','type','reason','kind','namespace','resourceId','contentId','jsonPath','htmlSha256','candidates','dependency','evidence','binding','bindingSha256']);
const DECISION_SOURCE_KEYS=new Set(['packId','unitId','stepId','type','reason','kind','namespace','resourceId','candidates','dependency','evidence','binding']);
const PARAGRAPHS_MAX=4096,hex=x=>createHash('sha256').update(x).digest('hex');
async function fragment(job,base,descriptor,identity,loaded,snapshot,env){
 const producer={demand:async()=>{throw Error('guide-fragment-read-only');},retainedGuideFile:source=>job.retainedGuideFile(source)};
 const fetchAsset=path=>env.ASSETS.fetch(new Request(new URL(path,env.FIA_API_ORIGIN),{redirect:'manual'})),composer=createGuideComposer({snapshot,fetchAsset,producer});
 const head={schema:GUIDE_FRAGMENT_READ_SCHEMA,job:GUIDE_FRAGMENT_JOB,packId:base.packId,descriptor,identity:{logicalId:identity.logicalId,url:identity.url,publisherVersion:descriptor.revision},policyRevision:GUIDE_FRAGMENT_POLICY.revision,recipe:SOURCE_ASSOCIATION_RECIPE};
 const answer=(status,fields)=>reply(status,{...head,reason:null,subReason:null,receipt:null,paragraphs:null,associations:null,...fields});
 const unavailable=(status,reason,subReason)=>answer(status,{state:'unavailable',reason,subReason:subReason??null,custody:'none'});
 const out=await composer.composeRetained(base.packId);
 if(out.state!=='composed'){
  if(out.reason==='descriptor-mismatch'||out.reason==='guide-sha-mismatch')return unavailable(409,'descriptor-mismatch',out.reason);
  return unavailable(200,out.reason??'guide-not-retained',out.subReason);
 }
 if(Object.keys(descriptor).some(k=>out.descriptor[k]!==descriptor[k]||out.receipt[k]!==descriptor[k]))return unavailable(409,'descriptor-mismatch','fragment-descriptor-changed');
 const r=out.receipt,list=r.packs[base.packId]??[];if(list.length>PARAGRAPHS_MAX)return unavailable(422,'guide-unsupported','fragment-too-many-paragraphs');
 return answer(200,{state:'composed',custody:'retained',
  receipt:{schema:r.schema,owner:r.owner,collection:r.collection,revision:r.revision,path:r.path,fileSha256:r.fileSha256,bytes:r.bytes,contentType:r.contentType,observationSha256:r.observationSha256},
  paragraphs:list.map(x=>({jsonPath:x.jsonPath,htmlSha256:hex(x.html)})),
  associations:await associations(r,base.packId,loaded,snapshot,fetchAsset)});
}
const ASSOCIATION_KEYS=['schema','packId','sourceRevision','manifest','resources','guide-units','inventory'];
async function associations(receipt,packId,loaded,snapshot,fetchAsset){
 const none=(reason,subReason=null)=>({state:'unavailable',reason,subReason,indexSha256:null,decisions:null});
 const rows=snapshot?.associationSources;if(!Array.isArray(rows)||!rows.some(x=>x?.packId===packId&&x?.sourceRevision===loaded.row.sourceRevision))return none('association-inputs-unavailable','association-source-row');
 let payload;try{const {bytes}=await createCanonicalGuideReader({canonicalSources:rows,fetchAsset})({packId,sourceRevision:loaded.row.sourceRevision});payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 catch(error){return none('association-inputs-unavailable',error?.code??error?.message??'association-source-read');}
 if(!payload||Object.keys(payload).sort().join()!==[...ASSOCIATION_KEYS].sort().join()||payload.schema!==ASSOCIATION_SOURCE_SCHEMA||payload.packId!==packId||payload.sourceRevision!==loaded.row.sourceRevision||!Array.isArray(payload.inventory))return none('association-inputs-unavailable','association-source-shape');
 let index,decisions;try{index=buildSourceIndex([{revision:payload.sourceRevision,inventory:payload.inventory,packs:{[packId]:{guide:loaded.guide,manifest:payload.manifest,resources:payload.resources,'guide-units':payload['guide-units']}}}],{raw:[receipt]});decisions=associatePack(index,packId);}
 catch(error){return none('association-index-refused',error?.message??null);}
 // Each decision carries, explicitly, what the runtime consumer binds: unitId, namespace, contentId, the raw paragraph's jsonPath and
 // htmlSha256 (null when the decision has no raw anchor), and bindingSha256 = sha256 of the canonical binding. The binding covers the
 // unit text and HTML hashes, the reference hash (namespace, contentId, label, unit HTML) and the raw fragment's HTML hash, from which
 // the paragraph's text hash and typed refs are derived, so those are not repeated.
 if(decisions.some(d=>Object.keys(d).some(k=>!DECISION_SOURCE_KEYS.has(k))||!d.binding))return none('association-index-refused','decision-unknown-key');
 const closed=d=>({...Object.fromEntries(GUIDE_FRAGMENT_DECISION_KEYS.map(k=>[k,d[k]??null])),contentId:d.evidence?.contentId??null,jsonPath:d.evidence?.rawJsonPath??null,htmlSha256:d.evidence?.rawFragmentSha256??null,bindingSha256:hex(canonicalJSONString(d.binding))});
 return {state:'composed',reason:null,subReason:null,indexSha256:index.indexSha256,decisions:decisions.map(closed)};
}
