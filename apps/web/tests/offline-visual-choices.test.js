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

// QA at c0a837f (receipt 2ac55f9f) and the live trace: about 6 s after Save, a MEDIA_STATUS with the passage's media identity read
// /v1/packs/<id>?revision= (no generation), got 404 publication-generation-ambiguous, and retired the fresh Save as if revoked;
// the refused body was never released. The ambiguous refusal asks for a generation; it revokes nothing.
const mediaStatus=(t,extra={})=>t.w.message({type:'MEDIA_STATUS',packId,revision:t.f.record.revision,mediaIdentity:t.f.record.execution.mediaIdentity,mediaAssetsSha256:t.f.record.execution.mediaAssetsSha256,...extra});
test('after Save, a media status without the displayed generation reads the saved generation and keeps the Save',async()=>{
 const t=setup({ambiguous:true});assert.equal((await t.save('all')).ok,true);
 const m=await mediaStatus(t);assert.equal(m.ok,true,JSON.stringify(m));
 assert.ok(t.w.calls.includes(`/v1/packs/${packId}?revision=${t.f.record.revision}&generation=${t.generation}`),'the saved generation is named');
 const s=await t.status();assert.equal(s.saved,true,'the Save stays valid');assert.notEqual(s.active.serverSnapshot.invalid,true);
 const named=setup({ambiguous:true});assert.equal((await named.save('all')).ok,true);await mediaStatus(named,{generation:named.generation});
 assert.ok(named.w.calls.includes(`/v1/packs/${packId}?revision=${named.f.record.revision}&generation=${named.generation}`),'the displayed generation is named');
});
test('an ambiguous refusal with no generation known is typed and revokes nothing; a real refusal still retires the Save',async()=>{
 const t=setup({ambiguous:true});const m=await mediaStatus(t);assert.equal(m.ok,false);assert.equal((await t.status()).active,null,'nothing was saved, nothing is retired');
 const r=setup({ambiguous:true});assert.equal((await r.save('all')).ok,true);
 r.w.reply(`/v1/packs/${packId}`,()=>Response.json({status:'unavailable',reason:'publication-generation-invalid'},{status:404}));
 const after=await mediaStatus(r);assert.equal(after.ok,false);const s=await r.status(null);assert.equal(s.saved,false,'a real refusal still retires the Save');
});
test('a refused pack read releases its body',async()=>{
 const t=setup({ambiguous:true});assert.equal((await t.save('all')).ok,true);const refused=[];
 t.w.reply(`/v1/packs/${packId}`,()=>{const r=Response.json({status:'unavailable',reason:'publication-generation-ambiguous'},{status:404});refused.push(r);return r;});
 await mediaStatus(t);await t.status(null);assert.ok(refused.length>0);assert.ok(refused.every(r=>r.bodyUsed),'every refused body is read or cancelled');
});

test('the page names its displayed generation in every media message about that revision',async()=>{
 const sent=[];Object.defineProperty(globalThis.navigator,'serviceWorker',{configurable:true,value:{ready:Promise.resolve({active:{postMessage:(data,[port])=>{sent.push(data);port.postMessage({ok:true,files:[],savedFiles:[],deliveryRevision:null,saved:true,choices:[]});}}})}});
 try{
  const {libraryAdapter,setDisplayedGeneration}=await import('../src/lib/library.js'),pack={id:packId,revision:h('e'),mediaIdentity:{packId,revision:h('c')},mediaAssetsSha256:h('m')};
  await libraryAdapter.mediaStatus(pack);setDisplayedGeneration(pack,h('6'));await libraryAdapter.mediaStatus(pack);await libraryAdapter.downloadStatus(pack);setDisplayedGeneration(pack,null);await libraryAdapter.mediaStatus(pack);
  assert.deepEqual(sent.map(d=>[d.type,d.generation]),[['MEDIA_STATUS',undefined],['MEDIA_STATUS',h('6')],['DOWNLOAD_STATUS',h('6')],['MEDIA_STATUS',undefined]]);
 }finally{delete globalThis.navigator.serviceWorker;}
});

