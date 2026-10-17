import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createExecutableOverlay} from '../../server/fia/publication/executable-overlay.mjs';
import {createExecutableOperations} from '../../server/fia/publication/executable-operations.mjs';
import {createReadOperations} from '../../server/fia/publication/read-operations.mjs';
import {createWorker} from '../../server/faces/worker/adapter.mjs';
import {serveMcp,VERSION} from '../../server/faces/mcp.mjs';
import {serveRead} from '../../server/faces/http.mjs';
import {sha256} from '../../server/fia/preparation/contract.mjs';
const h=x=>x.repeat(64),origin='https://dev.fiaguide.app';
const binding={packId:'eng.MRK-1-14-20',baseRevision:h('a'),sourceRevision:'b'.repeat(40),capability:'executable-presentation'};
// Synthetic domain candidate: these tests prove publication/transport, not semantics.
const candidate={binding,presentation:{id:binding.packId,execution:{schema:'fixture'},activities:[]},boundArtifacts:[],provenance:{recipe:h('c')}};
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'fia-publication-'));let db,queue=Promise.resolve(),allowed=true,failPointer=false;
 const open=()=>{db=new DatabaseSync(join(dir,'state.db'));db.exec('CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY,v TEXT NOT NULL)');};open();
 const storage={transaction(fn){const p=queue.then(async()=>{db.exec('BEGIN');try{const result=await fn({get:async k=>{const r=db.prepare('SELECT v FROM kv WHERE k=?').get(k);return r?JSON.parse(r.v):undefined;},put:async(k,v)=>{if(failPointer&&k.startsWith('executable-current:'))throw Error('pointer-crash');db.prepare('INSERT OR REPLACE INTO kv VALUES (?,?)').run(k,JSON.stringify(v));}});db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}});queue=p.catch(()=>{});return p;}};
 const artifacts={async write(b){const sha=await sha256(b);await writeFile(join(dir,sha),b);return {reference:sha,sha256:sha};},async read(d){return new Uint8Array(await readFile(join(dir,d.reference)));}};
 const base={readCatalog:async(id,revision)=>id===binding.packId&&(!revision||revision===binding.baseRevision)?{status:'ready',packId:id,revision:binding.baseRevision,artifact:{sha256:binding.baseRevision,bytes:2,mime:'application/json'},identity:{packId:id}}:{status:'unavailable',reason:'not-found'},findArtifact:async()=>null};
 const make=(extra={})=>createExecutableOverlay({storage,artifacts,base,eligible:()=>allowed,validate:async c=>c.presentation.execution.schema==='fixture',...extra});
 return {dir,storage,make,base,setAllowed:v=>allowed=v,setCrash:v=>failPointer=v,reopen(){db.close();open();},async close(){await queue;db.close();await rm(dir,{recursive:true,force:true});}};
}
test('actual MCP prepare/read_pack/read_artifact and HTTP share exact immutable bytes, restart and revocation',async()=>{
 const f=await fixture();try{
  let executions=0;const overlay=f.make(),reads=createReadOperations(overlay),service={request:async()=>{executions++;return {status:'ready',jobId:h('d'),...candidate};},read:async()=>{throw Error('ready poll must use publication');}};
  const ops=createExecutableOperations({reads,service,publication:overlay,storage:f.storage});
  const worker=createWorker({origin,operations:ops,serveRead,serveMcp});
  async function rpc(name,args){const r=await worker.fetch(new Request(origin+'/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':VERSION},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),{});assert.equal(r.status,200);return (await r.json()).result.structuredContent;}
  const prepared=await rpc('prepare_presentation',binding);assert.equal(prepared.status,'ready');assert.equal(executions,1);
  const record=await rpc('read_pack',{packId:binding.packId});assert.equal(record.revision,prepared.record.revision);
  const artifact=await rpc('read_artifact',{sha256:record.revision});assert.equal(await sha256(new TextEncoder().encode(artifact.content)),record.revision);assert.equal(Buffer.byteLength(artifact.content),record.artifact.bytes);
  const http=await worker.fetch(new Request(origin+'/v1/artifacts/'+record.revision),{});assert.equal(await http.text(),artifact.content);assert.equal(http.headers.get('cache-control'),'private, no-store');
  for(let i=0;i<3;i++){assert.equal((await rpc('read_presentation_preparation',{jobId:h('d')})).status,'ready');await rpc('read_pack',{packId:binding.packId});await rpc('read_artifact',{sha256:record.revision});}assert.equal(executions,1);
  f.reopen();assert.equal((await f.make().readCatalog(binding.packId)).revision,record.revision);
  // Revocation is a cache miss: the current read falls through to the base record.
  f.setAllowed(false);const fallback=await rpc('read_pack',{packId:binding.packId});assert.equal(fallback.status,'ready');assert.equal(fallback.revision,binding.baseRevision);assert.equal(fallback.execution,undefined);assert.equal((await rpc('read_pack',{packId:binding.packId,revision:record.revision})).status,'unavailable');assert.equal((await rpc('read_artifact',{sha256:record.revision})).status,'unavailable');assert.equal(executions,1);
 }finally{await f.close();}
});
test('interrupted pointer publication leaves base coherent; corrupt cached bytes are a cache miss that falls through to the base, signals diagnostics, and a republish repairs it',async()=>{const f=await fixture();try{f.setCrash(true);await assert.rejects(f.make().publish(candidate),/pointer-crash/);assert.equal((await f.make().readCatalog(binding.packId)).revision,binding.baseRevision);f.reopen();f.setCrash(false);const r=await f.make().publish(candidate);await writeFile(join(f.dir,r.revision),'corrupt');
 const events=[],overlay=f.make({diagnostics:e=>events.push(e)}),read=await overlay.readCatalog(binding.packId);
 assert.equal(read.status,'ready','a corrupt cached row never answers unavailable');assert.equal(read.revision,binding.baseRevision);assert.equal(read.execution,undefined);
 assert.equal((await overlay.findArtifact(r.revision)).status,'unavailable','the base has no such artifact: not-found, not a refusal of usage');
 assert.deepEqual(events.map(e=>[e.event,e.where,e.reason]),[['executable-cache-miss','read-catalog','executable-artifact-corrupt'],['executable-cache-miss','find-artifact','executable-artifact-corrupt']]);
 const throwing=f.make({diagnostics:()=>{throw Error('sink down');}});assert.equal((await throwing.readCatalog(binding.packId)).revision,binding.baseRevision,'a diagnostics fault never changes the answer');
 const again=await overlay.publish(candidate);assert.equal(again.revision,r.revision);assert.equal((await overlay.readCatalog(binding.packId)).revision,r.revision,'re-preparing the same content repairs the cache');
}finally{await f.close();}});
test('a publish whose record key already exists replaces the row and advances the pointer, never an executable-publication-conflict',async()=>{const f=await fixture();try{
 const events=[],overlay=f.make({diagnostics:e=>events.push(e)}),first=await overlay.publish({...candidate,provenance:{...candidate.provenance,jobId:h('1')}}),key=`executable-record:${binding.packId}@${first.revision}`;
 const other=await overlay.publish({...candidate,presentation:{...candidate.presentation,other:'new'}});assert.notEqual(other.revision,first.revision);assert.equal((await overlay.readCatalog(binding.packId)).revision,other.revision);
 const again=await overlay.publish({...candidate,provenance:{...candidate.provenance,jobId:h('2')}});
 assert.equal(again.status,'ready');assert.equal(again.revision,first.revision,'identical bytes keep their content key');assert.equal(again.execution.provenance.jobId,h('2'));
 assert.equal(await f.storage.transaction(t=>t.get('executable-current:'+binding.packId)),key,'the pointer advances to the replaced row');
 assert.equal((await f.storage.transaction(t=>t.get(key))).provenance.jobId,h('2'),'the row is replaced');
 assert.equal((await overlay.readCatalog(binding.packId)).revision,first.revision);assert.equal((await overlay.findArtifact(first.revision)).artifact.sha256,first.revision);
 assert.deepEqual(events.map(e=>[e.event,e.reason]),[['executable-cache-replace','executable-row-replaced']]);
 const same=await overlay.publish({...candidate,provenance:{...candidate.provenance,jobId:h('2')}});assert.equal(same.revision,first.revision);assert.equal(events.length,1,'an identical row is a silent no-op replace');
}finally{await f.close();}});
test('closed demand rejects raw model input and URLs; reads cannot repair unfinished publication',async()=>{const f=await fixture();try{let calls=0;const publication=f.make(),ops=createExecutableOperations({reads:createReadOperations(publication),publication,storage:f.storage,service:{request:async()=>{calls++;return {status:'preparing',jobId:h('e')};},read:async()=>({status:'ready'})}});assert.equal((await ops.preparePresentation({...binding,url:'https://evil.invalid'})).status,'refused');assert.equal(calls,0);assert.equal((await ops.preparePresentation(binding)).status,'preparing');assert.equal((await ops.readPresentationPreparation({jobId:h('e')})).reason,'publication-not-committed');assert.equal((await publication.readCatalog(binding.packId)).revision,binding.baseRevision);assert.equal(calls,1);}finally{await f.close();}});
test('foreign, swapped revision and dangling current pointer never serve a different publication; each falls through to the base',async()=>{const f=await fixture();try{const overlay=f.make(),record=await overlay.publish(candidate),key=`executable-record:${binding.packId}@${record.revision}`;const row=await f.storage.transaction(t=>t.get(key));await f.storage.transaction(async t=>{await t.put('executable-current:spa.MRK-1-14-20',key);await t.put(`executable-record:${binding.packId}@${h('f')}`,row);});assert.equal((await overlay.readCatalog('spa.MRK-1-14-20')).status,'unavailable');assert.equal((await overlay.readCatalog(binding.packId,h('f'))).status,'unavailable');await f.storage.transaction(t=>t.put('executable-current:'+binding.packId,'missing'));const dangling=await overlay.readCatalog(binding.packId);assert.equal(dangling.status,'ready');assert.equal(dangling.revision,binding.baseRevision);}finally{await f.close();}});
test('new publication refuses raced base advance while an eligible already-published pinned prior remains readable',async()=>{const f=await fixture();try{let advance=false;const original=f.base.readCatalog;f.base.readCatalog=async(id,rev)=>!rev&&advance?{...await original(id,rev),revision:h('f')}:original(id,rev);const overlay=f.make(),prior=await overlay.publish(candidate);advance=true;assert.equal((await overlay.readCatalog(binding.packId,prior.revision)).status,'ready');assert.equal((await overlay.readCatalog(binding.packId)).status,'ready');advance=false;const raced=f.make({validate:async()=>{advance=true;return true;}});await assert.rejects(raced.publish({...candidate,presentation:{...candidate.presentation,other:'new'}}),/executable-base-stale/);assert.equal((await overlay.readCatalog(binding.packId)).revision,prior.revision);}finally{await f.close();}});
test('concurrent preparing observer sees ready publication after owning demand completes without another POST',async()=>{const f=await fixture();try{let count=0,release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);const publication=f.make(),reads=createReadOperations(publication),service={request:async()=>{if(++count===1){entered();await gate;return {status:'ready',jobId:h('d'),...candidate};}return {status:'preparing',jobId:h('d')};},read:async()=>({status:'preparing'})};const ops=createExecutableOperations({reads,service,publication,storage:f.storage}),own=ops.preparePresentation(binding);await started;assert.equal((await ops.preparePresentation(binding)).status,'preparing');assert.equal((await ops.readPresentationPreparation({jobId:h('d')})).status,'preparing');release();assert.equal((await own).status,'ready');assert.equal((await ops.readPresentationPreparation({jobId:h('d')})).status,'ready');assert.equal(count,2);}finally{await f.close();}});
test('server media identity requires exact verified base assets and rejects foreign or changed bindings',async()=>{const f=await fixture();try{
 const assets={map:{id:'map',kind:'map',remoteSrc:'https://publisher.invalid/map.png'}},content=JSON.stringify({assets}),baseRevision=await sha256(new TextEncoder().encode(content)),request={...binding,baseRevision};
 f.base.readCatalog=async(packId,revision)=>packId===request.packId&&(!revision||revision===baseRevision)?{status:'ready',packId,revision:baseRevision,artifact:{sha256:baseRevision,bytes:Buffer.byteLength(content),mime:'application/json'}}:{status:'unavailable'};
 f.base.findArtifact=async digest=>digest===baseRevision?{content}:null;
 const value={...candidate,binding:request,presentation:{...candidate.presentation,assets}},overlay=f.make(),record=await overlay.publish(value);
 assert.deepEqual(record.execution.mediaIdentity,{packId:request.packId,revision:baseRevision});assert.match(record.execution.mediaAssetsSha256,/^[a-f0-9]{64}$/);
 await assert.rejects(overlay.publish({...value,presentation:{...value.presentation,assets:{map:{...assets.map,remoteSrc:'https://other.invalid/map.png'}}}}),/executable-media-assets-changed/);
 const key=`executable-record:${request.packId}@${record.revision}`;await f.storage.transaction(async t=>{const row=await t.get(key);row.mediaIdentity.packId='spa.MRK-1-14-20';await t.put(key,row);});
 const fallback=await overlay.readCatalog(request.packId);assert.equal(fallback.status,'ready','a changed binding is a cache miss: the base is served');assert.equal(fallback.revision,baseRevision);assert.equal(fallback.execution,undefined);assert.equal((await overlay.findArtifact(record.revision)).status,'unavailable');
 }finally{await f.close();}});
