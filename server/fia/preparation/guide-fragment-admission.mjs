import {createCanonicalGuideRecords,descriptorOf} from './source-associations/composer.mjs';
import {createGuideFragmentJob,guideFragmentIdentity,GUIDE_FRAGMENT_JOB,GUIDE_ACQUISITION_PROFILE} from './guide-fragment.mjs';
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
 const op=new URL(request.url).pathname;if(request.method!=='POST'||!['/demand','/read'].includes(op))return refuse(404,'guide-unknown-operation');
 let body;try{body=await request.json();}catch{return refuse(400,'guide-unsupported','guide-request-shape');}
 if(!body||typeof body!=='object'||Array.isArray(body))return refuse(400,'guide-unsupported','guide-request-shape');
 const keys=Object.keys(body);
 if(keys.some(k=>/^pack(?:Id)?s$|batch|poll|schedule|cron|interval/i.test(k)))return refuse(400,'guide-unsupported','guide-batch-refused');
 if(keys.some(k=>!['packId','retry'].includes(k)))return refuse(400,'guide-unsupported','guide-caller-authority',{fields:keys.filter(k=>!['packId','retry'].includes(k)).sort()});
 if(typeof body.packId!=='string'||!/^(eng|spa)\.(?:MRK|LUK)-[0-9-]+$/.test(body.packId)||body.retry!==undefined&&body.retry!==true)return refuse(400,'guide-unsupported','guide-request-shape');
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
 const head=await job.promotedHead(source);
 if(head.exists&&(head.sourceSha256!==descriptor.fileSha256||body.retry===true))return refuse(409,'refresh-unavailable',head.sourceSha256!==descriptor.fileSha256?'guide-head-differs-from-descriptor':'guide-retry-after-head',base);
 return reply(200,{...base,...await job.demand({...pinned,...(body.retry===true?{retry:true}:{})})});
}
