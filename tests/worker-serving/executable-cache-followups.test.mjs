import test from 'node:test';
import assert from 'node:assert/strict';
import {createExecutableOverlay} from '../../server/fia/publication/executable-overlay.mjs';
import {createExecutableRuntime} from '../../server/fia/preparation/executable-presentation-runtime.mjs';
import {sha256} from '../../server/fia/preparation/contract.mjs';
// Follow-ups to fia-app#254 (cookbook package-luke RULING.md § DEV publication conflict):
// cache misses are signalled for bookkeeping in production, a rejecting hook is contained,
// transient faults are told apart from verification misses, a replaced row prunes its
// stale owner-index entries, and the unreachable historical authentication is gone.
const h=x=>x.repeat(64),packId='eng.MRK-1-14-20';
const binding={packId,baseRevision:h('a'),sourceRevision:'b'.repeat(40),capability:'executable-presentation'};
const candidate={binding,presentation:{id:packId,execution:{schema:'fixture'},activities:[]},boundArtifacts:[],provenance:{recipe:h('c')}};
function fixture(){
 const kv=new Map(),blobs=new Map(),state={storageFault:null,readFault:null};
 const storage={transaction:async fn=>{if(state.storageFault)throw state.storageFault;const staged=new Map(kv);const out=await fn({get:async k=>staged.has(k)?structuredClone(staged.get(k)):undefined,put:async(k,v)=>{staged.set(k,structuredClone(v));},delete:async k=>{staged.delete(k);}});kv.clear();for(const [k,v] of staged)kv.set(k,v);return out;}};
 const artifacts={async write(b){const sha=await sha256(b);blobs.set(sha,new Uint8Array(b));return {reference:sha,sha256:sha};},async read(d){if(state.readFault)throw state.readFault;return new Uint8Array(blobs.get(d.reference));}};
 const base={readCatalog:async(id,revision)=>id===packId&&(!revision||revision===binding.baseRevision)?{status:'ready',packId:id,revision:binding.baseRevision,artifact:{sha256:binding.baseRevision,bytes:2,mime:'application/json'}}:{status:'unavailable',reason:'not-found'},findArtifact:async()=>null};
 const make=(extra={})=>createExecutableOverlay({storage,artifacts,base,eligible:()=>true,validate:async c=>c.presentation.execution.schema==='fixture',...extra});
 return {kv,blobs,state,make,storage};
}
const bound=async text=>{const bytes=new TextEncoder().encode(text);return {id:'bound:'+text,bytes,sha256:await sha256(bytes)};};

test('a rejecting or throwing diagnose hook is contained and never changes the read',async()=>{
 const f=fixture(),record=await f.make().publish(candidate);f.blobs.set(record.revision,new TextEncoder().encode('corrupt'));
 const unhandled=[],listen=e=>unhandled.push(e);process.on('unhandledRejection',listen);
 try{
  const rejecting=f.make({diagnose:async()=>{throw Error('metrics-down');}});
  assert.equal((await rejecting.readCatalog(packId)).revision,binding.baseRevision);assert.equal(await rejecting.findArtifact(record.revision),null);
  const throwing=f.make({diagnose:()=>{throw Error('metrics-down');}});
  assert.equal((await throwing.readCatalog(packId)).revision,binding.baseRevision);
  await new Promise(r=>setImmediate(r));
  assert.deepEqual(unhandled,[],'an async hook rejection is not an unhandled rejection');
 }finally{process.off('unhandledRejection',listen);}
});

test('transient storage and R2 faults are told apart from verification misses; both serve the base',async()=>{
 const f=fixture(),record=await f.make().publish(candidate),seen=[],overlay=f.make({diagnose:d=>seen.push(d)}),stored=f.blobs.get(record.revision);
 f.blobs.set(record.revision,new TextEncoder().encode('corrupt'));
 assert.equal((await overlay.readCatalog(packId)).revision,binding.baseRevision);
 f.blobs.set(record.revision,stored);f.state.readFault=Error('R2 GET failed: connection reset');
 assert.equal((await overlay.readCatalog(packId)).revision,binding.baseRevision);
 f.state.readFault=Error('execution-storage-timeout');
 assert.equal(await overlay.findArtifact(record.revision),null);
 f.state.readFault=null;f.state.storageFault=Error('Durable Object storage operation exceeded timeout');
 assert.equal((await overlay.readCatalog(packId)).revision,binding.baseRevision,'a storage fault on the read falls through to the base');
 assert.equal(await overlay.findArtifact(record.revision),null);
 assert.deepEqual(seen.map(d=>[d.where,d.kind,d.reason]),[
  ['readCatalog','verification','executable-artifact-corrupt'],
  ['readCatalog','transient','R2 GET failed: connection reset'],
  ['findArtifact','transient','execution-storage-timeout'],
  ['readCatalog','transient','Durable Object storage operation exceeded timeout'],
  ['findArtifact','transient','Durable Object storage operation exceeded timeout'],
 ]);
 assert.ok(seen.every(d=>d.event==='executable-cache-miss'));
 f.state.storageFault=null;assert.equal((await overlay.readCatalog(packId)).revision,record.revision,'once the fault clears the cached row is served again');
});

