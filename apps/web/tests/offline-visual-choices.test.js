import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {fixture,worker,packId} from './helpers/offline-execution.js';
// QA at e52eccf (receipt 52ad632b): Downloads offered only Text only and Text and audio, while the served execution's bound
// manifest lists the two published originals. The menu's choices come from the worker's DOWNLOAD_STATUS (status()); they must
// come from the same verified execution mediaManifest that the Save reads, and only list what it actually holds.
const digest=b=>createHash('sha256').update(b).digest('hex'),h=c=>c.repeat(64);
const photo=Buffer.from([0xff,0xd8,0xff,1,2,3]),photoSha=digest(photo),photoPath=`/v1/original-visuals/${h('1')}/${h('2')}/${photoSha}`;
function setup({images=true,ambiguous=false,mutate=m=>m,recordRevision=null,mediaIdentity=null}={}){
 const f=fixture(),files=[...f.manifest.files,...(images?[{path:photoPath,group:'image',assetId:'a1400',kind:'image',sha256:photoSha,bytes:photo.length,mime:'image/jpeg',width:3,height:2}]:[])];
 const manifest=mutate({schema:1,packId,presentationRevision:f.record.execution.mediaIdentity.revision,executionRevision:f.record.revision,mediaIdentity:f.record.execution.mediaIdentity,mediaAssetsSha256:f.record.execution.mediaAssetsSha256,files,id:`bound-offline:${h('9')}`,revision:h('9')}),bytes=Buffer.from(JSON.stringify(manifest));
 const descriptor={id:manifest.id,sha256:digest(bytes),bytes:bytes.length,mime:'application/json'};
 const record={...f.record,...(recordRevision?{revision:recordRevision,artifact:{...f.record.artifact,sha256:recordRevision}}:{}),execution:{...f.record.execution,...(mediaIdentity?{mediaIdentity}:{}),publication:{schema:'fia-executable-publication-pin@1',generation:h('6'),baseManifest:{id:`base-offline:${h('7')}`,sha256:h('7'),bytes:1,mime:'application/json'}},mediaManifest:descriptor}};
 const w=worker({...f,record});
 // After a visual publishes, the execution has two retained generations: a revision-only read is ambiguous (OFFLINE exact selection).
 if(ambiguous)w.reply(`/v1/packs/${packId}`,()=>{const q=new URLSearchParams(w.calls.at(-1).split('?')[1]||'');if(q.has('generation'))return q.get('generation')===record.execution.publication.generation?Response.json(record):Response.json({status:'unavailable',reason:'publication-generation-unavailable'},{status:404});return q.has('revision')?Response.json({status:'unavailable',reason:'publication-generation-ambiguous'},{status:404}):Response.json(record);});w.reply(`/v1/artifacts/${descriptor.sha256}`,()=>new Response(bytes,{headers:{'Content-Type':'application/json'}}));
 w.reply(photoPath,()=>new Response(photo,{headers:{'Content-Type':'image/jpeg'}}));
 const generation=record.execution.publication.generation,shown=g=>g===undefined?{generation}:g===null?{}:{generation:g};
 return {f,record,w,descriptor,bytes,generation,status:(g)=>w.message({type:'DOWNLOAD_STATUS',revision:f.record.revision,...shown(g)}),save:(selection='all',g)=>w.message({type:'DOWNLOAD_START',selection,revision:f.record.revision,...shown(g),mediaIdentity:f.record.execution.mediaIdentity,mediaAssetsSha256:f.record.execution.mediaAssetsSha256})};
}
const ids=s=>Array.from(s.choices,c=>c.id);

test('Downloads offers the images and maps the served execution has published, through the existing selection names',async()=>{
 const t=setup(),s=await t.status();assert.equal(s.available,true);
 assert.deepEqual(ids(s),['core','audio','all'],'no video: the existing contract offers "all" for the published originals (book-download maps visual to all)');
 assert.equal(s.choices.find(c=>c.id==='all').bytes-s.choices.find(c=>c.id==='audio').bytes,photo.length,'the extra bytes are exactly the published original');
 assert.equal(s.updateAvailable,false,'nothing is saved yet, and no false update');
 assert.ok(t.w.calls.includes(`/v1/packs/${packId}?revision=${t.record.revision}&generation=${t.generation}&execution=2`),'it reads the exact revision and displayed generation with the capability');
 assert.equal(t.w.calls.includes(photoPath),false,'availability never fetches an original');
});

test('nothing beyond the build manifest is offered when the execution publishes no visual, or when the record cannot be read',async()=>{
 const none=setup({images:false});assert.deepEqual(ids(await none.status()),['core','audio']);
 const offline=setup();offline.w.fail(`/v1/packs/${packId}`);assert.deepEqual(ids(await offline.status()),['core','audio'],'an unreachable record offers only what the build manifest holds');
 const plain=setup();assert.deepEqual(ids(await plain.w.message({type:'DOWNLOAD_STATUS'})),['core','audio'],'a caller that names no revision keeps today\'s answer');
});

