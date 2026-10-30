import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {buildGeneralizedSnapshot} from '../../server/fia/publication/generalized.mjs';
import {exportGuideSources} from '../../server/fia/compiler/presentation/export-guide-sources.mjs';
import {buildApprovedAudioProofIndex} from '../../scripts/approved-audio-proof-index.mjs';
import {canonicalJSONString,sha256} from '../../server/fia/preparation/contract.mjs';
import {createExecutableOperations} from '../../server/fia/publication/executable-operations.mjs';
import {createRetainedApprovedAudio} from '../../server/fia/preparation/approved-audio-runtime.mjs';
import {SOURCE_ACTION_RECIPE} from '../../server/fia/compiler/presentation/source-action-projector.mjs';
import {trustedExecutionRecipe} from '../../server/fia/preparation/trusted-source-actions.mjs';
import {createExecutionTransport} from '../../apps/web/src/lib/execution-transport.js';
import {selectServerPresentation} from '../../apps/web/src/lib/library.js';
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json')),{build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://dev.fiaguide.app',publicRoot='apps/web/public',ROOT='fia-executable-presentation-authority@1';
const encode=v=>new TextEncoder().encode(canonicalJSONString(v));
// The policy the builds through e7eb0f0 wrote (DEV's {9a7733f5, @1} rows) and the builds
// from 45a3248 write ({9a7733f5, @2}), as a replay of the real e7eb0f0 build computes it
// (proof index d3be5884). Registry entries 2 and 3 name it; never edit it to a new value.
const PINNED_POLICY='9a7733f5139e9cf7352bfe4018f3164715e69abc9eba3776052bdc324f33295c';
// Released builds are replayed with the proof index they served, stored byte for byte
// (DEV serves the same 4311 bytes), never with today's: a later content release moves
// today's index, and the replay must still write the policy those builds wrote.
const APPROVED='tests/worker-serving/fixtures/approved-audio/';
const D3BE5884={id:'approved-audio-proof-index',path:'/content/approved-audio/d3be588481b0be844fab52b285684702887dc863ba47b8abdbbeb23ec2b9f6b8.json',sha256:'d3be588481b0be844fab52b285684702887dc863ba47b8abdbbeb23ec2b9f6b8',bytes:4311,mime:'application/json'};
// eng.MRK-1-14-20's approved Scripture recording (Bob Souer's BSB, CC0 per its rights
// evidence), the medium audio/ogg delivery DEV retains, so a publication binds play-bound-audio
// and its verification runs the approved-audio branch.
const APPROVED_MEDIA={sha256:'0599996af6b15cf55853cfee33d2b4405e5ee95bd9068f297c5b4b4c24284235',bytes:641001,mime:'audio/ogg',extension:'ogg'};
// Test-only entry: the release Worker plus a storage door on its own origin, so a test
// can read and tamper with one persisted state. It is never part of a release bundle.
const entry=`import worker,{FiaPreparationJobs as Jobs} from ${JSON.stringify(resolve('server/faces/worker/entry.mjs'))};
export class FiaPreparationJobs extends Jobs{async fetch(request){const url=new URL(request.url);if(url.origin!=='https://transition.test')return super.fetch(request);
 if(url.pathname==='/dump')return Response.json(Object.fromEntries(await this.ctx.storage.list()));
 const {key,value}=await request.json();if(value===null)await this.ctx.storage.delete(key);else await this.ctx.storage.put(key,value);return Response.json(true);}}
export default worker;`;

const projectorPath=resolve('server/fia/compiler/presentation/source-action-projector.mjs');
// The releases before #190 projected under fia-server-source-action-projector@1 and
// emitted no fia-flow-role@1. They are replayed from the current module with only those
// two facts changed, so the rows they leave are the rows DEV holds today.
async function priorProjector(){
 const source=await readFile(projectorPath,'utf8'),declared=/export const SOURCE_ACTION_RECIPE='fia-server-source-action-projector@\d+';/,flow=/a\.flow=flowFor\([^;]*\);for\(const derived of additions\)derived\.flow=flowFor\([^;]*\);/;
 assert.match(source,declared);assert.match(source,flow);assert.notEqual(SOURCE_ACTION_RECIPE,'fia-server-source-action-projector@1','the current recipe supersedes @1');
 return source.replace(declared,"export const SOURCE_ACTION_RECIPE='fia-server-source-action-projector@1';").replace(flow,'');
}

