import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {buildGeneralizedSnapshot} from '../../server/fia/publication/generalized.mjs';
import {exportGuideSources} from '../../server/fia/compiler/presentation/export-guide-sources.mjs';
import {buildApprovedAudioProofIndex} from '../../scripts/approved-audio-proof-index.mjs';
import {canonicalJSONString,sha256} from '../../server/fia/preparation/contract.mjs';
import {createExecutableOperations} from '../../server/fia/publication/executable-operations.mjs';
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json')),{build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://dev.fiaguide.app',publicRoot='apps/web/public',ROOT='fia-executable-presentation-authority@1';
const encode=v=>new TextEncoder().encode(canonicalJSONString(v));
// Test-only entry: the release Worker plus a storage door on its own origin, so a test
// can read and tamper with one persisted state. It is never part of a release bundle.
const entry=`import worker,{FiaPreparationJobs as Jobs} from ${JSON.stringify(resolve('server/faces/worker/entry.mjs'))};
export class FiaPreparationJobs extends Jobs{async fetch(request){const url=new URL(request.url);if(url.origin!=='https://transition.test')return super.fetch(request);
 if(url.pathname==='/dump')return Response.json(Object.fromEntries(await this.ctx.storage.list()));
 const {key,value}=await request.json();if(value===null)await this.ctx.storage.delete(key);else await this.ctx.storage.put(key,value);return Response.json(true);}}
export default worker;`;

// One persisted Durable Object/R2 state across two releases: the first without an
// approved-audio proof index (the PR #187/#188 policy), the second with it (PR #189).
// This is the DEV transition that left eng.MRK-1-14-20 refused with
// execution-job-policy, and the default passage answering 500 on Open.
async function releases(){
 const dir=await mkdtemp(join(tmpdir(),'fia-executable-transition-')),authority=JSON.parse(await readFile('server/fia/publication/trusted-generalized.json')),extension=buildGeneralizedSnapshot(publicRoot,authority),canonicalSources=exportGuideSources({outputRoot:dir,sourceRevision:authority.sourceCommit});
 const proof=await buildApprovedAudioProofIndex({publicRoot,authority:{registrySha256:authority.catalog.sha256,sourceRevision:authority.sourceCommit}});
 const base={schema:'fia.worker-read-snapshot.v1',records:extension.records,current:extension.current,staticArtifacts:extension.staticArtifacts,artifacts:[],canonicalSources,generalizedAuthority:extension.authority};
 const counts={external:0};
 async function runtime(snapshot){
  const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'transition-entry.mjs',loader:'js'},bundle:true,platform:'browser',format:'esm',external:['node:*'],write:false,plugins:[{name:'transition-snapshot',setup(b){b.onResolve({filter:/generated\/snapshot\.json$/},()=>({path:'snapshot',namespace:'transition'}));b.onLoad({filter:/.*/,namespace:'transition'},()=>({contents:JSON.stringify(snapshot),loader:'json'}));}}]});
  return new Miniflare({...convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{FIA_API_ORIGIN:origin},durableObjects:{FIA_PREPARATION_JOBS:{className:'FiaPreparationJobs',useSQLite:true}},r2Buckets:['FIA_ORIGINALS'],serviceBindings:{ASSETS:async request=>{const path=new URL(request.url).pathname;assert.ok(/^\/content\/[a-zA-Z0-9._/-]+$/.test(path)&&!path.includes('..'),path);let bytes;try{bytes=path===proof.descriptor.path?proof.bytes:await readFile((path.startsWith('/content/source-guides/')?dir:publicRoot)+path);}catch(error){if(error.code!=='ENOENT')throw error;return new Response('Not found',{status:404});}return new Response(bytes,{headers:{'Content-Type':'application/json','Content-Length':String(bytes.length)}});}},outboundService:()=>{counts.external++;throw Error('External work forbidden');}}),resourcePersistencePath:join(dir,'storage')});
 }
 return {dir,counts,before:()=>runtime(base),after:()=>runtime({...base,approvedAudioProofIndex:proof.descriptor})};
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
// Before: publish both passages under the superseded policy. After: the new release.
async function stalePublications(r){
 let mf=await r.before();const read=http(mf),published={};
 try{
  for(const packId of ['eng.MRK-1-14-20','eng.MRK-1-21-28']){
   const base=await read('/v1/packs/'+packId);assert.equal(base.status,200);assert.ok(base.body.preparationDemand,packId);
   const ready=await prepare(read,base.body.preparationDemand);assert.equal(ready.status,200,JSON.stringify(ready.body));assert.equal(ready.body.status,'ready');
   published[packId]={demand:base.body.preparationDemand,revision:ready.body.record.revision,jobId:ready.body.jobId};
   assert.equal((await read('/v1/packs/'+packId)).body.revision,ready.body.record.revision);
  }
 }finally{await mf.dispose();}
 mf=await r.after();return {mf,published};
}

