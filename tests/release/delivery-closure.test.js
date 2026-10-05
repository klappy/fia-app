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

test('v2 replacement binds bundled, published and derivative identities separately',()=>{
 const e={...structuredClone(entry),logicalSource:{sha256:sha,bytes:raw.length},source:{url:'https://publisher.test/hq.mp4',sha256:'e'.repeat(64),bytes:100},delivery:{...entry.delivery,kind:'video',mime:'video/mp4'}};
 const f={...file,sourceSha256:e.source.sha256,sourceBytes:100,logicalSourceSha256:sha,logicalSourceBytes:raw.length,group:'video',mime:'video/mp4'};
 verifyManifestFile(f,raw,{schema:2,entries:[e]},revision);
 for(const key of ['sourceSha256','logicalSourceSha256','sourceBytes','logicalSourceBytes','sha256'])assert.throws(()=>verifyManifestFile({...f,[key]:0},raw,{schema:2,entries:[e]},revision));
 assert.throws(()=>verifyManifestFile(f,Buffer.from('corrupt'),{schema:2,entries:[e]},revision));
 assert.throws(()=>verifyManifestFile(f,raw,{schema:1,entries:[e]},revision));
});
test('schema3 release closure binds each variant independently',()=>{
 const low={delivery:{...entry.delivery,sha256:'1'.repeat(64),bytes:7,url:entry.delivery.url.replace('q=medium','q=low')},timing:entry.timing};
 const e={...entry,defaultSize:'medium',variants:{medium:{delivery:entry.delivery,timing:entry.timing},small:low}};
 const f={...file,defaultSize:'medium',variants:{medium:file,small:{...file,sha256:low.delivery.sha256,bytes:7,deliveryURL:low.delivery.url}}};
 verifyManifestFile(f,raw,{schema:3,entries:[e]},revision);const bad=structuredClone(f);bad.variants.small.sha256=file.sha256;assert.throws(()=>verifyManifestFile(bad,raw,{schema:3,entries:[e]},revision));delete bad.variants.small;assert.throws(()=>verifyManifestFile(bad,raw,{schema:3,entries:[e]},revision));
});
