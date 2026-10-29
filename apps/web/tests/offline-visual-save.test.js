import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {fixture,worker,packId} from './helpers/offline-execution.js';
// F11 (OFFLINE; PLAN §3 budget, §7 F11): an executable Save reads only execution.mediaManifest, the server's
// bound manifest for that generation. Its published originals are saved by path and sha; a visual that is
// not yet published is not in the manifest and is never saved; offline, a Saved original answers its path.
const digest=b=>createHash('sha256').update(b).digest('hex'),h=c=>c.repeat(64);
const photo=Buffer.from([0xff,0xd8,0xff,1,2,3]),photoSha=digest(photo),photoPath=`/v1/original-visuals/${h('1')}/${h('2')}/${photoSha}`;
function bound(f,{files=null,mutate=x=>x}={}){
 const content={schema:1,packId,presentationRevision:f.record.execution.mediaIdentity.revision,executionRevision:f.record.revision,mediaIdentity:f.record.execution.mediaIdentity,mediaAssetsSha256:f.record.execution.mediaAssetsSha256,files:files??[...f.manifest.files,{path:photoPath,group:'image',assetId:'a1400',kind:'image',sha256:photoSha,bytes:photo.length,mime:'image/jpeg',width:3,height:2}]};
 const manifest=mutate({...content,id:`bound-offline:${h('9')}`,revision:h('9')}),bytes=Buffer.from(JSON.stringify(manifest));
 return {manifest,bytes,descriptor:{id:manifest.id,sha256:digest(bytes),bytes:bytes.length,mime:'application/json'}};
}
function setup(options){
 const f=fixture(),b=bound(f,options),record={...f.record,execution:{...f.record.execution,publication:{schema:'fia-executable-publication-pin@1',generation:h('6'),baseManifest:{id:`base-offline:${h('7')}`,sha256:h('7'),bytes:1,mime:'application/json'}},mediaManifest:b.descriptor}};
 const w=worker({...f,record});w.reply(`/v1/artifacts/${b.descriptor.sha256}`,()=>new Response(b.bytes,{headers:{'Content-Type':'application/json'}}));
 w.reply(photoPath,()=>new Response(photo,{headers:{'Content-Type':'image/jpeg','Content-Length':String(photo.length)}}));
 const save=(selection='visual')=>w.message({type:'DOWNLOAD_START',selection,revision:record.revision,mediaIdentity:record.execution.mediaIdentity,mediaAssetsSha256:record.execution.mediaAssetsSha256});
 return {f,b,record,w,save};
}

test('Save reads the bound manifest and saves its published original; offline the Saved original answers its path',async()=>{
 const t=setup();const result=await t.save();assert.equal(result.ok,true,JSON.stringify(result));
 assert.ok(t.w.calls.includes(`/v1/artifacts/${t.b.descriptor.sha256}`),'the bound manifest is read');
 assert.ok(t.w.calls.includes(photoPath),'its original is fetched once');
 const status=await t.w.message({type:'DOWNLOAD_STATUS'});assert.ok(status.active.files.some(f=>f.path===photoPath&&f.sha256===photoSha),'the Saved files are the bound manifest\'s');
 assert.equal(status.updateAvailable,false,'the catalog revision is the build\'s; no false update');
 t.w.offline(true);const offline=await t.w.fetch(photoPath);assert.equal(offline.status,200);assert.deepEqual(Buffer.from(await offline.arrayBuffer()),photo);
 const reload=await t.w.fetch(`/v1/packs/${packId}?execution=2`);assert.equal(reload.status,200);assert.equal((await reload.json()).execution.mediaManifest.sha256,t.b.descriptor.sha256,'an offline reload reads the saved generation');
});

test('a visual not in the bound manifest is never saved; the core-only Save fetches no original',async()=>{
 const u=setup({files:fixture().manifest.files});assert.equal((await u.save()).ok,true);assert.equal(u.w.calls.includes(photoPath),false,'a pending visual is not in the manifest, so it is not fetched');
 const c=setup();assert.equal((await c.save('core')).ok,true);assert.equal(c.w.calls.includes(photoPath),false);
});

test('a bound manifest of another execution, another base or altered bytes is refused; nothing is saved',async()=>{
 for(const mutate of [m=>({...m,executionRevision:h('e')}),m=>({...m,presentationRevision:h('d')}),m=>({...m,packId:'eng.MRK-1-21-28'}),m=>({...m,mediaAssetsSha256:h('a')})]){
  const t=setup({mutate});const result=await t.save();assert.equal(result.ok,false,JSON.stringify(result));assert.equal(t.w.calls.includes(photoPath),false);
 }
 const t=setup();t.w.reply(`/v1/artifacts/${t.b.descriptor.sha256}`,()=>new Response(Buffer.from(t.b.bytes.toString().replace('"width":3','"width":4')),{headers:{'Content-Type':'application/json'}}));
 assert.equal((await t.save()).ok,false,'bytes that do not hash to the descriptor');assert.equal(t.w.calls.includes(photoPath),false);
 const s=setup();s.w.reply(photoPath,()=>new Response(Buffer.from([9,9,9,9,9,9]),{headers:{'Content-Type':'image/jpeg'}}));
 assert.equal((await s.save()).ok,false,'an original that does not hash to its entry is not saved');
});