test('only an authenticated historical publication yields its current read to the base; forged, unregistered or corrupt rows and wrong pointers stay refused, and no read writes',async()=>{
 const r=await releases(),{mf,published}=await stalePublications(r);
 try{
  const read=http(mf),call=mcp(mf),s=await store(mf),packId='eng.MRK-1-14-20',prior=published[packId];
  const rows=await s.rows(),pointer=rows['executable-current:'+packId],record=rows[pointer],jobId=record.provenance.jobId,job=rows['executable-presentation:job:'+jobId],demand=rows['executable-demand:'+jobId],ownersKey='executable-artifact:'+record.artifact.sha256,owners=rows[ownersKey];
  assert.equal(pointer,`executable-record:${packId}@${prior.revision}`);assert.equal(jobId,prior.jobId);assert.equal(job.policySha256,await sha256('fia-source-to-app/7fa17af806c139cfc353cace39fa6d50ed9e061b'),'the registered historical policy: no approved-audio proof index');
  const authentic=async label=>{
   const before=await s.durable(),viaHttp=await read('/v1/packs/'+packId),viaMcp=await call('read_pack',{packId});
   assert.equal(viaHttp.status,200,`${label}: ${JSON.stringify(viaHttp.body)}`);assert.equal(viaHttp.body.status,'ready');assert.equal(viaHttp.body.execution,undefined,'the historical publication is not served as current');
   assert.deepEqual(viaHttp.body.preparationDemand,prior.demand,'the current base carries its existing demand');assert.notEqual(viaHttp.body.revision,prior.revision);
   assert.deepEqual(viaMcp,viaHttp.body,label+': HTTP/MCP parity');assert.equal(await s.durable(),before,label+': the read writes nothing');
  };
  const refused=async label=>{
   const before=await s.durable(),viaHttp=await read('/v1/packs/'+packId),viaMcp=await call('read_pack',{packId});
   assert.equal(viaHttp.status,404,`${label}: answered ${viaHttp.status} ${viaHttp.body.status}${viaHttp.body.preparationDemand?' with the base and its demand':' '+viaHttp.body.reason}`);assert.equal(viaHttp.body.status,'unavailable',label);assert.equal(viaHttp.body.preparationDemand,undefined,label+': no demand');assert.equal(viaHttp.body.revision,undefined,label+': no base');
   assert.deepEqual(viaMcp,viaHttp.body,label+': HTTP/MCP parity');assert.equal(await s.durable(),before,label+': the read writes nothing');
  };
  await authentic('authentic historical publication');
  assert.equal((await read(`/v1/packs/${packId}?revision=${prior.revision}`)).status,404,'the exact historical revision stays denied');
  const status=await read('/v1/presentation-preparations/'+jobId);assert.equal(status.status,409,JSON.stringify(status.body));assert.equal(status.body.status,'blocked','the old job-status read stays denied');
  const unregistered=await sha256('fia-source-to-app/unregistered'),recomputed=await sha256(encode({schema:'fia-executable-presentation-job@1',args:job.args,context:job.context.sha256,policySha256:unregistered,providerSha256:job.providerSha256,recipeRevision:job.recipeRevision}));
  const cases=[
   ['forged policy string',[['executable-presentation:job:'+jobId,{...job,policySha256:'fia-source-to-app/7fa17af806c139cfc353cace39fa6d50ed9e061b'}]]],
   ['recomputed but unregistered policy',[['executable-presentation:job:'+recomputed,{...job,jobId:recomputed,policySha256:unregistered}],['executable-demand:'+recomputed,demand],[pointer,{...record,provenance:{...record.provenance,jobId:recomputed}}]]],
   ['corrupt job row: an unexpected field',[['executable-presentation:job:'+jobId,{...job,note:'x'}]]],
   ['corrupt job row: its id does not recompute',[['executable-presentation:job:'+jobId,{...job,args:{...job.args,sourceRevision:'0'.repeat(40)}}]]],
   ['request row binds another revision',[['executable-demand:'+jobId,{...demand,revision:'0'.repeat(64)}]]],
   ['artifact owner index omits the publication',[[ownersKey,owners.filter(k=>k!==pointer)]]],
   ['wrong pointer: another passage',[['executable-current:'+packId,rows['executable-current:eng.MRK-1-21-28']]]],
   ['wrong pointer: dangling revision',[['executable-current:'+packId,`executable-record:${packId}@${'0'.repeat(64)}`]]],
  ];
  const outcomes=[],outcome=async(label,run)=>{try{await run();outcomes.push([label,'refused']);}catch(error){outcomes.push([label,error.message.split('\n')[0]]);}};
  for(const [label,writes] of cases){
   for(const [key,value] of writes)await s.put(key,value);
   try{await outcome(label,()=>refused(label));}finally{for(const [key] of writes)await s.put(key,rows[key]??null);}
  }
  // Corrupt retained context bytes: the job row names bytes that no longer hash.
  const context=await s.bucket.get(job.context.reference),original=new Uint8Array(await context.arrayBuffer());
  await s.bucket.put(job.context.reference,new TextEncoder().encode('{"corrupt":true}'));
  try{await outcome('corrupt retained context bytes',()=>refused('corrupt retained context bytes'));}finally{await s.bucket.put(job.context.reference,original);}
  assert.deepEqual(outcomes.filter(([,result])=>result!=='refused'),[],'every unauthenticated case stays refused');assert.equal(outcomes.length,cases.length+1);
  await authentic('restored authentic historical publication');
  assert.equal(r.counts.external,0);
 }finally{await mf.dispose();await rm(r.dir,{recursive:true,force:true});}
});

