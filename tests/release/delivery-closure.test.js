import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {verifyManifestFile} from './delivery-closure.js';
const raw=Buffer.from('original recorded bytes'),sha=createHash('sha256').update(raw).digest('hex'),revision='c'.repeat(64);
const entry={path:'/audio/source/a.mp3',source:{url:'https://fiaguide.app/audio/source/a.mp3',sha256:sha,bytes:raw.length},delivery:{url:'https://transcode.klappy.dev/audio/preset=voice,q=medium,f=opus/https://fiaguide.app/audio/source/a.mp3',sha256:'d'.repeat(64),bytes:12,mime:'audio/ogg',kind:'audio'},timing:{status:'not-applicable'}};
const file={path:entry.path,sourceSha256:sha,deliveryURL:entry.delivery.url,deliveryRevision:revision,sha256:entry.delivery.sha256,bytes:12,mime:'audio/ogg',group:'audio',timing:entry.timing};
test('release closure preserves distinct source and reviewed output identities',()=>{verifyManifestFile(file,raw,{entries:[entry]},revision);verifyManifestFile({path:entry.path,bytes:raw.length,sha256:sha},raw,null);});
test('release closure rejects corrupted source and every mismatched output binding',()=>{
 assert.throws(()=>verifyManifestFile(file,Buffer.from('corrupt'),{entries:[entry]},revision));
 for(const [key,value] of Object.entries({sourceSha256:'0'.repeat(64),deliveryRevision:'0'.repeat(64),deliveryURL:'https://other.invalid/audio',sha256:sha,bytes:raw.length,mime:'audio/mpeg',group:'image',timing:{status:'verified'}}))assert.throws(()=>verifyManifestFile({...file,[key]:value},raw,{entries:[entry]},revision),key);
 assert.throws(()=>verifyManifestFile(file,raw,null,revision));assert.throws(()=>verifyManifestFile(file,raw,{entries:[]},revision));
 const wrong=structuredClone(entry);wrong.source.url='https://fiaguide.app/audio/other.mp3';assert.throws(()=>verifyManifestFile(file,raw,{entries:[wrong]},revision));
});
