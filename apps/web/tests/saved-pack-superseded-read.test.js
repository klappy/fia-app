import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,worker,packId,origin} from './helpers/offline-execution.js';
import {serveRead} from '../../../server/faces/http.mjs';
import {createReadOperations} from '../../../server/fia/publication/read-operations.mjs';
import {snapshotStorage} from '../../../server/faces/worker/snapshot.mjs';
// A device saves a copy, then the server moves to a new revision of the same passage. What the worker does with the saved
// copy depends on the server's answer to a read it can no longer satisfy: 503 keeps the copy, 404 revokes it. The fake
// server here answers such a read like the real one (the helper's `superseded` option), and both the worker frozen from
// the 3.0.1 release (the one devices run) and the current worker must behave the same way.
const workers=[['the 3.0.1 worker fixture','tests/fixtures/sw-3.0.1.js'],['the current worker','public/sw.js']];
const selection=f=>({revision:f.record.revision,mediaIdentity:f.record.execution.mediaIdentity,mediaAssetsSha256:f.record.execution.mediaAssetsSha256});
const save=(w,f)=>w.message({type:'DOWNLOAD_START',selection:'audio',...selection(f)});
// The new release moves the base revision as well as the prepared one, as a recompiled passage does.
function nextFixture(){const next=fixture('next'),base='f'.repeat(64);next.manifest.presentationRevision=base;next.record.execution.baseRevision=base;next.record.execution.mediaIdentity={packId,revision:base};return next;}
const revokedKeys=w=>[...w.stores.values()].flatMap(store=>[...store.keys()]).filter(key=>String(key).includes('revoked-server:'));
async function offline(w,old){w.offline(true);try{const answers=[];for(const path of ['/index.html','/audio.wav',`/v1/packs/${packId}?revision=${old.record.revision}`,`/v1/artifacts/${old.record.revision}`])answers.push((await w.fetch(path)).status);return answers;}finally{w.offline(false);}}
const steps={
 'media status with the old selection':(w,old)=>w.message({type:'MEDIA_STATUS',...selection(old)}),
 'pinned page read':(w,old)=>w.fetch(`/v1/packs/${packId}?revision=${old.record.revision}`),
 'Save of the stale revision':(w,old)=>save(w,old),
 'unpinned read plus status':async(w)=>{const read=await w.fetch(`/v1/packs/${packId}`),status=await w.message({type:'DOWNLOAD_STATUS'});return {read,status};},
 'artifact read by old digest':(w,old)=>w.fetch(`/v1/artifacts/${old.record.revision}`),
 'media play with the old selection':(w,old)=>w.message({type:'MEDIA_PLAY',...selection(old),path:'/audio.wav',deliveryRevision:null,requestId:'r1'}),
};
const pinned=['media status with the old selection','pinned page read','Save of the stale revision','artifact read by old digest','media play with the old selection'];
const scenarios={...steps,'all in sequence then Save of the new revision':async(w,old)=>{for(const name of pinned)await steps[name](w,old);}};
async function arrange(workerFile,superseded){
 const old=fixture(),next=nextFixture(),options={workerFile,superseded},w=worker(old,new Map(),options);
 const saved=await save(w,old);assert.equal(saved.ok,true,saved.error);assert.equal(saved.saved,true);
 await w.message({type:'PACK_SELECT',revision:old.record.revision});
 assert.deepEqual(await offline(w,old),[200,200,200,200],'the copy is saved before the server moves');
 w.setFixture(next);w.calls.length=0;
 return {old,next,w,options};
}
const silent=async run=>{const error=console.error,warn=console.warn;console.error=console.warn=()=>{};try{return await run();}finally{console.error=error;console.warn=warn;}};