// PR309 review B1 (OFFLINE L43/L45): a Saved original answers offline only from an active pack whose record is complete and
// not invalidated, whose revision is not revoked, and whose saved files list exactly that path and sha. An observed 404/410 for
// the original is its tombstone. Staging caches (never activated) never answer.
const META='fia-v3-download-metadata@1',activeKey=`/pack:${packId}:active`;
const served=r=>r.type!=='error'&&r.status===200;
test('B1: a revoked pack no longer answers for its Saved original offline',async()=>{
 const t=setup();assert.equal((await t.save()).ok,true);
 t.w.reply(`/v1/packs/${packId}`,()=>Response.json({status:'unavailable',reason:'not-found'},{status:404}));
 assert.equal((await t.w.fetch(`/v1/packs/${packId}?execution=2`)).status,404);
 const status=await t.w.message({type:'DOWNLOAD_STATUS'});assert.equal(status.saved,false);
 t.w.offline(true);assert.equal(served(await t.w.fetch(photoPath)),false,'a revoked pack does not answer');
});
test('B1: an observed 404 or 410 for the original is a tombstone, honored offline and on a transient answer',async()=>{
 for(const code of [404,410]){
  const t=setup();assert.equal((await t.save()).ok,true);
  t.w.reply(photoPath,()=>new Response('gone',{status:code}));assert.equal((await t.w.fetch(photoPath)).status,code);
  t.w.reply(photoPath,()=>new Response('busy',{status:503}));assert.equal((await t.w.fetch(photoPath)).status,503,`${code}: no Saved copy on a transient answer`);
  t.w.offline(true);assert.equal(served(await t.w.fetch(photoPath)),false,`${code}: no Saved copy offline`);
  t.w.offline(false);t.w.reply(photoPath,()=>new Response(photo,{headers:{'Content-Type':'image/jpeg'}}));assert.equal((await t.w.fetch(photoPath)).status,200);
  t.w.offline(true);assert.equal(served(await t.w.fetch(photoPath)),true,`${code}: served again once the server serves it`);
 }
});
test('B1: a staging cache, or an active pack whose saved files do not list the path and sha, never answers',async()=>{
 const t=setup();assert.equal((await t.save()).ok,true);
 const meta=t.w.stores.get(META),active=await meta.get(activeKey).json();
 // The same bytes held only by a never-activated staging cache.
 t.w.stores.set(active.cache+'-repair',t.w.stores.get(active.cache));t.w.stores.delete(active.cache);meta.delete(activeKey);
 t.w.offline(true);assert.equal(served(await t.w.fetch(photoPath)),false,'a staging cache does not answer');
 const u=setup();assert.equal((await u.save()).ok,true);const umeta=u.w.stores.get(META),uactive=await umeta.get(activeKey).json();
 umeta.set(activeKey,Response.json({...uactive,files:uactive.files.filter(f=>f.path!==photoPath)}));
 u.w.offline(true);assert.equal(served(await u.w.fetch(photoPath)),false,'the saved files must list the path and sha');
 const v=setup();assert.equal((await v.save()).ok,true);const vmeta=v.w.stores.get(META),vactive=await vmeta.get(activeKey).json();
 vmeta.set(activeKey,Response.json({...vactive,files:vactive.files.map(f=>f.path===photoPath?{...f,sha256:h('0')}:f)}));
 v.w.offline(true);assert.equal(served(await v.w.fetch(photoPath)),false,'another sha in the saved files does not answer');
});
// The tombstone is the route's (sourceIdentity/consumer/original), as on #312 c0eee0e: a 404 on one consumer route neither hides the
// same original on another route nor is cleared by a 200 there.
test('B1: a tombstone on one consumer route neither hides nor is cleared by the same original on another route',async()=>{
 const t=setup(),other=`/v1/original-visuals/${h('1')}/${h('3')}/${photoSha}`;
 t.w.reply(other,()=>new Response(photo,{headers:{'Content-Type':'image/jpeg'}}));
 assert.equal((await t.w.fetch(other)).status,200,'the other route is kept');
 t.w.reply(photoPath,()=>new Response('gone',{status:404}));assert.equal((await t.w.fetch(photoPath)).status,404);
 t.w.offline(true);assert.equal(served(await t.w.fetch(other)),true,'the other route still answers offline');assert.equal(served(await t.w.fetch(photoPath)),false);
 t.w.offline(false);assert.equal((await t.w.fetch(other)).status,200);
 t.w.offline(true);assert.equal(served(await t.w.fetch(photoPath)),false,'a 200 on the other route does not clear this route\'s tombstone');
});