test('an explicit Open under the new policy adopts new bytes; identical bytes refuse typed and never overwrite the historical row, whose reads stay denied',async()=>{
 const r=await releases(),{mf,published}=await stalePublications(r);
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
   if(packId==='eng.MRK-1-14-20'){
    assert.equal(again.status,200,`${packId}: ${JSON.stringify(again.body)}`);assert.equal(again.body.status,'ready');assert.notEqual(again.body.record.revision,prior.revision,'the approved-audio policy changes these bytes');
    const current=await read('/v1/packs/'+packId);assert.equal(current.status,200);assert.equal(current.body.revision,again.body.record.revision);assert.equal(current.body.execution.schema,'fia-executable-catalog@1');
   }else{
    // The same presentation bytes under a newer job: the historical row and its
    // provenance are immutable, so the republish is a typed conflict.
    assert.equal(again.status,409,`${packId}: ${JSON.stringify(again.body)}`);assert.equal(again.body.schema,'fia-presentation-preparation@1');assert.equal(again.body.status,'blocked');assert.equal(again.body.reason,'executable-publication-conflict');assert.equal(again.body.record,null);
    assert.deepEqual(await call('prepare_presentation',reopened.body.preparationDemand),again.body,'HTTP/MCP parity');
    const current=await read('/v1/packs/'+packId);assert.equal(current.status,200);assert.equal(current.body.execution,undefined);assert.deepEqual(current.body.preparationDemand,prior.demand);
   }
   const after=await s.rows();
   assert.equal(canonicalJSONString(after[key]),canonicalJSONString(historical),`${packId}: the historical row and its provenance are preserved`);
   assert.deepEqual(after['executable-demand:'+prior.jobId],rows['executable-demand:'+prior.jobId],`${packId}: the historical request row is preserved`);
   assert.equal((await read(`/v1/packs/${packId}?revision=${prior.revision}`)).status,404,'the exact historical revision stays denied');
   const status=await read('/v1/presentation-preparations/'+prior.jobId);assert.equal(status.status,409,JSON.stringify(status.body));assert.equal(status.body.status,'blocked','the old job-status read stays denied, never ready');
  }
  assert.equal(r.counts.external,0);
 }finally{await mf.dispose();await rm(r.dir,{recursive:true,force:true});}
});

test('expected publication conflicts and stale-job status reads answer the typed blocked envelope with their code, never a thrown 500',async()=>{
 const rows=new Map(),storage={transaction:async run=>run({get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>{rows.set(k,structuredClone(v));}})};
 const demand={packId:'eng.MRK-1-14-20',baseRevision:'a'.repeat(64),sourceRevision:'b'.repeat(40),capability:'executable-presentation'},jobId='c'.repeat(64),ready={status:'ready',jobId,presentation:{},boundArtifacts:[],provenance:{}};
 const ops=(service,publish)=>createExecutableOperations({reads:{readPack:async()=>({status:'unavailable',reason:'not-found'})},service,publication:{publish},storage});
 const blocked=(reason,id=jobId)=>({schema:'fia-presentation-preparation@1',status:'blocked',jobId:id,reason,record:null});
 for(const code of ['executable-publication-conflict','executable-pointer-conflict','executable-base-stale','executable-publication-revoked','executable-publication-refused']){
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