// PR311 review B1: a routed page read by revision alone (the page's own /v1/packs/<id>?revision=&execution=2) is refused as
// publication-generation-ambiguous once a visual has published. That answer reaches the page unchanged, is never taken as the
// record, and retires nothing; a typed denial on the same read still retires the Save. Classified by typed reason, not status.
const META='fia-v3-download-metadata@1',activeKey=`/pack:${packId}:active`;
const savedRecord=async t=>t.w.stores.get(META).get(activeKey).json();
test('B1: an ambiguous page read passes through and keeps the Save; a typed denial on the same read retires it',async()=>{
 const t=setup({ambiguous:true});assert.equal((await t.save('all')).ok,true);
 const r=await t.w.fetch(`/v1/packs/${packId}?revision=${t.f.record.revision}&execution=2`);
 assert.equal(r.status,404);assert.equal((await r.json()).reason,'publication-generation-ambiguous','the refusal reaches the page, not a record');
 assert.notEqual((await savedRecord(t)).serverSnapshot.invalid,true,'the ambiguous refusal retires nothing');
 const s=await t.status();assert.equal(s.saved,true);assert.equal(s.savedAuthority.state,'verified');
 const d=setup({ambiguous:true});assert.equal((await d.save('all')).ok,true);
 d.w.reply(`/v1/packs/${packId}`,()=>Response.json({status:'unavailable',reason:'publication-generation-invalid'},{status:404}));
 assert.equal((await d.w.fetch(`/v1/packs/${packId}?revision=${d.f.record.revision}&execution=2`)).status,404);
 assert.equal((await savedRecord(d)).serverSnapshot.invalid,true,'a typed denial still retires the Save');
});

// PR311 review B2: a server that ignores generation= answers 200 with another generation. That is not the displayed record:
// the choices say so, the Save refuses before any original is fetched, and an invalid generation is refused before any read.
test('B2: a 200 of another generation is not the displayed record; the Save refuses and fetches no original',async()=>{
 const t=setup(),other={...t.record,execution:{...t.record.execution,publication:{...t.record.execution.publication,generation:h('5')}}};
 t.w.reply(`/v1/packs/${packId}`,()=>Response.json(other));
 const s=await t.status();assert.equal(s.servedManifest.reason,'record-generation-changed');assert.deepEqual(ids(s),['core','audio']);
 const refused=await t.save('all');assert.equal(refused.ok,false,JSON.stringify(refused));assert.equal(t.w.calls.includes(photoPath),false);
 assert.equal((await t.status()).saved,false);
 const bad=setup(),b=await bad.save('all','not-a-generation');assert.equal(b.ok,false);assert.equal(bad.w.calls.some(c=>c.includes('generation=not-a-generation')),false,'an invalid generation is never sent');assert.equal(bad.w.calls.includes(photoPath),false);
});

