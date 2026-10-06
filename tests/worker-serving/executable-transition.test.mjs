import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {buildGeneralizedSnapshot} from '../../server/fia/publication/generalized.mjs';
import {exportGuideSources} from '../../server/fia/compiler/presentation/export-guide-sources.mjs';
import {buildApprovedAudioProofIndex} from '../../scripts/approved-audio-proof-index.mjs';
import {SOURCE_ACTION_RECIPE} from '../../server/fia/compiler/presentation/source-action-projector.mjs';
import {createExecutionTransport} from '../../apps/web/src/lib/execution-transport.js';
import {selectServerPresentation} from '../../apps/web/src/lib/library.js';
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json')),{build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://dev.fiaguide.app',publicRoot='apps/web/public';

const projectorPath=resolve('server/fia/compiler/presentation/source-action-projector.mjs');
// The release before #190 projected under fia-server-source-action-projector@1 and
// emitted no fia-flow-role@1. It is replayed from the current module with only those
// two facts changed, so the rows it leaves are the rows DEV holds today.
async function priorProjector(){
 const source=await readFile(projectorPath,'utf8'),declared=/export const SOURCE_ACTION_RECIPE='fia-server-source-action-projector@\d+';/;
 assert.match(source,declared);assert.notEqual(SOURCE_ACTION_RECIPE,'fia-server-source-action-projector@1','the current recipe supersedes @1');
 return source.replace(declared,"export const SOURCE_ACTION_RECIPE='fia-server-source-action-projector@1';").replace(/a\.flow=flowFor\([^;]*\);for\(const derived of additions\)derived\.flow=flowFor\([^;]*\);/,'');
}