for(const [label,workerFile] of workers){
 for(const [name,run] of Object.entries(scenarios)){
  test(`${label} keeps the saved copy when a superseded read answers 503: ${name}`,()=>silent(async()=>{
   const {old,next,w,options}=await arrange(workerFile,503);
   const outcome=await run(w,old);
   if(name==='pinned page read'||name==='artifact read by old digest')assert.equal(outcome.status,200,'the page is answered from the saved copy');
   if(name==='Save of the stale revision'){assert.equal(outcome.ok,false);assert.match(outcome.error,/temporarily unavailable/);}
   if(name==='unpinned read plus status'){assert.equal(outcome.read.status,200);assert.equal(outcome.status.saved,true);assert.equal(outcome.status.updateAvailable,true,'the update is offered');}
   if(name!=='unpinned read plus status')assert.ok(w.calls.some(call=>call.includes(old.record.revision)||call.includes(old.record.execution.baseRevision)),'a read naming the superseded revision reached the server');
   assert.deepEqual(revokedKeys(w),[],'no revoked-server key');
   assert.deepEqual(await offline(w,old),[200,200,200,200],'offline shell, media, pinned record and artifact on the same worker');
   assert.deepEqual(await offline(worker(old,w.stores,options),old),[200,200,200,200],'the same on a fresh worker over the same stores');
   if(name==='all in sequence then Save of the new revision'){
    const fresh=await save(w,next);assert.equal(fresh.ok,true,fresh.error);assert.equal(fresh.saved,true);
    assert.deepEqual(revokedKeys(w),[]);w.offline(true);assert.equal((await w.fetch(`/v1/packs/${packId}?revision=${next.record.revision}`)).status,200,'the new revision is saved');w.offline(false);
   }
  }));
  test(`control, ${label}: a 404 for the same read ${name==='unpinned read plus status'?'is never sent, so the copy is kept':'revokes the saved copy'}: ${name}`,()=>silent(async()=>{
   const {old,w,options}=await arrange(workerFile,404);
   await run(w,old);
   if(name==='unpinned read plus status'){assert.deepEqual(revokedKeys(w),[]);assert.deepEqual(await offline(w,old),[200,200,200,200]);return;}
   assert.equal(revokedKeys(w).length>0,true,'a revoked-server key is written');
   const [shell,media]=await offline(w,old);assert.equal(shell,409);assert.equal(media,409);
   const [freshShell,freshMedia]=await offline(worker(old,w.stores,options),old);assert.equal(freshShell,409);assert.equal(freshMedia,409);
  }));
 }
 test(`${label} keeps the saved copy when the stale answer is the real server's`,()=>silent(async()=>{
  // The stale answer is not written here: it is what snapshotStorage().readCatalog returns, passed through serveRead.
  const answers=[],state={operations:null};
  const real=async url=>{const out={status:0,headers:{},body:null};await serveRead({method:'GET',headers:{}},{writeHead(status,headers={}){out.status=status;out.headers=headers;return this;},end(body){out.body=body??null;}},new URL(url.pathname+url.search,origin),state.operations);answers.push({path:url.pathname+url.search,status:out.status,body:out.body});return new Response(out.body,{status:out.status,headers:out.headers});};
  const {old,next,w,options}=await arrange(workerFile,real);
  const bound={sha256:next.dependency.sha256,bytes:next.dependency.bytes,mime:next.dependency.mime};
  state.operations=createReadOperations(snapshotStorage({schema:'fia.worker-read-snapshot.v1',artifacts:[{descriptor:next.record.artifact,content:next.bytes},{descriptor:bound,content:next.boundBytes}],records:[next.record],current:{[packId]:next.record.revision}}));
  for(const name of pinned)await steps[name](w,old);
  const packReads=answers.filter(a=>a.path.startsWith('/v1/packs/')),artifactReads=answers.filter(a=>a.path.startsWith('/v1/artifacts/'));
  assert.equal(packReads.length>0,true,'a pinned read reached the real server code');
  for(const answer of packReads){assert.equal(answer.status,503,answer.path);assert.equal(answer.body,JSON.stringify({status:'unavailable',packId,reason:'revision-not-found'}));}
  for(const answer of artifactReads){assert.equal(answer.status,503,answer.path);assert.equal(answer.body,JSON.stringify({status:'unavailable',reason:'not-found'}));}
  assert.deepEqual(revokedKeys(w),[]);
  assert.deepEqual(await offline(w,old),[200,200,200,200]);
  assert.deepEqual(await offline(worker(old,w.stores,options),old),[200,200,200,200]);
  const fresh=await save(w,next);assert.equal(fresh.ok,true,fresh.error);
 }));
}