// Terry b34dadc (OFFLINE L37/43/45/57/60/61): each Saved copy is rechecked with its own exact pinned read, never a fallback; the
// displayed generation counts only for the displayed copy, and that copy's typed answer decides it.
test('the Saved copy is rechecked by its own generation, not the displayed one, and that answer decides it',async()=>{
 const t=setup({ambiguous:true});assert.equal((await t.save('all')).ok,true);t.w.calls.length=0;
 const s=await t.status(h('5'));assert.equal(s.saved,true);assert.equal(s.savedAuthority.state,'verified');
 assert.ok(t.w.calls.includes(`/v1/packs/${packId}?revision=${t.f.record.revision}&generation=${t.generation}&execution=2`),'its own exact read');
 assert.equal(s.servedManifest.reason,'record-404:publication-generation-unavailable','the displayed generation answers only for the displayed copy');
 t.w.calls.length=0;assert.equal((await mediaStatus(t,{generation:h('5')})).ok,true);
 assert.ok(t.w.calls.includes(`/v1/packs/${packId}?revision=${t.f.record.revision}&generation=${t.generation}`),'media authority reads the Saved copy by its own generation');
 // Its own exact read denied (Terry 0be2e40 case b, a retained row that fails verification): the copy is retired even though
 // the displayed generation still answers. Its own generation row absent (case a) is a selection refusal: the copy is kept.
 const own=(t,reason)=>t.w.reply(`/v1/packs/${packId}`,()=>{const q=new URLSearchParams(t.w.calls.at(-1).split('?')[1]||'');return q.get('generation')===t.generation?Response.json({status:'unavailable',reason},{status:404}):Response.json({...t.record,execution:{...t.record.execution,publication:{...t.record.execution.publication,generation:h('5')}}});});
 const d=setup({ambiguous:true});assert.equal((await d.save('all')).ok,true);own(d,'publication-generation-invalid');
 const ds=await d.status(h('5'));assert.equal(ds.savedAuthority.state,'revoked');assert.equal(ds.saved,false);
 const a=setup({ambiguous:true});assert.equal((await a.save('all')).ok,true);own(a,'publication-generation-unavailable');
 const as=await a.status(h('5'));assert.equal(as.savedAuthority.state,'unconfirmed');assert.equal(as.saved,true,'(a) an absent row keeps the last verified copy');
});
test('no legacy fallback: an ambiguous recheck keeps the last verified copy with visible status and never reads by revision alone',async()=>{
 const t=setup({ambiguous:true});assert.equal((await t.save('all')).ok,true);
 t.w.reply(`/v1/packs/${packId}`,()=>Response.json({status:'unavailable',reason:'publication-generation-ambiguous'},{status:404}));t.w.calls.length=0;
 const s=await t.status();assert.equal(s.saved,true,'the last verified copy is kept');assert.equal(s.savedAuthority.state,'unconfirmed');assert.match(s.savedAuthority.reason,/publication-generation-ambiguous/);
 assert.equal(t.w.calls.some(c=>/^\/v1\/packs\/[^?]+\?revision=[a-f0-9]{64}(&execution=2)?$/.test(c)),false,'no revision-only read');
 assert.notEqual((await savedRecord(t)).serverSnapshot.invalid,true);
 // A server that answers another generation for the copy's exact read has not answered for it either.
 const o=setup();assert.equal((await o.save('all')).ok,true);o.w.reply(`/v1/packs/${packId}`,()=>Response.json({...o.record,execution:{...o.record.execution,publication:{...o.record.execution.publication,generation:h('5')}}}));
 const os=await o.status();assert.equal(os.saved,true);assert.deepEqual([os.savedAuthority.state,os.savedAuthority.reason],['unconfirmed','record-generation-changed']);
});
test('an offline cold reopen stays usable with visible status and serves the Saved record',async()=>{
 const t=setup({ambiguous:true});assert.equal((await t.save('all')).ok,true);
 const cold=worker({...t.f,record:t.record},t.w.stores);cold.offline(true);
 const s=await cold.message({type:'DOWNLOAD_STATUS',revision:t.f.record.revision});assert.equal(s.saved,true);assert.equal(s.savedAuthority.state,'unconfirmed');
 const r=await cold.fetch(`/v1/packs/${packId}?revision=${t.f.record.revision}&execution=2`);assert.equal(r.status,200);assert.equal(r.headers.get('X-FIA-Offline-Snapshot'),'historical-verified');
 assert.equal((await r.json()).execution.publication.generation,t.generation);
});
test('a real denial revokes every generation sharing the revoked revision, and the tombstone is honored before serving',async()=>{
 const t=setup({ambiguous:true});assert.equal((await t.save('all')).ok,true);
 t.w.reply(`/v1/packs/${packId}`,()=>Response.json({status:'unavailable',reason:'publication-generation-invalid'},{status:404}));
 const s=await t.status();assert.equal(s.savedAuthority.state,'revoked');assert.equal(s.saved,false);
 // A copy of another generation of the same revision (same dependency) is not served once the revision's tombstone is observed.
 const active=await savedRecord(t);active.serverSnapshot.invalid=false;active.serverSnapshot.record.execution.publication.generation=h('5');t.w.stores.get(META).set(activeKey,Response.json(active));
 t.w.offline(true);const r=await t.w.fetch(`/v1/packs/${packId}?revision=${t.f.record.revision}&execution=2`);assert.notEqual(r.status,200,'the tombstone is honored before any saved JSON');
});
test('an observed 404 for a published original is honored before serving any kept or Saved copy of it',async()=>{
 const t=setup({ambiguous:true});assert.equal((await t.save('all')).ok,true);
 assert.equal((await t.w.fetch(photoPath)).status,200);
 t.w.reply(photoPath,()=>new Response('gone',{status:404}));assert.equal((await t.w.fetch(photoPath)).status,404);
 t.w.offline(true);const r=await t.w.fetch(photoPath);assert.equal(r.type==='error'||r.status!==200,true,'no Saved copy answers for a tombstoned original');
 t.w.offline(false);t.w.reply(photoPath,()=>new Response('err',{status:503}));assert.equal((await t.w.fetch(photoPath)).status,503,'nor on a transient answer');
});

