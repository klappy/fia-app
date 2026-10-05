import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256} from '../../server/fia/preparation/contract.mjs';
import {readSource,storeSource,sourceKey} from '../../server/fia/preparation/source-store.mjs';
async function fixture(){const bytes=new TextEncoder().encode('retained original fixture');return {bytes,source:{url:'https://publisher.example/p2.mp3',sha256:await sha256(bytes),bytes:bytes.length,duration:2}};}
function bucket(){const data=new Map(),writes=[];return {data,writes,race:null,async get(key){const value=data.get(key);return value===undefined?null:{body:new Response(value.slice()).body};},async put(key,bytes,options){assert.deepEqual(options.onlyIf,{etagDoesNotMatch:'*'});writes.push(key);if(this.race){const race=this.race;this.race=null;race(key,data);}if(data.has(key))return null;data.set(key,bytes.slice());return {key};}};}
test('missing source is null; immutable source and provenance warm reuse need no upstream',async()=>{
 const {source,bytes}=await fixture(),r2=bucket();assert.equal(await readSource(r2,source),null);
 const receipt=await storeSource(r2,source,bytes,'v2');assert.equal(receipt.key,`originals/sha256/${source.sha256}.mp3`);assert.match(receipt.referenceKey,/^originals\/refs\/[a-f0-9]{64}\/[a-f0-9]{64}\.json$/);
 assert.deepEqual(await readSource(r2,source),bytes);assert.equal(r2.writes.length,2);await storeSource(r2,source,bytes,'v2');assert.equal(r2.writes.length,2);
 const reference=JSON.parse(new TextDecoder().decode(r2.data.get(receipt.referenceKey)));assert.equal(reference.url,source.url);assert.equal(reference.sourceVersion,'v2');assert.equal(reference.sha256,source.sha256);
});
test('create-if-absent race verifies winner and never overwrites',async()=>{
 const {source,bytes}=await fixture(),r2=bucket();r2.race=(key,data)=>data.set(key,bytes.slice());await storeSource(r2,source,bytes,'v2');assert.deepEqual(await readSource(r2,source),bytes);
 const corrupt=bucket();corrupt.race=(key,data)=>data.set(key,new Uint8Array(bytes.length));await assert.rejects(storeSource(corrupt,source,bytes,'v2'),/corrupt/);assert.equal(corrupt.writes.length,1);assert.deepEqual(corrupt.data.get(sourceKey(source)),new Uint8Array(bytes.length));
});
test('corrupt retained source or provenance refuses without overwrite',async()=>{
 const {source,bytes}=await fixture(),r2=bucket();r2.data.set(sourceKey(source),new Uint8Array(bytes.length));await assert.rejects(readSource(r2,source),/corrupt/);await assert.rejects(storeSource(r2,source,bytes,'v2'),/corrupt/);assert.equal(r2.writes.length,0);
 const good=bucket(),receipt=await storeSource(good,source,bytes,'v2');good.data.set(receipt.referenceKey,new TextEncoder().encode('{}'));const count=good.writes.length;await assert.rejects(storeSource(good,source,bytes,'v2'),/conflict/);assert.equal(good.writes.length,count);
});
test('source pin, input bytes and bounded R2 bodies fail closed',async()=>{
 const {source,bytes}=await fixture();for(const changed of [{...source,bytes:2097153},{...source,sha256:'bad'},{...source,url:'http://publisher.example'}])assert.throws(()=>sourceKey(changed));
 const r2=bucket();await assert.rejects(storeSource(r2,source,bytes.slice(1),'v2'),/corrupt/);assert.equal(r2.writes.length,0);
 r2.data.set(sourceKey(source),new Uint8Array(source.bytes+1));await assert.rejects(readSource(r2,source),/too-large/);assert.equal(r2.writes.length,0);
});
test('distinct URL/version references preserve immutable history',async()=>{
 const {source,bytes}=await fixture(),r2=bucket();const a=await storeSource(r2,source,bytes,'v2'),b=await storeSource(r2,source,bytes,'v3'),c=await storeSource(r2,{...source,url:'https://publisher.example/other.mp3'},bytes,'v2');assert.equal(new Set([a.referenceKey,b.referenceKey,c.referenceKey]).size,3);assert.equal(r2.data.size,4);assert(![...r2.data.keys()].some(k=>k.includes('latest')));
});
test('conflicting reference appearing during conditional write is never replaced',async()=>{
 const {source,bytes}=await fixture(),r2=bucket();r2.data.set(sourceKey(source),bytes.slice());r2.race=(key,data)=>data.set(key,new TextEncoder().encode('{}'));
 await assert.rejects(storeSource(r2,source,bytes,'v2'),/reference-conflict/);assert.equal(r2.writes.length,1);assert.equal(new TextDecoder().decode(r2.data.get(r2.writes[0])),'{}');
});
