import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {fixture,worker,packId} from './helpers/offline-execution.js';
// QA at e52eccf (receipt 52ad632b): Downloads offered only Text only and Text and audio, while the served execution's bound
// manifest lists the two published originals. The menu's choices come from the worker's DOWNLOAD_STATUS (status()); they must
// come from the same verified execution mediaManifest that the Save reads, and only list what it actually holds.
const digest=b=>createHash('sha256').update(b).digest('hex'),h=c=>c.repeat(64);
const photo=Buffer.from([0xff,0xd8,0xff,1,2,3]),photoSha=digest(photo),photoPath=`/v1/original-visuals/${h('1')}/${h('2')}/${photoSha}`;
function setup({images=true}={}){
 const f=fixture(),files=[...f.manifest.files,...(images?[{path:photoPath,group:'image',assetId:'a1400',kind:'image',sha256:photoSha,bytes:photo.length,mime:'image/jpeg',width:3,height:2}]:[])];
 const manifest={schema:1,packId,presentationRevision:f.record.execution.mediaIdentity.revision,executionRevision:f.record.revision,mediaIdentity:f.record.execution.mediaIdentity,mediaAssetsSha256:f.record.execution.mediaAssetsSha256,files,id:`bound-offline:${h('9')}`,revision:h('9')},bytes=Buffer.from(JSON.stringify(manifest));
 const descriptor={id:manifest.id,sha256:digest(bytes),bytes:bytes.length,mime:'application/json'};
 const record={...f.record,execution:{...f.record.execution,publication:{schema:'fia-executable-publication-pin@1',generation:h('6'),baseManifest:{id:`base-offline:${h('7')}`,sha256:h('7'),bytes:1,mime:'application/json'}},mediaManifest:descriptor}};
 const w=worker({...f,record});w.reply(`/v1/artifacts/${descriptor.sha256}`,()=>new Response(bytes,{headers:{'Content-Type':'application/json'}}));
 w.reply(photoPath,()=>new Response(photo,{headers:{'Content-Type':'image/jpeg'}}));
 return {f,record,w,status:()=>w.message({type:'DOWNLOAD_STATUS',revision:record.revision})};
}
const ids=s=>Array.from(s.choices,c=>c.id);

test('Downloads offers the images and maps the served execution has published, through the existing selection names',async()=>{
 const t=setup(),s=await t.status();assert.equal(s.available,true);
 assert.deepEqual(ids(s),['core','audio','all'],'no video: the existing contract offers "all" for the published originals (book-download maps visual to all)');
 assert.equal(s.choices.find(c=>c.id==='all').bytes-s.choices.find(c=>c.id==='audio').bytes,photo.length,'the extra bytes are exactly the published original');
 assert.equal(s.updateAvailable,false,'nothing is saved yet, and no false update');
 assert.ok(t.w.calls.includes(`/v1/packs/${packId}?revision=${t.record.revision}&execution=2`),'it reads the exact revision with the capability');
 assert.equal(t.w.calls.includes(photoPath),false,'availability never fetches an original');
});

test('nothing beyond the build manifest is offered when the execution publishes no visual, or when the record cannot be read',async()=>{
 const none=setup({images:false});assert.deepEqual(ids(await none.status()),['core','audio']);
 const offline=setup();offline.w.fail(`/v1/packs/${packId}`);assert.deepEqual(ids(await offline.status()),['core','audio'],'an unreachable record offers only what the build manifest holds');
 const plain=setup();assert.deepEqual(ids(await plain.w.message({type:'DOWNLOAD_STATUS'})),['core','audio'],'a caller that names no revision keeps today\'s answer');
});

test('the page asks for the choices of its exact revision',async()=>{
 const sent=[];Object.defineProperty(globalThis.navigator,'serviceWorker',{configurable:true,value:{ready:Promise.resolve({active:{postMessage:(data,[port])=>{sent.push(data);port.postMessage({ok:true,available:true,choices:[]});}}})}});
 try{
  const {libraryAdapter}=await import('../src/lib/library.js');
  await libraryAdapter.downloadStatus({id:packId,revision:h('e')});
  assert.deepEqual(sent.map(d=>[d.type,d.packId,d.revision]),[['DOWNLOAD_STATUS',packId,h('e')]]);
 }finally{delete globalThis.navigator.serviceWorker;}
});