test('the page asks for the choices of its exact revision',async()=>{
 const sent=[];Object.defineProperty(globalThis.navigator,'serviceWorker',{configurable:true,value:{ready:Promise.resolve({active:{postMessage:(data,[port])=>{sent.push(data);port.postMessage({ok:true,available:true,saved:true,choices:[]});}}})}});
 try{
  const {libraryAdapter}=await import('../src/lib/library.js');
  await libraryAdapter.downloadStatus({id:packId,revision:h('e')});await libraryAdapter.downloadStatus({id:packId,revision:h('e'),displayedGeneration:h('6')});
  await libraryAdapter.download('all',()=>{},{id:packId,revision:h('e'),displayedGeneration:h('6')});
  assert.deepEqual(sent.map(d=>[d.type,d.packId,d.revision,d.generation]),[['DOWNLOAD_STATUS',packId,h('e'),undefined],['DOWNLOAD_STATUS',packId,h('e'),h('6')],['DOWNLOAD_START',packId,h('e'),h('6')]]);
 }finally{delete globalThis.navigator.serviceWorker;}
});

// QA at 00bd9a6 (receipt 193054d; reproduced live, VERSION ae68e9ebea74): once a1400 and c4 publish, the execution has two retained
// generations and the revision-only read is refused as publication-generation-ambiguous; status() fell back without saying so.
// The page now names the generation it displays, and the worker reads exactly that one (OFFLINE exact selection).
test('after a visual publishes, Downloads reads exactly the displayed generation and offers its published originals',async()=>{
 const t=setup({ambiguous:true}),s=await t.status();
 assert.deepEqual(ids(s),['core','audio','all']);assert.equal(s.servedManifest.state,'used');
 assert.ok(t.w.calls.includes(`/v1/packs/${packId}?revision=${t.f.record.revision}&generation=${t.generation}&execution=2`));
 assert.equal(t.w.calls.some(c=>c===`/v1/packs/${packId}?execution=2`),false,'no current-pointer read');
});
test('without the displayed generation, or with another one, the worker fails closed and says why',async()=>{
 const none=setup({ambiguous:true}),s=await none.status(null);assert.deepEqual(ids(s),['core','audio']);assert.equal(s.servedManifest.reason,'record-404:publication-generation-ambiguous');
 const other=setup({ambiguous:true}),o=await other.status(h('5'));assert.deepEqual(ids(o),['core','audio']);assert.equal(o.servedManifest.reason,'record-404:publication-generation-unavailable');
 const bad=setup({ambiguous:true}),b=await bad.status('not-a-generation');assert.deepEqual(ids(b),['core','audio']);assert.equal(b.servedManifest.reason,'generation-invalid');
});
test('after a visual publishes, the Save binds exactly the displayed generation and saves its published original',async()=>{
 const t=setup({ambiguous:true}),result=await t.save('all');assert.equal(result.ok,true,JSON.stringify(result));
 assert.ok(t.w.calls.includes(photoPath),'the published original is saved');
 const s=await t.status();assert.equal(s.saved,true);assert.equal(s.active.serverSnapshot.record.execution.publication.generation,t.generation,'the saved snapshot is the displayed generation');
 assert.equal(s.updateAvailable,false,'a saved pack at the build revision is no update (review M4)');
 const none=setup({ambiguous:true}),refused=await none.save('all',null);assert.equal(refused.ok,false,'without the displayed generation the Save refuses');assert.equal(none.w.calls.includes(photoPath),false);
});
test('the served manifest is used only when it verifies and belongs to this execution; each refusal says why',async()=>{
 const cases=[
  ['another execution revision in the manifest',{mutate:m=>({...m,executionRevision:h('e')})}],
  ['another pack in the manifest',{mutate:m=>({...m,packId:'eng.MRK-1-21-28'})}],
  ['a record of another revision',{recordRevision:h('d')},'record-revision-changed'],
  ['media of another presentation (review N1)',{mediaIdentity:{packId,revision:h('d')}},'media-identity-mismatch'],
 ];
 for(const [name,options,reason] of cases){const t=setup(options),s=await t.status();assert.deepEqual(ids(s),['core','audio'],name);assert.equal(s.servedManifest.state,'not-used',name);if(reason)assert.equal(s.servedManifest.reason,reason,name);}
 for(const [name,bad] of [['bytes that do not hash to the descriptor',b=>Buffer.from(b.toString().replace('"width":3','"width":4'))],['a manifest of other length',b=>Buffer.concat([b,Buffer.from(' ')])]]){
  const t=setup();t.w.reply(`/v1/artifacts/${t.descriptor.sha256}`,()=>new Response(bad(t.bytes),{headers:{'Content-Type':'application/json'}}));
  const s=await t.status();assert.deepEqual(ids(s),['core','audio'],name);assert.equal(s.servedManifest.state,'not-used',name);
 }
 const offline=setup();offline.w.fail(`/v1/packs/${packId}`);const s=await offline.status();assert.equal(s.servedManifest.state,'not-used');assert.ok(s.servedManifest.reason,'an unreachable record names its reason');
});
