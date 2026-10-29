import {createApprovedAudioBindings} from './approved-audio-bindings.mjs';
import {createRetainedApprovedAudio,serveApprovedAudio} from './approved-audio-runtime.mjs';
import {readStaticArtifact} from '../../faces/worker/snapshot.mjs';
import {snapshotStorage} from '../../faces/worker/snapshot.mjs';
import {createReadOperations} from '../publication/read-operations.mjs';
import {createExecutableOverlay} from '../publication/executable-overlay.mjs';
import {createExecutableOperations} from '../publication/executable-operations.mjs';
import {createExecutablePresentationService} from './executable-presentation-service.mjs';
import {createExecutablePresentationResolver,createCanonicalGuideReader} from './executable-presentation-resolver.mjs';
import {createTrustedSourceActionComposer,trustedExecutionRecipe} from './trusted-source-actions.mjs';
import {createSourceJoinReader,fragmentPort,createGuideAcquisition,guideDemandPort,createGuideDescriptorKey} from './source-join-decisions.mjs';
import {SOURCE_ACTION_RECIPE} from '../compiler/presentation/source-action-projector.mjs';
import guideSources from './guide-sources.json' with {type:'json'};
import preparationCatalog from './catalog.json' with {type:'json'};
import {eligibleRows,resolveSelection} from './service.mjs';
import {canonicalJSONString,sha256} from './contract.mjs';
const encode=x=>new TextEncoder().encode(canonicalJSONString(x)),same=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b);
const ROOT='fia-executable-presentation-authority@1',PATH='/_executable-presentation/';
export const EXECUTION_POLICY='fia-source-to-app/7fa17af806c139cfc353cace39fa6d50ed9e061b';
// The finite registry of released execution builds. Each is named by the literal policy
// and recipe its jobs wrote, never by a value computed from today's code or content:
// today's policy hashes the approved-audio proof index, so a content release moves it,
// and a code release may move EXECUTION_POLICY or the recipe. Append a build; never edit
// or drop one, because DEV holds rows under every name here.
// 1. aad92a4 (#187/#188): no proof index, so sha256(EXECUTION_POLICY), under @1.
// 2. The builds through e7eb0f0: EXECUTION_POLICY bound to proof index d3be5884, under
//    @1, before #190 added flow roles.
// 3. The builds from 45a3248 (the #197 promotion): the same policy under @2.
// 4. The builds from #249 (Luke text published, catalog f5ce2e24): proof index 7140879c
//    (its authority names the new catalog), the same EXECUTION_POLICY, under @2.
// The registry is release bookkeeping (execution-registry.test.mjs). Reads no longer
// authenticate rows by it: a row under a superseded build is a cache miss served from
// the base, and an explicit Open re-prepares under today's build.
export const SUPERSEDED_BUILDS=Object.freeze([
 {policy:'35e074a65296fbb4743e17bfe28f52b7e0e2b8b558c7a0d4a5fb7ceecad85a47',recipe:'fia-server-source-action-projector@1',approvedAudio:false},
 {policy:'9a7733f5139e9cf7352bfe4018f3164715e69abc9eba3776052bdc324f33295c',recipe:'fia-server-source-action-projector@1',approvedAudio:true},
 {policy:'9a7733f5139e9cf7352bfe4018f3164715e69abc9eba3776052bdc324f33295c',recipe:'fia-server-source-action-projector@2',approvedAudio:true},
 {policy:'85233c7eae23efb5ad52150a1232600ad4376e8a865173bc8a62208cc6fe6a9d',recipe:'fia-server-source-action-projector@2',approvedAudio:true},
].map(build=>Object.freeze(build)));
const need=(x,r)=>{if(!x)throw Error(r);};
async function bounded(run,ms=15000){let timer;try{return await Promise.race([Promise.resolve().then(run),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('execution-storage-timeout')),ms);})]);}finally{clearTimeout(timer);}}
function artifactPort(bucket){return {
 async write(bytes){need(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=1048576,'execution-artifact-size');const digest=await sha256(bytes),reference=`preparation/executable/${digest}.json`;await bounded(()=>bucket.put(reference,bytes,{onlyIf:{etagDoesNotMatch:'*'}}));const retained=await bounded(()=>bucket.get(reference));need(retained&&retained.size===bytes.length,'execution-artifact-readback');const stored=new Uint8Array(await bounded(()=>retained.arrayBuffer()));need(stored.length===bytes.length&&await sha256(stored)===digest,'execution-artifact-corrupt');return {reference,sha256:digest};},
 async read(d){need(d.reference===`preparation/executable/${d.sha256}.json`,'execution-artifact-path');const item=await bounded(()=>bucket.get(d.reference));need(item&&item.size>0&&item.size<=1048576,'execution-artifact-missing');const bytes=new Uint8Array(await bounded(()=>item.arrayBuffer()));need(bytes.length===item.size&&await sha256(bytes)===d.sha256,'execution-artifact-integrity');return bytes;}
};}
async function originalBindings(context){
 const boundArtifacts=[],narrationBindings={};
 for(const activity of context.basePresentation.activities){
  // This is exact publisher inventory correspondence, not semantic inference or
  // a per-passage admission. Unsupported original coverage stays explicit.
  const source=guideSources.rows.find(r=>r.packId===context.basePresentation.id&&r.presentationRevision===context.baseRevision&&r.sourceUnits.some(u=>u.sourceUnitId===activity.sourceUnitId&&u.sourceTextSha256===activity.sourceSha256));
  if(!source||!['guide','discussion'].includes(activity.kind))continue;
  const identity={packId:context.basePresentation.id,presentationRevision:context.baseRevision,language:context.language,edition:'fia-guide',quality:'original',activityId:activity.id,sourceUnitId:activity.sourceUnitId,sourceTextSha256:activity.sourceSha256};
  if(!eligibleRows(preparationCatalog).some(row=>resolveSelection(identity,{entries:[row]}))){narrationBindings[activity.id]={action:'blocked',status:'unavailable',reason:'original-preparation-not-installed'};continue;}
  const id=`source-narration:${activity.id}`,bytes=encode({schema:'fia-bound-narration-demand@1',id,identity}),digest=await sha256(bytes);boundArtifacts.push({id,bytes,sha256:digest});narrationBindings[activity.id]={action:'prepare-original',demand:{id,sha256:digest}};
 }
 return {boundArtifacts,narrationBindings};
}
export async function createExecutableRuntime({ctx,env,snapshot,capabilities={}}){
 const base=snapshotStorage(snapshot,{fetchAsset:path=>env.ASSETS.fetch(new Request(new URL(path,env.FIA_API_ORIGIN),{redirect:'manual'}))}),baseReads=createReadOperations(base),artifacts=artifactPort(env.FIA_ORIGINALS),policySha256=await sha256(snapshot.approvedAudioProofIndex?canonicalJSONString({policy:EXECUTION_POLICY,approvedAudio:snapshot.approvedAudioProofIndex}):EXECUTION_POLICY);
 // A demand binds a base artifact to the canonical source it was compiled from. The
 // approved original presentation (eng.MRK-1-1-13) has its own lineage and is not
 // projectable from that source, so it is neither offered nor admitted.
 const preparable=(record,sourceRevision)=>record?.authority?.rawInventoryCommit===sourceRevision&&record.artifactSource?.sourceCommit===sourceRevision&&snapshot.canonicalSources?.some(s=>s.packId===record.packId&&s.sourceRevision===sourceRevision);
 const eligible=async args=>{const record=await base.readCatalog(args.packId,args.baseRevision);return record?.status==='ready'&&record.revision===args.baseRevision&&record.packId===args.packId&&preparable(record,args.sourceRevision)&&(!capabilities.eligible||await capabilities.eligible(args)===true);};
 // This immutable descriptor is release authority; no caller or runtime discovery
 // can add proof entries. Only explicit preparation registers a retained binding.
 const readDependency=async d=>{const item=await bounded(()=>readStaticArtifact({staticPath:d.path,descriptor:d},path=>env.ASSETS.fetch(new Request(new URL(path,env.FIA_API_ORIGIN),{redirect:'manual'}))));need(typeof item.content==='string','approved-audio-proof-unavailable');return new TextEncoder().encode(item.content);};
 let approved=null,retained=null,index=null;
 if(snapshot.approvedAudioProofIndex){
  const d=snapshot.approvedAudioProofIndex;
  need(d.id==='approved-audio-proof-index'&&d.path===`/content/approved-audio/${d.sha256}.json`&&d.mime==='application/json'&&Number.isSafeInteger(d.bytes)&&d.bytes>0&&d.bytes<=1048576,'approved-audio-index-descriptor');
  index=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readDependency(d)));
  need(index.authority?.registrySha256===snapshot.generalizedAuthority?.catalog?.sha256&&index.authority?.sourceRevision===snapshot.generalizedAuthority?.sourceCommit,'approved-audio-index-authority');
  retained=createRetainedApprovedAudio({bucket:env.FIA_ORIGINALS,validateBinding:binding=>approved.validateBinding(binding)});
  approved=createApprovedAudioBindings({index,readDependency,readRetained:retained.readRetained,eligible:async binding=>(await base.readCatalog(binding.packId)).revision===binding.baseRevision&&await eligible(binding)});
 }
 const resolveBindings=capabilities.resolveBindings??(async context=>{
  const original=await originalBindings(context);if(!approved)return original;
  const next=await approved.resolve(context);
  for(const binding of next.bindings)need((await retained.registerBinding(binding)).status==='ready','approved-audio-registration');
  return {narrationBindings:{...original.narrationBindings,...next.narrationBindings},boundArtifacts:[...original.boundArtifacts,...next.boundArtifacts]};
 });
 const currentPolicy=capabilities.policySha256??policySha256;
 // Cookbook claim 18841a7: the same trusted composer also admits the pinned source-association joins, read from the guide fragment
 // object's internal read-only /fragment op (PR308) and re-verified here (source-join-decisions.mjs). Without the object namespace or
 // a trusted snapshot there is no reader, and the composer decides from trusted metadata alone, exactly as before.
 const assetFetch=path=>env.ASSETS.fetch(new Request(new URL(path,env.FIA_API_ORIGIN),{redirect:'manual'})),readFragment=capabilities.readFragment??fragmentPort(env);
 const joinReader=Array.isArray(snapshot?.canonicalSources)&&readFragment?createSourceJoinReader({snapshot,fetchAsset:assetFetch,readFragment}):null;
 // The first acquisition of the pinned guide file runs once per explicit preparation, before the resolver (and so outside its
 // 10 s steps), bounded by the acquisition profile's deadline. Reads never acquire: the resolver runs only for a preparation.
 const demandGuide=capabilities.demandGuide??guideDemandPort(env);
 const acquireGuide=joinReader&&demandGuide?createGuideAcquisition({snapshot,fetchAsset:assetFetch,demandGuide,...(capabilities.acquisitionDeadlineMs?{deadlineMs:capabilities.acquisitionDeadlineMs}:{}),diagnose:event=>(capabilities.diagnose??(e=>console.warn(JSON.stringify(e))))(event)}):null;
 // Only a retained acquisition lets this Open read the fragment (Otto, 9e3f243): any other outcome is base for this Open, typed.
 const acquired=new Map();
 const sourceJoins=joinReader&&(acquireGuide?Object.freeze({async joinsFor(packId){const a=acquired.get(packId);return a?.state==='retained'?joinReader.joinsFor(packId):{state:'unavailable',reason:'guide-not-acquired',...(a?.reason?{subReason:a.reason}:{})};}}):joinReader);
 const resolver=capabilities.resolve??createExecutablePresentationResolver({reads:baseReads,resolveCanonicalSource:createCanonicalGuideReader({canonicalSources:snapshot.canonicalSources??[],fetchAsset:path=>env.ASSETS.fetch(new Request(new URL(path,env.FIA_API_ORIGIN),{redirect:'manual'}))}),composeDecisionInputs:capabilities.composeDecisionInputs??createTrustedSourceActionComposer({policySha256:currentPolicy,sourceJoins}),resolveBindings});
 const resolve=acquireGuide&&!capabilities.resolve?async args=>{if(typeof args?.packId==='string'){const outcome=await acquireGuide(args.packId);acquired.set(args.packId,outcome);
  // Terry 85eff6a (C1), remedy (ii): the publication may serve base, and the join's outcome is recorded beside it, keyed by the
  // pack, its base revision, the acquisition's descriptor key and this recipe. The current read re-offers the demand while the miss
  // is non-final, or once a final miss's descriptor or recipe moved; only an explicit Open demands again. No read demands.
  if(outcome.state!=='not-applicable'&&typeof args.baseRevision==='string')await ctx.storage.put(joinOutcomeKey(args.packId,args.baseRevision),{...outcome,recipe:recipeRevision});}
  return resolver(args);}:resolver;
 const recipeRevision=trustedExecutionRecipe(SOURCE_ACTION_RECIPE,{sourceJoins:!capabilities.composeDecisionInputs&&!!sourceJoins});
 const joinOutcomeKey=(packId,baseRevision)=>`source-join-outcome:${packId}@${baseRevision}`;
 const descriptorKey=acquireGuide?createGuideDescriptorKey({snapshot,fetchAsset:assetFetch}):null;
 // A recorded non-final miss, or a final one whose keyed descriptor or recipe moved, does not settle the current publication.
 const settledJoin=async record=>{
  if(!acquireGuide||typeof ctx.storage.get!=='function')return true;const base=record.execution?.baseRevision;if(typeof base!=='string')return true;
  // Review 5700626016 N1: a record with no stored outcome (prepared before outcomes were recorded, e.g. on 4da564b or 1f2c559) is not
  // settled either: the current read re-offers the demand, and the next explicit Open demands.
  const outcome=await ctx.storage.get(joinOutcomeKey(record.packId,base));if(!outcome)return false;if(outcome.state==='retained')return true;
  if(!outcome.final||outcome.recipe!==recipeRevision)return false;
  const current=await descriptorKey(record.packId);return !!current&&current.fileSha256===outcome.fileSha256&&current.revision===outcome.revision;
 };
 const service=createExecutablePresentationService({storage:ctx.storage,artifacts,resolve,eligible,interpret:capabilities.interpret??null,policySha256:currentPolicy,recipeRevision});
 // Earlier builds' rows still authenticate for exact-revision reads (pinned Active and Saved sessions; OFFLINE L96, Terry
 // 4178e01 point 4); the current read treats them as a cache miss below. Those builds are: the one just before trusted source
 // actions (the bare recipe), and, once source joins are wired, the trusted build without the join fold. These services only read.
 const priorRecipes=[...new Set([trustedExecutionRecipe(SOURCE_ACTION_RECIPE),SOURCE_ACTION_RECIPE])].filter(r=>r!==recipeRevision);
 const priors=priorRecipes.map(r=>createExecutablePresentationService({storage:ctx.storage,artifacts,resolve,eligible,interpret:capabilities.interpret??null,policySha256:currentPolicy,...(r===SOURCE_ACTION_RECIPE?{}:{recipeRevision:r})}));
 const jobs={read:async args=>{let outcome=null,failure=null;try{outcome=await service.read(args);}catch(error){if(!priors.length)throw error;failure=error;}if(outcome?.status==='ready'||!priors.length)return outcome;
  for(const prior of priors){try{const earlier=await prior.read(args);if(earlier.status==='ready')return earlier;outcome??=earlier;}catch(error){failure??=error;}}
  if(outcome)return outcome;throw failure;}};
 if(typeof ctx.storage.list==='function'){
  const retained=await ctx.storage.list({prefix:'executable-presentation:job:'});
  await service.recoverInterrupted({jobIds:[...retained.values()].map(row=>row.jobId)});
 }
 // One verifier per build: the job's outcome must reproduce the publication exactly.
 // Approved-audio artifacts exist only under a proof-index policy; the #187/#188 build
 // admitted bound narration demands alone.
 const verifier=(jobs,approvedAudio)=>async candidate=>{
  const outcome=await jobs.read({jobId:candidate.provenance.jobId});
  if(outcome.status!=='ready'||!same(outcome.presentation,candidate.presentation)||!same(outcome.provenance,(({jobId,...rest})=>rest)(candidate.provenance))||!same(outcome.boundArtifacts.map(a=>({id:a.id,sha256:a.sha256})),candidate.boundArtifacts.map(a=>({id:a.id,sha256:a.sha256}))))return false;
  for(const artifact of outcome.boundArtifacts){const bound=JSON.parse(new TextDecoder().decode(artifact.bytes));if(capabilities.validateNarration){if(await capabilities.validateNarration(bound)!==true)return false;}else if(bound.schema==='fia-bound-narration-audio@1'&&approvedAudio&&approved){
    let admitted=null;for(const row of index.bindings){if(same(bound,await approved.expectedArtifact(row))){admitted=row;break;}}
    if(!admitted||admitted.packId!==candidate.presentation.id||admitted.baseRevision!==candidate.provenance.baseRevision||!await approved.validateBinding(admitted))return false;
    const consumers=candidate.presentation.activities.filter(a=>a.execution?.narration?.artifact?.id===bound.id);
    if(!consumers.length||consumers.some(a=>a.kind!==admitted.assetKind||a.assetId!==admitted.assetId))return false;
    if(!(await retained.read({bindingSHA:bound.id.slice('approved-audio:'.length),mediaSHA:admitted.media.sha256,extension:admitted.media.extension})).bytes)return false;
   }else if(bound.schema!=='fia-bound-narration-demand@1'||!eligibleRows(preparationCatalog).some(row=>resolveSelection(bound.identity,{entries:[row]})))return false;}
  return true;
 };
 // Cache misses are bookkeeping only (cookbook package-luke RULING.md § DEV publication
 // conflict): one structured log line per miss, never a change to the answer.
 const diagnose=capabilities.diagnose??(event=>console.warn(JSON.stringify(event)));
 const publication=createExecutableOverlay({storage:ctx.storage,artifacts,base,eligible,validate:verifier(jobs,true),diagnose});
 const reads=createReadOperations(publication),readPack=reads.readPack;
 // A row under a superseded build fails its verifier, so the overlay already serves the
 // base (cache miss); the base read gains its demand here, and an explicit Open
 // re-prepares under today's build.
 reads.readPack=async args=>{let record=await readPack(args);if(record?.status==='ready'&&record.execution&&!args.revision&&(record.execution.provenance?.recipeRevision!==recipeRevision||!await settledJoin(record)))record=await baseReads.readPack({packId:args.packId});if(record?.status!=='ready'||record.execution)return record;const sourceRevision=record.authority?.rawInventoryCommit;if(record.packId===args.packId&&preparable(record,sourceRevision))return {...record,preparationDemand:{packId:args.packId,baseRevision:record.revision,sourceRevision,capability:'executable-presentation'}};return record;};
 const ops=createExecutableOperations({reads,service,publication,storage:ctx.storage});
 return {...ops,readApprovedAudio:selected=>retained?retained.read(selected):{status:'unavailable',reason:'approved-audio-unavailable'}};
}
export function createExecutableWorkerOperations({env,fallback}){
 if(!env.FIA_PREPARATION_JOBS||!env.FIA_ORIGINALS)return fallback;
 const call=async(operation,args)=>{const stub=env.FIA_PREPARATION_JOBS.get(env.FIA_PREPARATION_JOBS.idFromName(ROOT));const response=await stub.fetch(new Request(`https://preparation.internal${PATH}${operation}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)}));if(!response.ok)throw Error('executable-authority-unavailable');return response.json();};
 return Object.fromEntries(['readPack','readArtifact','preparePresentation','readPresentationPreparation'].map(operation=>[operation,args=>call(operation,args)]));
}
export async function serveExecutableObject(request,ctx,env,capabilities,runtime){
 const url=new URL(request.url);
 if(url.pathname.startsWith('/_approved-audio/')){
  need(url.origin==='https://preparation.internal'&&ctx.id.toString()===env.FIA_PREPARATION_JOBS.idFromName(ROOT).toString(),'execution-object-custody');
  const ops=await runtime();return serveApprovedAudio(request,{read:ops.readApprovedAudio,origin:'https://preparation.internal',pathPrefix:'/_approved-audio'});
 }
 if(!url.pathname.startsWith(PATH))return null;
 need(url.origin==='https://preparation.internal'&&request.method==='POST'&&!url.search&&ctx.id.toString()===env.FIA_PREPARATION_JOBS.idFromName(ROOT).toString(),'execution-object-custody');
 const operation=url.pathname.slice(PATH.length);need(['readPack','readArtifact','preparePresentation','readPresentationPreparation'].includes(operation),'execution-operation');
 need(capabilities?.snapshot&&env.FIA_ORIGINALS,'execution-runtime-unavailable');
 const text=await request.text();need(new TextEncoder().encode(text).length<=16384,'execution-request-size');
 const ops=await runtime(),result=await ops[operation](JSON.parse(text));return Response.json(result);
}

/** Forward binary responses to the existing root DO without JSON expansion. */
export async function serveApprovedAudioWorker(request,env){
 const url=new URL(request.url);if(!url.pathname.startsWith('/v1/approved-audio/'))return null;
 // The generic handler enforces the public boundary before invoking this read.
 return serveApprovedAudio(request,{origin:env.FIA_API_ORIGIN,read:async selected=>{
  if(!env.FIA_PREPARATION_JOBS||!env.FIA_ORIGINALS)return {status:'unavailable'};
  const stub=env.FIA_PREPARATION_JOBS.get(env.FIA_PREPARATION_JOBS.idFromName(ROOT));
  let response,reader;const controller=new AbortController();
  const cancel=()=>{try{Promise.resolve(reader?reader.cancel():response?.body?.cancel()).catch(()=>{});}catch{}};
  try{return await bounded(async()=>{
   response=await stub.fetch(new Request(`https://preparation.internal/_approved-audio/${selected.bindingSHA}/${selected.mediaSHA}.${selected.extension}`,{signal:controller.signal}));
   if(response.status!==200){cancel();return {status:'unavailable'};}
   const length=Number(response.headers.get('Content-Length'));
   need(Number.isSafeInteger(length)&&length>0&&length<=16777216&&response.body,'approved-audio-proxy-size');
   reader=response.body.getReader();const parts=[];let total=0;
   for(;;){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;need(total<=length,'approved-audio-proxy-size');parts.push(part.value);}
   need(total===length,'approved-audio-proxy-size');const bytes=new Uint8Array(total);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
   return {status:'ready',bytes,media:{sha256:selected.mediaSHA,extension:selected.extension,mime:response.headers.get('Content-Type'),bytes:length}};
  });}finally{controller.abort();cancel();}

 }});
}
