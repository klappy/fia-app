import {snapshotStorage} from '../../faces/worker/snapshot.mjs';
import {createReadOperations} from '../publication/read-operations.mjs';
import {createExecutableOverlay} from '../publication/executable-overlay.mjs';
import {createExecutableOperations} from '../publication/executable-operations.mjs';
import {createExecutablePresentationService} from './executable-presentation-service.mjs';
import {createExecutablePresentationResolver,createCanonicalGuideReader} from './executable-presentation-resolver.mjs';
import guideSources from './guide-sources.json' with {type:'json'};
import preparationCatalog from './catalog.json' with {type:'json'};
import {eligibleRows,resolveSelection} from './service.mjs';
import {canonicalJSONString,sha256} from './contract.mjs';
const encode=x=>new TextEncoder().encode(canonicalJSONString(x)),same=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b);
const ROOT='fia-executable-presentation-authority@1',PATH='/_executable-presentation/';
export const EXECUTION_POLICY='fia-source-to-app/7fa17af806c139cfc353cace39fa6d50ed9e061b';
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
 const base=snapshotStorage(snapshot,{fetchAsset:path=>env.ASSETS.fetch(new Request(new URL(path,env.FIA_API_ORIGIN),{redirect:'manual'}))}),baseReads=createReadOperations(base),artifacts=artifactPort(env.FIA_ORIGINALS),policySha256=await sha256(EXECUTION_POLICY);
 const eligible=async args=>{const record=await base.readCatalog(args.packId,args.baseRevision);return record?.status==='ready'&&record.revision===args.baseRevision&&record.authority?.rawInventoryCommit===args.sourceRevision&&snapshot.canonicalSources?.some(s=>s.packId===args.packId&&s.sourceRevision===args.sourceRevision)&&(!capabilities.eligible||await capabilities.eligible(args)===true);};
 const resolve=capabilities.resolve??createExecutablePresentationResolver({reads:baseReads,resolveCanonicalSource:createCanonicalGuideReader({canonicalSources:snapshot.canonicalSources??[],fetchAsset:path=>env.ASSETS.fetch(new Request(new URL(path,env.FIA_API_ORIGIN),{redirect:'manual'}))}),composeDecisionInputs:capabilities.composeDecisionInputs??null,resolveBindings:capabilities.resolveBindings??originalBindings});
 const service=createExecutablePresentationService({storage:ctx.storage,artifacts,resolve,eligible,interpret:capabilities.interpret??null,policySha256:capabilities.policySha256??policySha256});
 if(typeof ctx.storage.list==='function'){
  const retained=await ctx.storage.list({prefix:'executable-presentation:job:'});
  await service.recoverInterrupted({jobIds:[...retained.values()].map(row=>row.jobId)});
 }
 const publication=createExecutableOverlay({storage:ctx.storage,artifacts,base,eligible,validate:async candidate=>{
  const outcome=await service.read({jobId:candidate.provenance.jobId});
  if(outcome.status!=='ready'||!same(outcome.presentation,candidate.presentation)||!same(outcome.provenance,(({jobId,...rest})=>rest)(candidate.provenance))||!same(outcome.boundArtifacts.map(a=>({id:a.id,sha256:a.sha256})),candidate.boundArtifacts.map(a=>({id:a.id,sha256:a.sha256}))))return false;
  for(const artifact of outcome.boundArtifacts){const bound=JSON.parse(new TextDecoder().decode(artifact.bytes));if(capabilities.validateNarration){if(await capabilities.validateNarration(bound)!==true)return false;}else if(bound.schema!=='fia-bound-narration-demand@1'||!eligibleRows(preparationCatalog).some(row=>resolveSelection(bound.identity,{entries:[row]})))return false;}
  return true;
 }});
 const reads=createReadOperations(publication),readPack=reads.readPack;
 reads.readPack=async args=>{const record=await readPack(args);if(record?.status!=='ready'||record.execution)return record;const sourceRevision=record.authority?.rawInventoryCommit;if(snapshot.canonicalSources?.some(s=>s.packId===args.packId&&s.sourceRevision===sourceRevision))return {...record,preparationDemand:{packId:args.packId,baseRevision:record.revision,sourceRevision,capability:'executable-presentation'}};return record;};
 const ops=createExecutableOperations({reads,service,publication,storage:ctx.storage});
 return ops;
}
export function createExecutableWorkerOperations({env,fallback}){
 if(!env.FIA_PREPARATION_JOBS||!env.FIA_ORIGINALS)return fallback;
 const call=async(operation,args)=>{const stub=env.FIA_PREPARATION_JOBS.get(env.FIA_PREPARATION_JOBS.idFromName(ROOT));const response=await stub.fetch(new Request(`https://preparation.internal${PATH}${operation}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)}));if(!response.ok)throw Error('executable-authority-unavailable');return response.json();};
 return Object.fromEntries(['readPack','readArtifact','preparePresentation','readPresentationPreparation'].map(operation=>[operation,args=>call(operation,args)]));
}
export async function serveExecutableObject(request,ctx,env,capabilities,runtime){
 const url=new URL(request.url);if(!url.pathname.startsWith(PATH))return null;
 need(url.origin==='https://preparation.internal'&&request.method==='POST'&&!url.search&&ctx.id.toString()===env.FIA_PREPARATION_JOBS.idFromName(ROOT).toString(),'execution-object-custody');
 const operation=url.pathname.slice(PATH.length);need(['readPack','readArtifact','preparePresentation','readPresentationPreparation'].includes(operation),'execution-operation');
 need(capabilities?.snapshot&&env.FIA_ORIGINALS,'execution-runtime-unavailable');
 const text=await request.text();need(new TextEncoder().encode(text).length<=16384,'execution-request-size');
 const ops=await runtime(),result=await ops[operation](JSON.parse(text));return Response.json(result);
}