// One persisted Durable Object/R2 state across releases. before: the #187/#188 build,
// without an approved-audio proof index and projecting under @1. priorRecipe: the builds
// through e7eb0f0, with proof index d3be5884 (PR #189) and still under @1. recipe2: the
// builds from 45a3248, the same index under @2. after: this tree, under @2 with today's
// index. before → priorRecipe is the DEV transition that left eng.MRK-1-14-20 refused with
// execution-job-policy, and the default passage answering 500 on Open. drifted: a later
// content release, the same bindings in new proof-index bytes, so only today's policy moves.
async function releases(){
 const dir=await mkdtemp(join(tmpdir(),'fia-executable-transition-')),authority=JSON.parse(await readFile('server/fia/publication/trusted-generalized.json')),extension=buildGeneralizedSnapshot(publicRoot,authority),canonicalSources=exportGuideSources({outputRoot:dir,sourceRevision:authority.sourceCommit});
 const proof=await buildApprovedAudioProofIndex({publicRoot,authority:{registrySha256:authority.catalog.sha256,sourceRevision:authority.sourceCommit}});
 const driftBytes=new TextEncoder().encode(JSON.stringify(JSON.parse(new TextDecoder().decode(proof.bytes)),null,1)),driftSha256=await sha256(driftBytes);
 const storedBytes=new Uint8Array(await readFile(APPROVED+D3BE5884.sha256+'.json')),stored=JSON.parse(new TextDecoder().decode(storedBytes));
 assert.equal(storedBytes.length,D3BE5884.bytes);assert.equal(await sha256(storedBytes),D3BE5884.sha256,'the stored d3be5884 proof index is byte-exact');
 const drift={...proof.descriptor,path:`/content/approved-audio/${driftSha256}.json`,sha256:driftSha256,bytes:driftBytes.length},indexes=new Map([[proof.descriptor.path,proof.bytes],[drift.path,driftBytes],[D3BE5884.path,storedBytes]]);
 const base={schema:'fia.worker-read-snapshot.v1',records:extension.records,current:extension.current,staticArtifacts:extension.staticArtifacts,artifacts:[],canonicalSources,generalizedAuthority:extension.authority};
 const counts={external:0};
 // trusted:false replays a build from before trusted source actions shipped (every build
 // named here, and the hypothetical content release that only moves today's policy): it
 // composes no decisions and keeps the bare recipe, exactly as those builds did.
 async function runtime(snapshot,{projector=null,trusted=false}={}){
  // projector: the source-action projector source of an earlier release, bundled in
  // place of the current module so the persisted state carries that release's rows.
  const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'transition-entry.mjs',loader:'js'},bundle:true,platform:'browser',format:'esm',external:['node:*'],write:false,plugins:[{name:'transition-snapshot',setup(b){b.onResolve({filter:/generated\/snapshot\.json$/},()=>({path:'snapshot',namespace:'transition'}));b.onLoad({filter:/.*/,namespace:'transition'},()=>({contents:JSON.stringify(snapshot),loader:'json'}));if(projector)b.onLoad({filter:/source-action-projector\.mjs$/},()=>({contents:projector,loader:'js',resolveDir:dirname(projectorPath)}));if(!trusted)b.onLoad({filter:/trusted-source-actions\.mjs$/},()=>({contents:'export const createTrustedSourceActionComposer=()=>async()=>[];export const trustedExecutionRecipe=recipe=>recipe;',loader:'js'}));}}]});
  return new Miniflare({...convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{FIA_API_ORIGIN:origin},durableObjects:{FIA_PREPARATION_JOBS:{className:'FiaPreparationJobs',useSQLite:true}},r2Buckets:['FIA_ORIGINALS'],serviceBindings:{ASSETS:async request=>{const path=new URL(request.url).pathname;assert.ok(/^\/content\/[a-zA-Z0-9._/-]+$/.test(path)&&!path.includes('..'),path);let bytes;try{bytes=indexes.has(path)?indexes.get(path):await readFile((path.startsWith('/content/source-guides/')?dir:publicRoot)+path);}catch(error){if(error.code!=='ENOENT')throw error;return new Response('Not found',{status:404});}return new Response(bytes,{headers:{'Content-Type':'application/json','Content-Length':String(bytes.length)}});}},outboundService:()=>{counts.external++;throw Error('External work forbidden');}}),resourcePersistencePath:join(dir,'storage')});
 }
 const current={...base,approvedAudioProofIndex:proof.descriptor};
 // A released build's snapshot carries the stored index and the catalog authority that
 // index names, since the runtime admits an index only under its own authority. Today
 // both equal this tree's; after a content release they stay the released pair.
 const released={...base,approvedAudioProofIndex:D3BE5884,generalizedAuthority:{...extension.authority,catalog:{...extension.authority.catalog,sha256:stored.authority.registrySha256},sourceCommit:stored.authority.sourceRevision}};
 const driftPolicy=await sha256(canonicalJSONString({policy:'fia-source-to-app/7fa17af806c139cfc353cace39fa6d50ed9e061b',approvedAudio:drift}));
 const binding=stored.bindings.find(b=>b.packId==='eng.MRK-1-14-20');assert.deepEqual(binding?.media,APPROVED_MEDIA,'the stored index binds the retained recording');
 return {dir,counts,driftPolicy,before:async()=>runtime(base,{projector:await priorProjector()}),priorRecipe:async()=>runtime(released,{projector:await priorProjector()}),recipe2:()=>runtime(released),after:()=>runtime(current,{trusted:true}),untrusted:()=>runtime(current),drifted:()=>runtime({...base,approvedAudioProofIndex:drift})};
}
// Explicit seeding, as an operator retains DEV's recording: one immutable R2 media object
// plus its seed receipt. Nothing in a read or a preparation acquires it.
async function retainApprovedAudio(mf){
 const bucket=await mf.getR2Bucket('FIA_ORIGINALS'),bytes=new Uint8Array(await readFile(APPROVED+APPROVED_MEDIA.sha256+'.ogg'));
 const seeded=await createRetainedApprovedAudio({bucket,validateBinding:async()=>false}).retain({media:APPROVED_MEDIA,bytes,provenance:{kind:'retained-reviewed-trace',sha256:APPROVED_MEDIA.sha256}});
 assert.equal(seeded.status,'ready',JSON.stringify(seeded));return {key:`approved-audio/media/${APPROVED_MEDIA.sha256}.${APPROVED_MEDIA.extension}`,bytes};
}
const http=mf=>async(path,init)=>{const r=await mf.dispatchFetch(origin+path,init);return {status:r.status,type:r.headers.get('content-type'),body:await r.json()};};
const mcp=mf=>async(name,args)=>{const r=await mf.dispatchFetch(origin+'/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body.result.structuredContent;};
const prepare=(read,demand)=>read('/v1/presentation-preparations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(demand)});
// Every durable row in the Durable Object and every R2 object, for zero-write checks.
async function store(mf){
 const ns=await mf.getDurableObjectNamespace('FIA_PREPARATION_JOBS'),stub=ns.get(ns.idFromName(ROOT)),bucket=await mf.getR2Bucket('FIA_ORIGINALS');
 const door=async(path,body)=>(await stub.fetch('https://transition.test'+path,body===undefined?{}:{method:'POST',body:JSON.stringify(body)})).json();
 const objects=async()=>{const out=[];let cursor;do{const page=await bucket.list(cursor?{cursor}:{});out.push(...page.objects.map(o=>[o.key,o.etag,o.size]));cursor=page.truncated?page.cursor:undefined;}while(cursor);return out;};
 return {rows:()=>door('/dump'),put:(key,value)=>door('/put',{key,value}),bucket,durable:async()=>canonicalJSONString({rows:await door('/dump'),objects:await objects()})};
}
// Before: publish both passages under the superseded policy. Then: the next release.
async function stalePublications(r,next='after'){
 let mf=await r.before();const read=http(mf),published={};
 try{
  for(const packId of ['eng.MRK-1-14-20','eng.MRK-1-21-28']){
   const base=await read('/v1/packs/'+packId);assert.equal(base.status,200);assert.ok(base.body.preparationDemand,packId);
   const ready=await prepare(read,base.body.preparationDemand);assert.equal(ready.status,200,JSON.stringify(ready.body));assert.equal(ready.body.status,'ready');
   published[packId]={demand:base.body.preparationDemand,revision:ready.body.record.revision,jobId:ready.body.jobId};
   assert.equal((await read('/v1/packs/'+packId)).body.revision,ready.body.record.revision);
  }
 }finally{await mf.dispose();}
 mf=await r[next]();return {mf,published};
}

// The executable store is a content-keyed cache, never a gate (cookbook package-luke
// RULING.md § DEV publication conflict): a historical, forged, unregistered or corrupt row,
// or a wrong pointer or owner index, is a cache miss whose current read falls through to
// the base with its existing demand. No read writes.
test('a historical publication, and every forged, unregistered or corrupt row or wrong pointer, is a cache miss: the current read falls through to the base with its demand, and no read writes',async()=>{
 const r=await releases(),{mf,published}=await stalePublications(r);
 try{
  const read=http(mf),call=mcp(mf),s=await store(mf),packId='eng.MRK-1-14-20',prior=published[packId];
  const rows=await s.rows(),pointer=rows['executable-current:'+packId],record=rows[pointer],jobId=record.provenance.jobId,job=rows['executable-presentation:job:'+jobId],demand=rows['executable-demand:'+jobId],ownersKey='executable-artifact:'+record.artifact.sha256,owners=rows[ownersKey];
  assert.equal(pointer,`executable-record:${packId}@${prior.revision}`);assert.equal(jobId,prior.jobId);assert.equal(job.policySha256,await sha256('fia-source-to-app/7fa17af806c139cfc353cace39fa6d50ed9e061b'),'the registered historical policy: no approved-audio proof index');assert.equal(job.recipeRevision,'fia-server-source-action-projector@1','the #187/#188 build projected under @1');
  const authentic=async label=>{
   const before=await s.durable(),viaHttp=await read('/v1/packs/'+packId),viaMcp=await call('read_pack',{packId});
   assert.equal(viaHttp.status,200,`${label}: ${JSON.stringify(viaHttp.body)}`);assert.equal(viaHttp.body.status,'ready');assert.equal(viaHttp.body.execution,undefined,'the historical publication is not served as current');
   assert.deepEqual(viaHttp.body.preparationDemand,prior.demand,'the current base carries its existing demand');assert.notEqual(viaHttp.body.revision,prior.revision);
   assert.deepEqual(viaMcp,viaHttp.body,label+': HTTP/MCP parity');assert.equal(await s.durable(),before,label+': the read writes nothing');
  };
  await authentic('authentic historical publication');
  assert.equal((await read(`/v1/packs/${packId}?revision=${prior.revision}`)).status,404,'the exact historical revision is a miss: the base holds no such revision');
  const status=await read('/v1/presentation-preparations/'+jobId);assert.equal(status.status,409,JSON.stringify(status.body));assert.equal(status.body.status,'blocked','the old job-status read stays denied');
  const unregistered=await sha256('fia-source-to-app/unregistered'),recomputed=await sha256(encode({schema:'fia-executable-presentation-job@1',args:job.args,context:job.context.sha256,policySha256:unregistered,providerSha256:job.providerSha256,recipeRevision:job.recipeRevision}));
  // A registered policy under a recipe it never shipped with is an unregistered build.
  const unshipped=await sha256(encode({schema:'fia-executable-presentation-job@1',args:job.args,context:job.context.sha256,policySha256:job.policySha256,providerSha256:job.providerSha256,recipeRevision:SOURCE_ACTION_RECIPE}));
  const cases=[
   ['forged policy string',[['executable-presentation:job:'+jobId,{...job,policySha256:'fia-source-to-app/7fa17af806c139cfc353cace39fa6d50ed9e061b'}]]],
   ['recomputed but unregistered policy',[['executable-presentation:job:'+recomputed,{...job,jobId:recomputed,policySha256:unregistered}],['executable-demand:'+recomputed,demand],[pointer,{...record,provenance:{...record.provenance,jobId:recomputed}}]]],
   ['recomputed registered policy under an unshipped recipe',[['executable-presentation:job:'+unshipped,{...job,jobId:unshipped,recipeRevision:SOURCE_ACTION_RECIPE}],['executable-demand:'+unshipped,demand],[pointer,{...record,provenance:{...record.provenance,jobId:unshipped}}]]],
   ['corrupt job row: an unexpected field',[['executable-presentation:job:'+jobId,{...job,note:'x'}]]],
   ['corrupt job row: its id does not recompute',[['executable-presentation:job:'+jobId,{...job,args:{...job.args,sourceRevision:'0'.repeat(40)}}]]],
   ['request row binds another revision',[['executable-demand:'+jobId,{...demand,revision:'0'.repeat(64)}]]],
   ['artifact owner index omits the publication',[[ownersKey,owners.filter(k=>k!==pointer)]]],
   ['wrong pointer: another passage',[['executable-current:'+packId,rows['executable-current:eng.MRK-1-21-28']]]],
   ['wrong pointer: dangling revision',[['executable-current:'+packId,`executable-record:${packId}@${'0'.repeat(64)}`]]],
  ];
  const outcomes=[],outcome=async(label,run)=>{try{await run();outcomes.push([label,'base']);}catch(error){outcomes.push([label,error.message.split('\n')[0]]);}};
  for(const [label,writes] of cases){
   for(const [key,value] of writes)await s.put(key,value);
   try{await outcome(label,()=>authentic(label));}finally{for(const [key] of writes)await s.put(key,rows[key]??null);}
  }
  // Corrupt retained context bytes: the job row names bytes that no longer hash.
  const context=await s.bucket.get(job.context.reference),original=new Uint8Array(await context.arrayBuffer());
  await s.bucket.put(job.context.reference,new TextEncoder().encode('{"corrupt":true}'));
  try{await outcome('corrupt retained context bytes',()=>authentic('corrupt retained context bytes'));}finally{await s.bucket.put(job.context.reference,original);}
  assert.deepEqual(outcomes.filter(([,result])=>result!=='base'),[],'every unverified case is a cache miss that serves the base with its demand, never unavailable');assert.equal(outcomes.length,cases.length+1);
  await authentic('restored authentic historical publication');
  assert.equal(r.counts.external,0);
 }finally{await mf.dispose();await rm(r.dir,{recursive:true,force:true});}
});

test('an explicit Open under the new policy publishes: new bytes advance the pointer, identical bytes replace the row under the same key, never a conflict',async()=>{
 // Two successors of the #187/#188 build: the builds through e7eb0f0 (the same @1 recipe),
 // where eng.MRK-1-21-28 republishes identical bytes, and this tree, whose @2 recipe adds
 // flow roles, so both passages adopt new bytes.
 for(const [next,identical] of [['priorRecipe',['eng.MRK-1-21-28']],['after',[]]]){
 const r=await releases(),{mf,published}=await stalePublications(r,next);
 try{
  const read=http(mf),call=mcp(mf),s=await store(mf),rows=await s.rows();
  // A job whose publication never committed: its status read is a typed denial, not a 500.
  const stale=published['eng.MRK-1-14-20'];await s.put('executable-demand:'+stale.jobId,{...rows['executable-demand:'+stale.jobId],revision:null});
  try{const pending=await read('/v1/presentation-preparations/'+stale.jobId);assert.equal(pending.status,409,JSON.stringify(pending.body));assert.deepEqual(pending.body,{schema:'fia-presentation-preparation@1',status:'blocked',jobId:stale.jobId,reason:'execution-job-policy',record:null});assert.deepEqual(await call('read_presentation_preparation',{jobId:stale.jobId}),pending.body);}
  finally{await s.put('executable-demand:'+stale.jobId,rows['executable-demand:'+stale.jobId]);}
  for(const [packId,prior] of Object.entries(published)){
   const key=`executable-record:${packId}@${prior.revision}`,historical=rows[key];assert.ok(historical,key);
   const reopened=await read('/v1/packs/'+packId);assert.equal(reopened.status,200,`${packId}: ${JSON.stringify(reopened.body)}`);assert.deepEqual(reopened.body.preparationDemand,prior.demand);
   const again=await prepare(read,reopened.body.preparationDemand);
   assert.equal(again.status,200,`${next} ${packId}: ${JSON.stringify(again.body)}`);assert.equal(again.body.status,'ready');assert.notEqual(again.body.reason,'executable-publication-conflict');
   const current=await read('/v1/packs/'+packId);assert.equal(current.status,200);assert.equal(current.body.revision,again.body.record.revision);assert.equal(current.body.execution.schema,'fia-executable-catalog@1');
   const after=await s.rows();
   assert.deepEqual(after['executable-demand:'+prior.jobId],rows['executable-demand:'+prior.jobId],`${packId}: the historical request row is preserved`);
   if(!identical.includes(packId)){
    assert.notEqual(again.body.record.revision,prior.revision,'the approved-audio policy or the @2 recipe changes these bytes');
    assert.equal(canonicalJSONString(after[key]),canonicalJSONString(historical),`${packId}: a different key leaves the historical row in place`);
    assert.equal((await read(`/v1/packs/${packId}?revision=${prior.revision}`)).status,404,'the exact historical revision is a miss');
   }else{
    // The same presentation bytes under a newer job: the content key already exists,
    // so the row is replaced (new provenance) and the pointer advances to it.
    assert.equal(again.body.record.revision,prior.revision,'identical bytes, identical content key');
    assert.deepEqual(await call('prepare_presentation',reopened.body.preparationDemand),again.body,'HTTP/MCP parity');
    assert.equal(after[key].provenance.jobId,again.body.jobId,`${packId}: the row is replaced under the newer job`);assert.equal(after['executable-current:'+packId],key);
    assert.equal((await read(`/v1/packs/${packId}?revision=${prior.revision}`)).status,200,'the replaced row serves its revision');
   }
  }
  assert.equal(r.counts.external,0);
 }finally{await mf.dispose();await rm(r.dir,{recursive:true,force:true});}
 }
});

// #190 moved the projector to fia-server-source-action-projector@2. Job and publication
// rows written under @1 (policy 9a7733f5, the builds through e7eb0f0) now read as
// execution-job-policy mismatches. The merged train must still open the passage: the base
// is served, an explicit Open re-prepares under the current recipe, and the facilitator's
// own selection path raises no error.
test('a recipe release (@1 to @2) never strands eng.MRK-1-14-20: the base is served, an explicit Open re-prepares under @2, and the client opens it without an error',async()=>{
 const r=await releases(),packId='eng.MRK-1-14-20';let mf=await r.priorRecipe();
 try{
  let read=http(mf);
  const base=await read('/v1/packs/'+packId);assert.equal(base.status,200);assert.ok(base.body.preparationDemand);
  const ready=await prepare(read,base.body.preparationDemand);assert.equal(ready.status,200,JSON.stringify(ready.body));assert.equal(ready.body.status,'ready');
  const stored=ready.body.record.revision,storedPresentation=(await read('/v1/artifacts/'+stored)).body;
  assert.equal(storedPresentation.execution.recipeRevision,'fia-server-source-action-projector@1');
  const job=(await (await store(mf)).rows())['executable-presentation:job:'+ready.body.jobId];
  assert.equal(job.policySha256,PINNED_POLICY,'the replayed e7eb0f0 build must write registry entry 2\'s literal policy. Never edit entry 2 or PINNED_POLICY to a new value: DEV holds rows under it. A moved policy is a new build, appended as its own literal entry');assert.equal(job.recipeRevision,'fia-server-source-action-projector@1');
  assert.ok(storedPresentation.activities.every(a=>a.flow===undefined),'the @1 release emitted no flow roles');
  assert.equal((await read('/v1/packs/'+packId)).body.revision,stored);
  await mf.dispose();mf=await r.after();read=http(mf);
  const reopened=await read('/v1/packs/'+packId);
  assert.equal(reopened.status,200,JSON.stringify(reopened.body));assert.equal(reopened.body.status,'ready');
  assert.equal(reopened.body.revision,base.body.revision,'the base record is served, not the @1 publication');
  assert.equal(reopened.body.execution,undefined);assert.deepEqual(reopened.body.preparationDemand,base.body.preparationDemand);
  const exact=await read(`/v1/packs/${packId}?revision=${stored}`);assert.equal(exact.status,404,'the @1 revision is a cache miss and the base holds no such revision');
  // The client, over the same Worker: a launch-time restore opens the base quietly;
  // the explicit Open prepares and opens the @2 publication. A rejection here is what
  // the sheet or the reading screen would show as an error.
  const transport=createExecutionTransport({fetch:(url,init={})=>mf.dispatchFetch(origin+url,{method:init.method,headers:init.headers,body:init.body})});
  const restored=await selectServerPresentation(packId,{transport});
  assert.equal(restored.descriptor.revision,base.body.revision);assert.equal(restored.presentation.execution,undefined);
  const opened=await selectServerPresentation(packId,{explicit:true,transport});
  assert.notEqual(opened.descriptor.revision,stored);assert.notEqual(opened.descriptor.revision,base.body.revision);
  assert.equal(opened.presentation.execution.recipeRevision,trustedExecutionRecipe(SOURCE_ACTION_RECIPE),'today\'s recipe: @2 with the trusted source-action identity');
  assert.ok(opened.presentation.activities.every(a=>a.flow?.schema==='fia-flow-role@1'&&a.flow.role===a.kind),'re-prepared under the current recipe');
  const current=await read('/v1/packs/'+packId);assert.equal(current.status,200);assert.equal(current.body.revision,opened.descriptor.revision);assert.equal(current.body.execution.schema,'fia-executable-catalog@1');
  assert.equal(r.counts.external,0);
 }finally{await mf.dispose();await rm(r.dir,{recursive:true,force:true});}
});

// A content release moves today's policy, which hashes the approved-audio proof index.
// The registry names each released build by its literal policy and recipe, so no row DEV
// holds is stranded while each pack's base revision and approved-audio binding rows stay
// unchanged. Two DEV states: e7eb0f0's, with eng.MRK-1-14-20 at {9a7733f5, @1}; and the
// state from 45a3248, whose first post-deploy Open re-prepared it at {9a7733f5, @2}. In both,
// eng.MRK-1-14-20 binds its retained approved recording, so verification runs the
// approved-audio branch, and eng.MRK-1-21-28 (no binding) sits under the other recipe.
// Each publication authenticates and yields its current read to the base. After the move,
// an explicit Open of eng.MRK-1-14-20 prepares under the moved policy: from @1 it adopts
// new bytes with the approved recording still bound and served; from @2 it reproduces the
// same bytes, whose existing content key is replaced and its pointer advanced (a cache, never a conflict).
test('a content release that moves today\'s policy strands no released build: {9a7733f5, @1} and {9a7733f5, @2} publications, with and without bound approved audio, still authenticate and yield to the base',async()=>{
 const open=async(read,packId)=>{const base=await read('/v1/packs/'+packId);assert.equal(base.status,200,`${packId}: ${JSON.stringify(base.body)}`);assert.ok(base.body.preparationDemand,packId);const ready=await prepare(read,base.body.preparationDemand);assert.equal(ready.status,200,JSON.stringify(ready.body));assert.equal(ready.body.status,'ready');return {demand:base.body.preparationDemand,base:base.body.revision,revision:ready.body.record.revision,jobId:ready.body.jobId};};
 const recipes={priorRecipe:'fia-server-source-action-projector@1',recipe2:'fia-server-source-action-projector@2'};
 const states=[
  {state:'e7eb0f0',opens:[['priorRecipe','eng.MRK-1-14-20'],['recipe2','eng.MRK-1-21-28']],reopen:'adopts new bytes'},
  {state:'45a3248',opens:[['priorRecipe','eng.MRK-1-14-20'],['priorRecipe','eng.MRK-1-21-28'],['recipe2','eng.MRK-1-14-20']],reopen:'identical bytes'},
 ];
 for(const {state,opens,reopen} of states){
  const r=await releases(),published={};let mf=null,build=null,media=null;
  try{
   for(const [next,packId] of opens){
    if(next!==build){if(mf)await mf.dispose();mf=await r[next]();build=next;media??=await retainApprovedAudio(mf);}
    const read=http(mf),prior={...await open(read,packId),build:next},job=(await (await store(mf)).rows())['executable-presentation:job:'+prior.jobId],presentation=(await read('/v1/artifacts/'+prior.revision)).body;
    assert.equal(job.policySha256,PINNED_POLICY,`${state} ${packId}`);assert.equal(job.recipeRevision,recipes[next],`${state} ${packId}`);
    const bound=presentation.activities.filter(a=>a.execution?.narration?.action==='play-bound-audio');
    assert.deepEqual(bound.map(a=>a.kind),packId==='eng.MRK-1-14-20'?['scripture']:[],`${state} ${packId}: the publication binds the retained approved recording exactly where the proof index does`);
    published[packId]=prior;
   }
   assert.notEqual(r.driftPolicy,PINNED_POLICY,'the content release moves today\'s policy');
   await mf.dispose();mf=await r.drifted();
   const call=mcp(mf),s=await store(mf),drifted=http(mf),outcomes=[];
   const yields=async(packId,prior)=>{
    const before=await s.durable(),viaHttp=await drifted('/v1/packs/'+packId),viaMcp=await call('read_pack',{packId});
    assert.equal(viaHttp.status,200,`answered ${viaHttp.status} ${viaHttp.body.reason}`);assert.equal(viaHttp.body.status,'ready');assert.equal(viaHttp.body.execution,undefined,'the historical publication is not served as current');
    assert.equal(viaHttp.body.revision,prior.base,'the base record is served');assert.deepEqual(viaHttp.body.preparationDemand,prior.demand,'with its existing demand');
    assert.deepEqual(viaMcp,viaHttp.body,'HTTP/MCP parity');assert.equal(await s.durable(),before,'the read writes nothing');
   };
   for(const [packId,prior] of Object.entries(published)){
    try{await yields(packId,prior);outcomes.push([packId,prior.build,'authenticated']);}catch(error){outcomes.push([packId,prior.build,error.message.split('\n')[0]]);}
    assert.equal((await drifted(`/v1/packs/${packId}?revision=${prior.revision}`)).status,404,'the exact historical revision stays denied');
   }
   assert.deepEqual(outcomes,Object.entries(published).map(([packId,prior])=>[packId,prior.build,'authenticated']),`${state}: no released build is stranded by the policy move`);
   // Corrupt retained approved-audio bytes are a cache miss, never a usage gate: the
   // eng.MRK-1-14-20 current read still falls through to the base with its demand.
   await s.bucket.put(media.key,new Uint8Array([1]));
   try{await yields('eng.MRK-1-14-20',published['eng.MRK-1-14-20']);}
   finally{await s.bucket.put(media.key,media.bytes);}
   await yields('eng.MRK-1-14-20',published['eng.MRK-1-14-20']);
   // The move is real: an explicit Open prepares under the moved policy. From the @1 row
   // (e7eb0f0) it adopts new bytes, with the approved recording still bound and served
   // from its retained bytes. From the @2 row (45a3248, DEV today: Mark 1:14–20) the moved
   // policy reproduces the same bytes; the content key exists, so the row is replaced
   // under the newer job and the pointer advances. Never a 409 conflict.
   const stale=published['eng.MRK-1-14-20'],before=await s.rows(),again=await prepare(drifted,stale.demand);
   assert.equal(recipes[stale.build]===SOURCE_ACTION_RECIPE?'identical bytes':'adopts new bytes',reopen,state);
   if(reopen==='identical bytes'){
    assert.equal(again.status,200,`${state}: ${JSON.stringify(again.body)}`);assert.equal(again.body.status,'ready');assert.equal(again.body.record.revision,stale.revision,'identical bytes, identical content key');
    const key=`executable-record:eng.MRK-1-14-20@${stale.revision}`,after=await s.rows();assert.notEqual(canonicalJSONString(after[key]),canonicalJSONString(before[key]),'the row is replaced');assert.equal(after[key].provenance.jobId,again.body.jobId);assert.equal(after['executable-current:eng.MRK-1-14-20'],key);
    const current=await drifted('/v1/packs/eng.MRK-1-14-20');assert.equal(current.status,200);assert.equal(current.body.revision,stale.revision);assert.equal(current.body.execution.schema,'fia-executable-catalog@1','Mark 1:14–20 opens executable after re-prepare');
   }else{
    assert.equal(again.status,200,`${state}: ${JSON.stringify(again.body)}`);assert.equal(again.body.status,'ready');assert.notEqual(again.body.record.revision,stale.revision,'the @2 recipe changes these bytes');
    assert.equal((await s.rows())['executable-presentation:job:'+again.body.jobId].policySha256,r.driftPolicy);
    const reopened=(await drifted('/v1/artifacts/'+again.body.record.revision)).body,scripture=reopened.activities.filter(a=>a.execution?.narration?.action==='play-bound-audio');
    assert.deepEqual(scripture.map(a=>a.kind),['scripture'],`${state}: the approved recording stays bound under the moved policy`);
    const descriptor=again.body.record.execution.artifacts.find(a=>a.id===scripture[0].execution.narration.artifact.id),artifact=await drifted('/v1/artifacts/'+descriptor.sha256);
    assert.equal(artifact.status,200,JSON.stringify(artifact.body));assert.match(artifact.body.delivery.url,/^\/v1\/approved-audio\/[a-f0-9]{64}\/[a-f0-9]{64}\.ogg$/);
    const audio=await mf.dispatchFetch(origin+artifact.body.delivery.url),bytes=new Uint8Array(await audio.arrayBuffer());
    assert.equal(audio.status,200);assert.equal(audio.headers.get('Content-Type'),'audio/ogg');assert.equal(bytes.length,APPROVED_MEDIA.bytes);assert.equal(await sha256(bytes),APPROVED_MEDIA.sha256);
   }
   assert.equal(r.counts.external,0);
  }finally{if(mf)await mf.dispose();await rm(r.dir,{recursive:true,force:true});}
 }
});

test('expected publication conflicts and stale-job status reads answer the typed blocked envelope with their code, never a thrown 500',async()=>{
 const rows=new Map(),storage={transaction:async run=>run({get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>{rows.set(k,structuredClone(v));}})};
 const demand={packId:'eng.MRK-1-14-20',baseRevision:'a'.repeat(64),sourceRevision:'b'.repeat(40),capability:'executable-presentation'},jobId='c'.repeat(64),ready={status:'ready',jobId,presentation:{},boundArtifacts:[],provenance:{}};
 const ops=(service,publish)=>createExecutableOperations({reads:{readPack:async()=>({status:'unavailable',reason:'not-found'})},service,publication:{publish},storage});
 const blocked=(reason,id=jobId)=>({schema:'fia-presentation-preparation@1',status:'blocked',jobId:id,reason,record:null});
 for(const code of ['executable-pointer-conflict','executable-base-stale','executable-publication-revoked','executable-publication-refused']){
  rows.clear();assert.deepEqual(await ops({request:async()=>ready},async()=>{throw Error(code);}).preparePresentation(demand),blocked(code),code);
 }
 rows.clear();await assert.rejects(ops({request:async()=>ready},async()=>{throw TypeError('x is not a function');}).preparePresentation(demand),TypeError,'an unnamed fault is not disguised as a domain refusal');
 for(const code of ['execution-request-conflict','execution-artifact-readback','execution-request-integrity','execution-resolved-context']){rows.clear();assert.deepEqual(await ops({request:async()=>{throw Error(code);}}).preparePresentation(demand),blocked(code,null),code+': a post-admission refusal answers typed');}
 rows.clear();rows.set('executable-demand:'+jobId,{args:{...demand,sourceRevision:'d'.repeat(40)},revision:null});assert.deepEqual(await ops({request:async()=>ready}).preparePresentation(demand),blocked('presentation-job-conflict'),'a request-row conflict answers typed');
 rows.clear();rows.set('executable-demand:'+jobId,{args:demand,revision:null});assert.deepEqual(await ops({read:async()=>{throw Error('execution-job-policy');}}).readPresentationPreparation({jobId}),blocked('execution-job-policy'),'a stale-policy status read is denied typed');
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

// The exact admitted tuple (cookbook ANSWER-P2-LEDGER-APPLICABILITY 572bac9; claim
// CLAIM-S02-U008-TRUSTED-PLACEMENT): eng.MRK-1-14-20 S02-U008 requests FIAMaps/c4 and
// FIAImages/a1400. The deploy sequence: a build without trusted source actions prepares
// the passage to ready; this tree then serves the base with its demand (the old row is a
// cache miss for the current read, since the trusted identity is part of the recipe); the
// facilitator's explicit Open prepares a NEW revision that places both assets through the
// explicitResult boundary in verified base order (a1400 is base asset 21, c4 is 22); and an
// exact-revision read of the old revision still resolves, so pinned Active and Saved
// sessions stay coherent. Nothing else moves: other steps, narration, holds, the assets.
test('a trusted-metadata release re-offers eng.MRK-1-14-20: base plus demand, an explicit Open places focal a1400 and S02-U008-resource-c4, the old revision still resolves',async()=>{
 const r=await releases(),packId='eng.MRK-1-14-20';let mf=await r.untrusted();
 try{
  let read=http(mf);
  const base=await read('/v1/packs/'+packId);assert.equal(base.status,200);assert.ok(base.body.preparationDemand);
  const ready=await prepare(read,base.body.preparationDemand);assert.equal(ready.status,200,JSON.stringify(ready.body));assert.equal(ready.body.status,'ready');
  const stored=ready.body.record.revision,before=(await read('/v1/artifacts/'+stored)).body;
  assert.equal(before.execution.recipeRevision,SOURCE_ACTION_RECIPE);assert.equal(before.activities.find(a=>a.id==='S02-U008').execution.focalAssetId,null);
  assert.equal((await read('/v1/packs/'+packId)).body.revision,stored,'the untrusted build serves its publication');
  await mf.dispose();mf=await r.after();read=http(mf);
  const reopened=await read('/v1/packs/'+packId);
  assert.equal(reopened.status,200,JSON.stringify(reopened.body));assert.equal(reopened.body.status,'ready');
  assert.equal(reopened.body.revision,base.body.revision,'the base record is served, not the untrusted publication');
  assert.equal(reopened.body.execution,undefined);assert.deepEqual(reopened.body.preparationDemand,base.body.preparationDemand);
  const pinned=await read(`/v1/packs/${packId}?revision=${stored}`);assert.equal(pinned.status,200,'a pinned session still reads its exact revision');assert.equal(pinned.body.revision,stored);assert.equal(pinned.body.execution.schema,'fia-executable-catalog@1');
  assert.deepEqual((await read('/v1/artifacts/'+stored)).body,before,'and its exact bytes');
  const transport=createExecutionTransport({fetch:(url,init={})=>mf.dispatchFetch(origin+url,{method:init.method,headers:init.headers,body:init.body})});
  const restored=await selectServerPresentation(packId,{transport});
  assert.equal(restored.descriptor.revision,base.body.revision);assert.equal(restored.presentation.execution,undefined);
  const opened=await selectServerPresentation(packId,{explicit:true,transport}),after=opened.presentation;
  assert.notEqual(opened.descriptor.revision,stored);assert.notEqual(opened.descriptor.revision,base.body.revision);
  assert.equal(after.execution.recipeRevision,trustedExecutionRecipe(SOURCE_ACTION_RECIPE));assert.notEqual(after.execution.recipeRevision,SOURCE_ACTION_RECIPE);
  const index=after.activities.findIndex(a=>a.id==='S02-U008'),[primary,derived]=after.activities.slice(index,index+2),prior=before.activities.find(a=>a.id==='S02-U008');
  assert.equal(primary.kind,'discussion');assert.equal(primary.assetId,'a1400');assert.equal(primary.execution.focalAssetId,'a1400');assert.equal(primary.completion,'confirm');assert.deepEqual(primary.execution.completion,{action:'manual-continue'});
  assert.deepEqual(primary.execution.narration,prior.execution.narration,'narration is unchanged');assert.equal(primary.narration,prior.narration);assert.equal(primary.sourceText,prior.sourceText);assert.equal(primary.prompt,prior.prompt);assert.deepEqual(primary.relatedAssetIds,prior.relatedAssetIds,'no legacy relatedIds are imported');
  assert.deepEqual(prior.execution.completion,{action:'manual-continue'},'the hold was already manual');
  assert.equal(derived.id,'S02-U008-resource-c4');assert.equal(derived.fulfills,'S02-U008');assert.equal(derived.assetId,'c4');assert.equal(derived.execution.focalAssetId,'c4');assert.deepEqual(derived.execution.narration,{action:'none'});assert.equal(derived.narration,'');assert.equal(derived.completion,'confirm');
  assert.deepEqual(after.activities.filter(a=>!a.id.startsWith('S02-U008')),before.activities.filter(a=>a.id!=='S02-U008'),'every other step is unchanged');
  assert.equal(after.activities.length,before.activities.length+1);assert.deepEqual(after.assets,before.assets,'the asset graph is unchanged');
  assert.deepEqual(after.activities.filter(a=>a.execution.focalAssetId&&['image','map','video'].includes(after.assets[a.execution.focalAssetId]?.kind)).map(a=>[a.id,a.execution.focalAssetId]),[['S02-U008','a1400'],['S02-U008-resource-c4','c4']],'no other visual placement and no video');
  const current=await read('/v1/packs/'+packId);assert.equal(current.status,200);assert.equal(current.body.revision,opened.descriptor.revision);assert.equal(current.body.execution.schema,'fia-executable-catalog@1');
  assert.equal((await read(`/v1/packs/${packId}?revision=${stored}`)).body.revision,stored,'the old revision still resolves after the pointer advances');
  // Spanish is not admitted: its Open under this tree places no visual.
  const spa=await read('/v1/packs/spa.MRK-1-14-20'),spaReady=await prepare(read,spa.body.preparationDemand);assert.equal(spaReady.body.status,'ready');
  const spaPresentation=(await read('/v1/artifacts/'+spaReady.body.record.revision)).body;
  assert.deepEqual(spaPresentation.activities.filter(a=>a.execution.focalAssetId&&['image','map','video'].includes(spaPresentation.assets[a.execution.focalAssetId]?.kind)),[],'the Spanish row is not admitted');
  assert.equal(r.counts.external,0);
 }finally{await mf.dispose();await rm(r.dir,{recursive:true,force:true});}
});

// F4 server half and F5a, end to end in the real Worker. A page that asks with execution=2 gets
// visualResources on the executable record: a1400 then c4, preparable, each with its exact demand.
// A page that does not ask gets today's record unchanged. A visual demand is admitted against the
// current execution and answered typed: unrouted custody is visual-routing-unavailable, and a stale
// execution revision is execution-revision-stale. Never a 500, and no fetch.
test('an asking read declares a1400 then c4 as preparable; a visual demand is admitted or refused typed',async()=>{
 const r=await releases(),packId='eng.MRK-1-14-20',mf=await r.after();
 try{
  const read=http(mf),call=mcp(mf);
  const base=await read('/v1/packs/'+packId);const ready=await prepare(read,base.body.preparationDemand);assert.equal(ready.body.status,'ready');
  const plain=await read('/v1/packs/'+packId),asking=await read('/v1/packs/'+packId+'?execution=2');
  assert.equal(plain.status,200);assert.equal(asking.status,200);assert.equal(plain.body.execution.visualResources,undefined,'a page that does not ask gets today\'s record');
  const {visualResources,...rest}=asking.body.execution;assert.deepEqual({...asking.body,execution:rest},plain.body,'nothing else differs');
  const demand=(assetId,kind,expectedExecutionRevision=plain.body.revision)=>({packId,baseRevision:plain.body.execution.baseRevision,sourceRevision:plain.body.execution.sourceRevision,capability:'executable-presentation',visualDemand:{assetId,kind},expectedExecutionRevision});
  assert.deepEqual(visualResources,[{assetId:'a1400',kind:'image',status:'preparable',preparationDemand:demand('a1400','image')},{assetId:'c4',kind:'map',status:'preparable',preparationDemand:demand('c4','map')}]);
  assert.deepEqual(await call('read_pack',{packId,execution:'2'}),asking.body,'HTTP/MCP parity');
  assert.deepEqual((await read(`/v1/packs/${packId}?revision=${plain.body.revision}&execution=2`)).body.execution.visualResources,visualResources,'the exact revision declares the same');
  // Routed (Otto's capabilities.visuals port): this harness forbids every outbound fetch, so the one publisher GET the
  // demand makes fails, and the answer is typed unavailable: interrupted (non-final). visual-route.test.mjs runs the
  // routed demand against a publisher fixture through ready, publication and the read route.
  const routed=await prepare(read,visualResources[0].preparationDemand);
  assert.equal(routed.status,404,JSON.stringify(routed.body));assert.deepEqual(routed.body,{schema:'fia-presentation-preparation@1',status:'unavailable',jobId:null,reason:'interrupted',record:null});
  const stale=await prepare(read,demand('c4','map','f'.repeat(64)));assert.equal(stale.status,409);assert.equal(stale.body.reason,'execution-revision-stale');
  const forged=await prepare(read,demand('a293','image'));assert.equal(forged.status,409);assert.equal(forged.body.reason,'execution-admission-refused');
  const malformed=await prepare(read,{...demand('c4','map'),visualDemand:{assetId:'c4',kind:'video'}});assert.equal(malformed.status,400);
  assert.equal((await read('/v1/packs/'+packId)).body.revision,plain.body.revision,'no demand publishes or moves the pointer');
  // Spanish is not admitted, and a base record declares nothing.
  const spa=await read('/v1/packs/spa.MRK-1-14-20');const spaReady=await prepare(read,spa.body.preparationDemand);assert.equal(spaReady.body.status,'ready');
  assert.deepEqual((await read('/v1/packs/spa.MRK-1-14-20?execution=2')).body.execution.visualResources,[]);
  const other=await read('/v1/packs/eng.MRK-1-21-28'),otherAsking=await read('/v1/packs/eng.MRK-1-21-28?execution=2');assert.deepEqual(otherAsking.body,other.body);
  assert.equal(r.counts.external,1,'reads fetch nothing; the one routed visual demand made one (forbidden) publisher GET');
 }finally{await mf.dispose();await rm(r.dir,{recursive:true,force:true});}
});

test('resolver: base id fia-mark-authentic@1 for eng.MRK-1-1-13 is a typed refusal from the service, never a thrown 500',async()=>{
 const {gunzipSync}=await import('node:zlib'),{createExecutablePresentationResolver}=await import('../../server/fia/preparation/executable-presentation-resolver.mjs'),{createExecutablePresentationService}=await import('../../server/fia/preparation/executable-presentation-service.mjs');
 const registry=JSON.parse(await readFile(publicRoot+'/content/registry.json')),source=JSON.parse(gunzipSync(await readFile('server/fia/compiler/presentation/source-packs.json.gz'))),packId='eng.MRK-1-1-13',descriptor=registry.packs.find(d=>d.id===packId),content=await readFile(publicRoot+descriptor.presentation.url,'utf8');
 assert.equal(JSON.parse(content).id,'fia-mark-authentic@1');
 const artifact={sha256:descriptor.revision,bytes:Buffer.byteLength(content),mime:'application/json'},guide=new TextEncoder().encode(canonicalJSONString(source.packs[packId].guide));
 const resolve=createExecutablePresentationResolver({reads:{readPack:async()=>({status:'ready',packId,revision:descriptor.revision,artifact,authority:{rawInventoryCommit:source.revision}}),readArtifact:async()=>({status:'ready',artifact,content})},resolveCanonicalSource:async()=>({bytes:guide,sha256:await sha256(guide),sourceRevision:source.revision})});
 let writes=0;const service=createExecutablePresentationService({storage:{transaction:async()=>{writes++;}},artifacts:{read:async()=>{writes++;},write:async()=>{writes++;}},resolve,eligible:async()=>true,policySha256:'a'.repeat(64)});
 const outcome=await service.request({packId,baseRevision:descriptor.revision,sourceRevision:source.revision,capability:'executable-presentation'});
 assert.deepEqual(outcome,{status:'blocked',reason:'presentation-base-unsupported'});assert.equal(writes,0,'nothing is admitted for an unsatisfiable demand');
});

// Registry entry 4: the builds from #249 (Luke text published) serve proof index 7140879c,
// whose authority names catalog f5ce2e24. Replayed from its stored bytes, never from today's
// index, with the EXECUTION_POLICY those builds wrote written out: a later content or code
// release may move either, and the replay must still write entry 4's literal policy.
const F5CE2E24_POLICY='85233c7eae23efb5ad52150a1232600ad4376e8a865173bc8a62208cc6fe6a9d';
const P7140879C={id:'approved-audio-proof-index',path:'/content/approved-audio/7140879c9b324a068e48dc83eaff85669022528977f104c02434332b58415c56.json',sha256:'7140879c9b324a068e48dc83eaff85669022528977f104c02434332b58415c56',bytes:4311,mime:'application/json'};
test('the #249 build (catalog f5ce2e24, proof index 7140879c, @2) replays to registry entry 4 and its rows stay registered',async()=>{
 const storedBytes=new Uint8Array(await readFile(APPROVED+P7140879C.sha256+'.json')),stored=JSON.parse(new TextDecoder().decode(storedBytes));
 assert.equal(storedBytes.length,P7140879C.bytes);assert.equal(await sha256(storedBytes),P7140879C.sha256,'the stored 7140879c proof index is byte-exact');
 assert.deepEqual(stored.authority,{registrySha256:'f5ce2e2475e4198a927ad4daa07b3285053070f4a3a308141e55e54ab13f33b3',sourceRevision:'f8776d92b090b5af5b17b17dc1137f25fb059ed0'});
 const policy=await sha256(canonicalJSONString({policy:'fia-source-to-app/7fa17af806c139cfc353cace39fa6d50ed9e061b',approvedAudio:P7140879C}));
 assert.equal(policy,F5CE2E24_POLICY,'the replayed #249 build must write registry entry 4\'s literal policy. Never edit entry 4 or F5CE2E24_POLICY: a moved policy is a new build, appended as its own literal entry');
 const {SUPERSEDED_BUILDS}=await import('../../server/fia/preparation/executable-presentation-runtime.mjs');
 assert.deepEqual(SUPERSEDED_BUILDS[3],{policy:F5CE2E24_POLICY,recipe:'fia-server-source-action-projector@2',approvedAudio:true});
 const prior=SUPERSEDED_BUILDS.slice(0,3).map(b=>b.policy);assert.ok(!prior.includes(F5CE2E24_POLICY),'entry 4 is a new build beside entries 1-3, which stay');
});