// Terry 0be2e40: each typed reason the law decides is classified apart; the server passes the catalog's own reason through (case c).
test('typed reasons on the Saved copy\'s own read: (a) absent and execution-not-current keep it; (b) invalid retires it',async()=>{
 for(const [reason,state,saved] of [['publication-generation-unavailable','unconfirmed',true],['execution-not-current','unconfirmed',true],['publication-generation-invalid','revoked',false]]){
  const t=setup({ambiguous:true});assert.equal((await t.save('all')).ok,true);
  t.w.reply(`/v1/packs/${packId}`,()=>Response.json({status:'unavailable',reason},{status:404}));
  const s=await t.status();assert.equal(s.savedAuthority.state,state,reason);assert.equal(s.saved,saved,reason);
  const m=await mediaStatus(t);assert.equal(m.ok,saved,reason);assert.equal((await t.status()).saved,saved,`${reason}: media authority agrees`);
  t.w.reply(`/v1/packs/${packId}`,()=>Response.json({status:'unavailable',reason},{status:404}));
  assert.equal((await t.w.fetch(`/v1/packs/${packId}?revision=${t.f.record.revision}&execution=2`)).status,404);assert.equal((await savedRecord(t)).serverSnapshot.invalid===true,!saved,`${reason}: page read`);
 }
});
// PR312 review C1: a refused Save must not retire the existing Saved copy unless the refusal is a denial.
test('C1: a Save refused as ambiguous, or answered with another generation, keeps the existing Saved copy; a denial retires it',async()=>{
 const t=setup({ambiguous:true});assert.equal((await t.save('all')).ok,true);
 const refused=await t.save('all',null);assert.equal(refused.ok,false,'a Save with no generation is refused');
 let s=await t.status();assert.equal(s.saved,true,'the Saved copy is kept');assert.notEqual((await savedRecord(t)).serverSnapshot.invalid,true);
 const o=setup({ambiguous:true});assert.equal((await o.save('all')).ok,true);
 o.w.reply(`/v1/packs/${packId}`,()=>{const q=new URLSearchParams(o.w.calls.at(-1).split('?')[1]||'');return q.get('generation')===h('5')?Response.json(o.record):Response.json(o.record);});
 assert.equal((await o.save('all',h('5'))).ok,false,'a 200 of another generation is not the requested record');
 assert.notEqual((await savedRecord(o)).serverSnapshot.invalid,true,'and retires nothing');
 const d=setup({ambiguous:true});assert.equal((await d.save('all')).ok,true);
 d.w.reply(`/v1/packs/${packId}`,()=>Response.json({status:'unavailable',reason:'publication-generation-invalid'},{status:404}));
 assert.equal((await d.save('all')).ok,false);assert.equal((await savedRecord(d)).serverSnapshot.invalid,true,'a denial still retires it');
});
// PR312 review item 2: a denial about the displayed generation is not about a Saved copy that has no generation.
test('a Saved copy without a generation is not retired by a denial of the displayed generation',async()=>{
 const t=setup({ambiguous:true});assert.equal((await t.save('all')).ok,true);
 const meta=t.w.stores.get(META),active=await savedRecord(t);delete active.serverSnapshot.record.execution.publication;meta.set(activeKey,Response.json(active));
 t.w.reply(`/v1/packs/${packId}`,()=>{const q=new URLSearchParams(t.w.calls.at(-1).split('?')[1]||'');return q.has('generation')?Response.json({status:'unavailable',reason:'publication-generation-invalid'},{status:404}):Response.json(t.record);});
 await mediaStatus(t,{generation:h('5')});
 assert.notEqual((await savedRecord(t)).serverSnapshot.invalid,true,'the denial named another copy');
});
// Terry 4851c72 (case c reasons): publication-generation-mismatch, not-found and revision-not-found are not authority evidence
// either way (OFFLINE L37, L43, L45, L57, L61). Each keeps the last verified copy, on the recheck, media authority, a page read and
// a refused Save; an untyped refusal keeps the interim behavior (it retires the copy) and stays an open item.
for(const reason of ['publication-generation-mismatch','not-found','revision-not-found'])test(`${reason} keeps the Saved copy on every path, including a refused Save`,async()=>{
 const t=setup({ambiguous:true});assert.equal((await t.save('all')).ok,true);
 t.w.reply(`/v1/packs/${packId}`,()=>Response.json({status:'unavailable',reason},{status:404}));
 const s=await t.status();assert.equal(s.saved,true);assert.equal(s.savedAuthority.state,'unconfirmed');assert.equal(s.savedAuthority.reason,'record-404:'+reason);
 assert.equal((await mediaStatus(t)).ok,true,'media authority falls back to the last verified copy');
 assert.equal((await t.w.fetch(`/v1/packs/${packId}?revision=${t.f.record.revision}&execution=2`)).status,404,'the page gets the refusal');
 assert.equal((await t.save('all')).ok,false,'the Save is refused');
 assert.notEqual((await savedRecord(t)).serverSnapshot.invalid,true);assert.equal((await t.status()).saved,true);
});
test('a mismatching record is never adopted nor taken as confirming the Saved copy',async()=>{
 const t=setup({ambiguous:true});assert.equal((await t.save('all')).ok,true);
 const other={...t.record,execution:{...t.record.execution,publication:{...t.record.execution.publication,generation:h('5')}}};
 t.w.reply(`/v1/packs/${packId}`,()=>Response.json(other));
 const s=await t.status();assert.equal(s.savedAuthority.state,'unconfirmed','not confirmed by another record');assert.equal(s.servedManifest.state,'not-used','its manifest is not offered');
 assert.equal((await t.save('all')).ok,false);
 assert.equal((await savedRecord(t)).serverSnapshot.record.execution.publication.generation,t.generation,'the Saved record is unchanged');
});
test('an untyped refusal of the Saved copy\'s own read keeps the interim behavior: it retires the copy (open item)',async()=>{
 const t=setup({ambiguous:true});assert.equal((await t.save('all')).ok,true);
 t.w.reply(`/v1/packs/${packId}`,()=>new Response('nope',{status:404}));
 const s=await t.status();assert.equal(s.savedAuthority.state,'revoked');assert.equal(s.saved,false);
});
// PR312 review thread 4412859917: the visual tombstone is the route's (sourceIdentity/consumer/original), not the bytes'. The same
// original on another consumer route keeps its copy when one route is withdrawn, and a 200 on another route does not clear it.
test('a tombstone on one consumer route neither hides nor is cleared by the same original on another route',async()=>{
 const t=setup({ambiguous:true}),other=`/v1/original-visuals/${h('1')}/${h('3')}/${photoSha}`;
 t.w.reply(other,()=>new Response(photo,{headers:{'Content-Type':'image/jpeg'}}));
 assert.equal((await t.w.fetch(other)).status,200,'the other route is kept');
 t.w.reply(photoPath,()=>new Response('gone',{status:404}));assert.equal((await t.w.fetch(photoPath)).status,404,'this route is withdrawn');
 t.w.offline(true);assert.equal((await t.w.fetch(other)).status,200,'the other route still answers offline');assert.notEqual((await t.w.fetch(photoPath)).status,200);
 t.w.offline(false);assert.equal((await t.w.fetch(other)).status,200,'a 200 on the other route');
 t.w.offline(true);const r=await t.w.fetch(photoPath);assert.equal(r.type==='error'||r.status!==200,true,'does not clear this route\'s tombstone');
});
// PR312 review thread 4412859925: a denial is about the copy that was checked. If a Save elsewhere activated another copy while the
// read was out, that copy is not retired.
test('a recheck denial retires only the checked copy, not one activated while the read was out',async()=>{
 const t=setup({ambiguous:true});assert.equal((await t.save('all')).ok,true);
 const meta=t.w.stores.get(META),before=await savedRecord(t),newer=structuredClone(before);newer.serverSnapshot.record.execution.publication.generation=h('5');
 let swapped=false;t.w.reply(`/v1/packs/${packId}`,()=>{if(!swapped){swapped=true;meta.set(activeKey,Response.json(newer));}return Response.json({status:'unavailable',reason:'publication-generation-invalid'},{status:404});});
 const s=await t.status();assert.equal(s.savedAuthority.state,'revoked','the checked copy was denied');
 const now=await savedRecord(t);assert.equal(now.serverSnapshot.record.execution.publication.generation,h('5'));assert.notEqual(now.serverSnapshot.invalid,true,'the newer copy is not retired');
});
// PR312 review thread 4412859935, client side: an unavailable visual authority makes the server's exact read transient (it throws,
// the Worker answers 500); the Saved copy is kept, unconfirmed. A real withdrawal (publication-generation-invalid) still retires it.
test('a transient exact read (unavailable visual authority) keeps the Saved copy; a withdrawal retires it',async()=>{
 const t=setup({ambiguous:true});assert.equal((await t.save('all')).ok,true);
 t.w.reply(`/v1/packs/${packId}`,()=>Response.json({status:'refused',code:'internal-error'},{status:500}));
 const s=await t.status();assert.equal(s.saved,true);assert.equal(s.savedAuthority.state,'unconfirmed');assert.notEqual((await savedRecord(t)).serverSnapshot.invalid,true);
 t.w.reply(`/v1/packs/${packId}`,()=>Response.json({status:'unavailable',reason:'publication-generation-invalid'},{status:404}));
 assert.equal((await t.status()).saved,false);
});
// Terry c4e3c0d (review 5698718376 D1): a de-listed first-proof pin is not a revocation. Its typed answer keeps the last verified copy
// on every path, unconfirmed, with no eligibility claim.
test('publication-visual-delisted keeps the Saved copy on every path, including a refused Save',async()=>{
 const t=setup({ambiguous:true});assert.equal((await t.save('all')).ok,true);
 t.w.reply(`/v1/packs/${packId}`,()=>Response.json({status:'unavailable',reason:'publication-visual-delisted'},{status:404}));
 const s=await t.status();assert.equal(s.saved,true);assert.equal(s.savedAuthority.state,'unconfirmed');assert.equal(s.savedAuthority.reason,'record-404:publication-visual-delisted');
 assert.equal((await mediaStatus(t)).ok,true);assert.equal((await t.w.fetch(`/v1/packs/${packId}?revision=${t.f.record.revision}&execution=2`)).status,404);
 assert.equal((await t.save('all')).ok,false);assert.notEqual((await savedRecord(t)).serverSnapshot.invalid,true);assert.equal((await t.status()).saved,true);
});
// Review thread 4413098490: a server that refuses execution=2 is read by revision alone; that read does not answer for the copy's
// generation, so neither another generation nor different artifacts confirm or retire it, and a Save naming a generation fails.
test('a compatibility read without the generation neither confirms nor retires a generation-pinned Saved copy',async()=>{
 for(const variant of ['another generation','different artifacts']){
  const t=setup({ambiguous:true});assert.equal((await t.save('all')).ok,true);
  const other=variant==='another generation'?{...t.record,execution:{...t.record.execution,publication:{...t.record.execution.publication,generation:h('5')}}}:{...t.record,execution:{...t.record.execution,artifacts:[...(t.record.execution.artifacts??[]),{id:'extra',sha256:h('4'),bytes:2,mime:'application/json'}]}};
  t.w.reply(`/v1/packs/${packId}`,()=>new URLSearchParams(t.w.calls.at(-1).split('?')[1]||'').has('execution')?Response.json({status:'refused',code:'invalid-request'},{status:400}):Response.json(other));
  const s=await t.status();assert.equal(s.savedAuthority.state,'unconfirmed',variant);assert.equal(s.savedAuthority.reason,'record-compat-no-generation',variant);assert.equal(s.saved,true,variant);
  assert.notEqual((await savedRecord(t)).serverSnapshot.invalid,true,variant);
  assert.equal((await t.save('all')).ok,false,`${variant}: a Save naming the generation fails`);assert.notEqual((await savedRecord(t)).serverSnapshot.invalid,true,`${variant}: and retires nothing`);
 }
});
// Review thread 4413098504: a revalidation (304) that returns after an overlapping read observed the route's 404 does not serve the
// withdrawn bytes.
test('a 304 that returns after an overlapping 404 does not serve the withdrawn original',async()=>{
 const t=setup({ambiguous:true});assert.equal((await t.w.fetch(photoPath)).status,200,'kept online');
 let release;const late=new Promise(r=>release=r);
 t.w.reply(photoPath,init=>init?.headers?.['If-None-Match']?late.then(()=>new Response(null,{status:304})):new Response('gone',{status:404}));
 const revalidating=t.w.fetch(photoPath);await new Promise(r=>setTimeout(r,5));
 t.w.reply(photoPath,()=>new Response('gone',{status:404}));assert.equal((await t.w.fetch(photoPath)).status,404,'the overlapping read observes the withdrawal');
 release();const r=await revalidating;assert.notEqual(r.status,200,'the late 304 does not serve the kept bytes');
});