test('a storage fault on an exact-revision read throws (publish is never turned into not-found); the pointer read still falls back',async()=>{
 const f=fixture(),record=await f.make().publish(candidate),seen=[],overlay=f.make({diagnose:d=>seen.push(d)});
 f.state.storageFault=Error('Durable Object storage operation exceeded timeout');
 await assert.rejects(overlay.readCatalog(packId,record.revision),/exceeded timeout/);
 assert.equal((await overlay.readCatalog(packId)).revision,binding.baseRevision);
 assert.deepEqual(seen.map(d=>[d.where,d.kind]),[['readCatalog','transient']]);
 // publish()'s post-commit read: a fault there rejects instead of answering a not-found record.
 f.state.storageFault=null;let commits=0,armed=false;
 const flaky=f.make({diagnose:d=>seen.push(d),storage:{transaction:async fn=>{if(armed)throw Error('storage blip');const out=await f.storage.transaction(fn);if(++commits===2)armed=true;return out;}}});
 await assert.rejects(flaky.publish({...candidate,presentation:{...candidate.presentation,other:2}}),/storage blip/);
 assert.equal(commits,2,'the pointer was committed before the post-commit read faulted');
});

test('replacing a row prunes owner-index entries for bound artifacts it no longer binds',async()=>{
 const f=fixture(),seen=[],overlay=f.make({diagnose:d=>seen.push(d)}),old=await bound('old'),kept=await bound('kept'),added=await bound('new');
 const first=await overlay.publish({...candidate,boundArtifacts:[old,kept]}),key=`executable-record:${packId}@${first.revision}`;
 assert.deepEqual(f.kv.get('executable-artifact:'+old.sha256),[key]);
 // Another key that shares the dropped artifact keeps its own owner entry.
 const other=await overlay.publish({...candidate,presentation:{...candidate.presentation,other:1},boundArtifacts:[old]}),otherKey=`executable-record:${packId}@${other.revision}`;
 assert.deepEqual(f.kv.get('executable-artifact:'+old.sha256),[key,otherKey]);
 const again=await overlay.publish({...candidate,boundArtifacts:[kept,added]});assert.equal(again.revision,first.revision,'same presentation bytes, same content key');
 assert.deepEqual(f.kv.get('executable-artifact:'+old.sha256),[otherKey],'the replaced row no longer owns the dropped artifact');
 assert.deepEqual(f.kv.get('executable-artifact:'+kept.sha256),[key]);assert.deepEqual(f.kv.get('executable-artifact:'+added.sha256),[key]);
 assert.deepEqual(f.kv.get('executable-artifact:'+first.revision),[key]);
 // Dropped by the only row that owned it: the index entry is removed.
 await overlay.publish({...candidate,boundArtifacts:[kept]});assert.equal(f.kv.has('executable-artifact:'+added.sha256),false);
 seen.length=0;assert.equal(await overlay.findArtifact(added.sha256),null);assert.deepEqual(seen,[],'no stale owner costs findArtifact a verification pass');
 assert.equal((await overlay.findArtifact(old.sha256)).content,'old','the other owner still serves the shared artifact');
});

test('the overlay exposes no historical authentication; a superseded row is a plain cache miss',()=>{
 assert.deepEqual(Object.keys(fixture().make()),['publish','readCatalog','findArtifact']);
});

async function runtime(capabilities){
 const content=JSON.stringify({id:packId}),revision=await sha256(new TextEncoder().encode(content)),artifact={sha256:revision,bytes:content.length,mime:'application/json'};
 const snapshot={schema:'fia.worker-read-snapshot.v1',artifacts:[{descriptor:artifact,content}],records:[{status:'ready',packId,revision,artifact}],current:{[packId]:revision}};
 const kv=new Map([['executable-current:'+packId,`executable-record:${packId}@${h('f')}`]]);
 const storage={transaction:async fn=>fn({get:async k=>structuredClone(kv.get(k)),put:async(k,v)=>{kv.set(k,structuredClone(v));}})};
 const env={ASSETS:{fetch:async()=>new Response('',{status:404})},FIA_ORIGINALS:{get:async()=>null,put:async()=>{}},FIA_API_ORIGIN:'https://dev.fiaguide.app'};
 const ops=await createExecutableRuntime({ctx:{storage},env,snapshot,capabilities});
 return {ops,revision};
}
test('the production runtime signals cache misses: a structured log line by default, or the supplied hook',async()=>{
 const seen=[],{ops,revision}=await runtime({diagnose:d=>seen.push(d)});
 assert.equal((await ops.readPack({packId})).revision,revision,'a dangling pointer serves the base');
 assert.deepEqual(seen.map(d=>[d.event,d.where,d.kind,d.reason]),[['executable-cache-miss','readCatalog','verification','executable-pointer-dangling']]);
 const warn=console.warn,lines=[];console.warn=(...a)=>lines.push(a);
 try{const fallback=await runtime({});assert.equal((await fallback.ops.readPack({packId})).revision,fallback.revision);}finally{console.warn=warn;}
 assert.equal(lines.length,1);const logged=JSON.parse(lines[0][0]);assert.equal(logged.event,'executable-cache-miss');assert.equal(logged.reason,'executable-pointer-dangling');
});