// One persisted Durable Object/R2 state across two releases: the first without an
// approved-audio proof index (the PR #188 policy), the second with it (PR #189).
// This is the DEV transition that left eng.MRK-1-14-20 refused with
// execution-job-policy, and the default passage answering 500 on Open.
async function releases(){
 const dir=await mkdtemp(join(tmpdir(),'fia-executable-transition-')),authority=JSON.parse(await readFile('server/fia/publication/trusted-generalized.json')),extension=buildGeneralizedSnapshot(publicRoot,authority),canonicalSources=exportGuideSources({outputRoot:dir,sourceRevision:authority.sourceCommit});
 const proof=await buildApprovedAudioProofIndex({publicRoot,authority:{registrySha256:authority.catalog.sha256,sourceRevision:authority.sourceCommit}});
 const base={schema:'fia.worker-read-snapshot.v1',records:extension.records,current:extension.current,staticArtifacts:extension.staticArtifacts,artifacts:[],canonicalSources,generalizedAuthority:extension.authority};
 const counts={external:0};
 async function runtime(snapshot,{projector=null}={}){
  // projector: the source-action projector source of an earlier release, bundled in
  // place of the current module so the persisted state carries that release's rows.
  const bundled=await build({entryPoints:[resolve('server/faces/worker/entry.mjs')],bundle:true,platform:'browser',format:'esm',external:['node:*'],write:false,plugins:[{name:'transition-snapshot',setup(b){b.onResolve({filter:/generated\/snapshot\.json$/},()=>({path:'snapshot',namespace:'transition'}));b.onLoad({filter:/.*/,namespace:'transition'},()=>({contents:JSON.stringify(snapshot),loader:'json'}));if(projector)b.onLoad({filter:/source-action-projector\.mjs$/},()=>({contents:projector,loader:'js',resolveDir:dirname(projectorPath)}));}}]});
  return new Miniflare({...convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{FIA_API_ORIGIN:origin},durableObjects:{FIA_PREPARATION_JOBS:{className:'FiaPreparationJobs',useSQLite:true}},r2Buckets:['FIA_ORIGINALS'],serviceBindings:{ASSETS:async request=>{const path=new URL(request.url).pathname;assert.ok(/^\/content\/[a-zA-Z0-9._/-]+$/.test(path)&&!path.includes('..'),path);let bytes;try{bytes=path===proof.descriptor.path?proof.bytes:await readFile((path.startsWith('/content/source-guides/')?dir:publicRoot)+path);}catch(error){if(error.code!=='ENOENT')throw error;return new Response('Not found',{status:404});}return new Response(bytes,{headers:{'Content-Type':'application/json','Content-Length':String(bytes.length)}});}},outboundService:()=>{counts.external++;throw Error('External work forbidden');}}),resourcePersistencePath:join(dir,'storage')});
 }
 const current={...base,approvedAudioProofIndex:proof.descriptor};
 return {dir,counts,before:()=>runtime(base),after:()=>runtime(current),priorRecipe:async()=>runtime(current,{projector:await priorProjector()})};
}
const http=mf=>async(path,init)=>{const r=await mf.dispatchFetch(origin+path,init);return {status:r.status,type:r.headers.get('content-type'),body:await r.json()};};
const prepare=(read,demand)=>read('/v1/presentation-preparations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(demand)});

test('a policy release never strands a published passage: the stale publication yields to its base and an explicit Open republishes',async()=>{
 const r=await releases();let mf=await r.before();
 try{
  let read=http(mf);const published={};
  for(const packId of ['eng.MRK-1-14-20','eng.MRK-1-21-28']){
   const base=await read('/v1/packs/'+packId);assert.equal(base.status,200);assert.ok(base.body.preparationDemand,packId);
   const ready=await prepare(read,base.body.preparationDemand);assert.equal(ready.status,200,JSON.stringify(ready.body));assert.equal(ready.body.status,'ready');
   published[packId]={demand:base.body.preparationDemand,revision:ready.body.record.revision};
   assert.equal((await read('/v1/packs/'+packId)).body.revision,ready.body.record.revision);
  }
  await mf.dispose();mf=await r.after();read=http(mf);
  for(const [packId,prior] of Object.entries(published)){
   const reopened=await read('/v1/packs/'+packId);
   assert.equal(reopened.status,200,`${packId}: ${JSON.stringify(reopened.body)}`);
   assert.equal(reopened.body.status,'ready');assert.equal(reopened.body.execution,undefined,'the superseded publication is not served as current');
   assert.deepEqual(reopened.body.preparationDemand,prior.demand,'an explicit Open can prepare it again under the current policy');
   const again=await prepare(read,reopened.body.preparationDemand);assert.equal(again.status,200,`${packId}: ${JSON.stringify(again.body)}`);assert.equal(again.body.status,'ready');
   const current=await read('/v1/packs/'+packId);assert.equal(current.status,200);assert.equal(current.body.revision,again.body.record.revision);assert.equal(current.body.execution.schema,'fia-executable-catalog@1');
   if(again.body.record.revision!==prior.revision)assert.equal((await read(`/v1/packs/${packId}?revision=${prior.revision}`)).status,404,'the exact superseded revision stays unavailable');
  }
  assert.equal(r.counts.external,0);
 }finally{await mf.dispose();await rm(r.dir,{recursive:true,force:true});}
});

// #190 moved the projector to fia-server-source-action-projector@2. Job and publication
// rows written under @1 now read as execution-job-policy mismatches. The merged train
// must still open the passage: the base is served, an explicit Open re-prepares under
// the current recipe, and the facilitator's own selection path raises no error.
test('a recipe release (@1 to @2) never strands eng.MRK-1-14-20: the base is served, an explicit Open re-prepares under @2, and the client opens it without an error',async()=>{
 const r=await releases(),packId='eng.MRK-1-14-20';let mf=await r.priorRecipe();
 try{
  let read=http(mf);
  const base=await read('/v1/packs/'+packId);assert.equal(base.status,200);assert.ok(base.body.preparationDemand);
  const ready=await prepare(read,base.body.preparationDemand);assert.equal(ready.status,200,JSON.stringify(ready.body));assert.equal(ready.body.status,'ready');
  const stored=ready.body.record.revision,storedPresentation=(await read('/v1/artifacts/'+stored)).body;
  assert.equal(storedPresentation.execution.recipeRevision,'fia-server-source-action-projector@1');
  assert.ok(storedPresentation.activities.every(a=>a.flow===undefined),'the @1 release emitted no flow roles');
  assert.equal((await read('/v1/packs/'+packId)).body.revision,stored);
  await mf.dispose();mf=await r.after();read=http(mf);
  const reopened=await read('/v1/packs/'+packId);
  assert.equal(reopened.status,200,JSON.stringify(reopened.body));assert.equal(reopened.body.status,'ready');
  assert.equal(reopened.body.revision,base.body.revision,'the base record is served, not the @1 publication');
  assert.equal(reopened.body.execution,undefined);assert.deepEqual(reopened.body.preparationDemand,base.body.preparationDemand);
  const exact=await read(`/v1/packs/${packId}?revision=${stored}`);assert.equal(exact.status,404);assert.equal(exact.body.reason,'execution-job-policy','the @1 revision itself stays refused');
  // The client, over the same Worker: a launch-time restore opens the base quietly;
  // the explicit Open prepares and opens the @2 publication. A rejection here is what
  // the sheet or the reading screen would show as an error.
  const transport=createExecutionTransport({fetch:(url,init={})=>mf.dispatchFetch(origin+url,{method:init.method,headers:init.headers,body:init.body})});
  const restored=await selectServerPresentation(packId,{transport});
  assert.equal(restored.descriptor.revision,base.body.revision);assert.equal(restored.presentation.execution,undefined);
  const opened=await selectServerPresentation(packId,{explicit:true,transport});
  assert.notEqual(opened.descriptor.revision,stored);assert.notEqual(opened.descriptor.revision,base.body.revision);
  assert.equal(opened.presentation.execution.recipeRevision,SOURCE_ACTION_RECIPE);
  assert.ok(opened.presentation.activities.every(a=>a.flow?.schema==='fia-flow-role@1'&&a.flow.role===a.kind),'re-prepared under the current recipe');
  const current=await read('/v1/packs/'+packId);assert.equal(current.status,200);assert.equal(current.body.revision,opened.descriptor.revision);assert.equal(current.body.execution.schema,'fia-executable-catalog@1');
  assert.equal(r.counts.external,0);
 }finally{await mf.dispose();await rm(r.dir,{recursive:true,force:true});}
});

test('the default passage is not offered a preparation it cannot fulfil, and a forced demand is a typed refusal, never a 500',async()=>{
 const r=await releases(),mf=await r.after();
 try{
  const read=http(mf),record=await read('/v1/packs/eng.MRK-1-1-13');
  assert.equal(record.status,200);assert.equal(record.body.status,'ready');
  const forced=await prepare(read,{packId:'eng.MRK-1-1-13',baseRevision:record.body.revision,sourceRevision:record.body.authority.rawInventoryCommit,capability:'executable-presentation'});
  assert.ok(forced.status<500,JSON.stringify(forced));assert.equal(forced.status,409);assert.equal(forced.body.schema,'fia-presentation-preparation@1');assert.equal(forced.body.status,'blocked');assert.match(forced.body.reason,/^[a-z0-9-]+$/);
  assert.equal(record.body.preparationDemand,undefined);
  assert.equal((await read('/v1/packs/eng.MRK-1-1-13')).body.revision,record.body.revision);
 }finally{await mf.dispose();await rm(r.dir,{recursive:true,force:true});}
});

test('resolver: base id fia-mark-authentic@1 for eng.MRK-1-1-13 is a typed refusal from the service, never a thrown 500',async()=>{
 const {gunzipSync}=await import('node:zlib'),{createExecutablePresentationResolver}=await import('../../server/fia/preparation/executable-presentation-resolver.mjs'),{createExecutablePresentationService}=await import('../../server/fia/preparation/executable-presentation-service.mjs'),{sha256,canonicalJSONString}=await import('../../server/fia/preparation/contract.mjs');
 const registry=JSON.parse(await readFile(publicRoot+'/content/registry.json')),source=JSON.parse(gunzipSync(await readFile('server/fia/compiler/presentation/source-packs.json.gz'))),packId='eng.MRK-1-1-13',descriptor=registry.packs.find(d=>d.id===packId),content=await readFile(publicRoot+descriptor.presentation.url,'utf8');
 assert.equal(JSON.parse(content).id,'fia-mark-authentic@1');
 const artifact={sha256:descriptor.revision,bytes:Buffer.byteLength(content),mime:'application/json'},guide=new TextEncoder().encode(canonicalJSONString(source.packs[packId].guide));
 const resolve=createExecutablePresentationResolver({reads:{readPack:async()=>({status:'ready',packId,revision:descriptor.revision,artifact,authority:{rawInventoryCommit:source.revision}}),readArtifact:async()=>({status:'ready',artifact,content})},resolveCanonicalSource:async()=>({bytes:guide,sha256:await sha256(guide),sourceRevision:source.revision})});
 let writes=0;const service=createExecutablePresentationService({storage:{transaction:async()=>{writes++;}},artifacts:{read:async()=>{writes++;},write:async()=>{writes++;}},resolve,eligible:async()=>true,policySha256:'a'.repeat(64)});
 const outcome=await service.request({packId,baseRevision:descriptor.revision,sourceRevision:source.revision,capability:'executable-presentation'});
 assert.deepEqual(outcome,{status:'blocked',reason:'presentation-base-unsupported'});assert.equal(writes,0,'nothing is admitted for an unsatisfiable demand');
});
