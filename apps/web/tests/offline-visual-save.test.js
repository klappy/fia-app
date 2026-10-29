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
