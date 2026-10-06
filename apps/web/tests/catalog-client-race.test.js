import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,worker,packId} from './helpers/offline-execution.js';
const save=(w,f)=>w.message({type:'DOWNLOAD_START',packId:f.record.packId,selection:'audio',revision:f.record.revision,mediaIdentity:f.record.execution.mediaIdentity,mediaAssetsSha256:f.record.execution.mediaAssetsSha256});
async function client(w){return(await w.stores.get('fia-v3-download-metadata@1').get('/client-c').clone().json());}
for(const offline of [false,true])test(`${offline?'offline':'online'} catalog read of another passage does not alter selected native-media custody`,async()=>{
 const a=fixture(),b=fixture('B','eng.MRK-1-21-28'),w=worker(a);assert.equal((await save(w,a)).ok,true);w.setFixture(b);assert.equal((await save(w,b)).ok,true);await w.message({type:'PACK_SELECT',packId,revision:a.record.revision});const before=await client(w);
 w.reply(`/v1/artifacts/${a.dependency.sha256}`,new Response(a.boundBytes));w.offline(offline);const record=await w.fetch(`/v1/packs/${b.record.packId}`);assert.equal(record.status,200);assert.deepEqual(await client(w),before,'read must not relabel old cache/manifest before explicit PACK_SELECT');
 assert.equal(await(await w.fetch('/audio.wav')).text(),a.files['/audio.wav']);
 assert.equal(await(await w.fetch(`/v1/artifacts/${b.record.revision}`)).text(),b.bytes,'pending record artifact remains readable before activation');
 assert.equal(await(await w.fetch(`/v1/artifacts/${a.dependency.sha256}`)).text(),a.boundBytes,'prior selected dependency still resolves during pending selection');
 await w.message({type:'PACK_SELECT',packId:b.record.packId,revision:b.record.revision});assert.equal(await(await w.fetch('/audio.wav')).text(),b.files['/audio.wav']);
});
