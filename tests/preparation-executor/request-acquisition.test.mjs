import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequestAcquisition} from '../../server/fia/preparation/executor/request-acquisition.mjs';
import {canonicalJSONString,sha256} from '../../server/fia/preparation/contract.mjs';
import {KNOWN_SOURCE_POLICY} from '../../server/fia/preparation/executor/known-source-stream.mjs';
import {createKnownSourceAcquisition} from '../../server/fia/preparation/executor/known-source-stream.mjs';
const encode=v=>new TextEncoder().encode(canonicalJSONString(v));
test('metadata type and allocation bounds are checked before copying',async()=>{
 for(const metadataBytes of [2147483647,[1,2,3],null,new Uint8Array(2*1024*1024+1)])await assert.rejects(createRequestAcquisition({metadataBytes}),/guide-metadata-identity/);
});
function storage(){const rows=new Map();let pending=Promise.resolve();return {rows,get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v)),transaction(fn){const result=pending.then(()=>fn(this));pending=result.catch(()=>{});return result;}};}
function bucket(){const objects=new Map();return {objects,async get(k){const bytes=objects.get(k);return bytes?{size:bytes.length,body:new Blob([bytes]).stream()}:null;},async put(k,body,options){const bytes=body instanceof Uint8Array?body.slice():new Uint8Array(await new Response(body).arrayBuffer());if(options?.onlyIf?.etagDoesNotMatch==='*'&&objects.has(k))return null;objects.set(k,bytes);return {};}};}
test('non-Error source failures settle acquisition as uncertain',async()=>{
 for(const failure of [null,undefined,{get message(){throw Error('getter');}}]){
  const task=createKnownSourceAcquisition({storage:storage(),bucket:bucket(),policy:{policy:KNOWN_SOURCE_POLICY,url:'https://publisher.invalid/audio.mp3',sourceVersion:'v1',sha256:'a'.repeat(64),bytes:3},fetchSource:async()=>{throw failure;}});
  let rejected=false;try{await task.acquire();}catch{rejected=true;}assert.equal(rejected,true);assert.equal((await task.status()).state,'uncertain');
 }
});
async function fixture(){
 const bytes=await readFile(process.env.FIA_RETAINED_P2);assert.equal(bytes.length,867865);assert.equal(await sha256(bytes),'0f3fa9e77215f5050f9e22b7abee329c47e0e9ff71a5f0c4d248926a8f42268d');
 // Test metadata exercises routing only; it is not new timing or source-text acceptance.
 const row={packId:'eng.MRK-1-14-20',presentationRevision:'a'.repeat(64),language:'eng',book:'MRK',edition:'fia-guide',publisherSourceId:'test-p2',publisherPassage:'1:14-20',stepId:'S01',sourceURL:'https://s3.amazonaws.com/cbbt-er.public/pericopes/eng/mrk/p2/s1/v2/vbr0.mp3',guideContentSha256:'b'.repeat(64),sourceMetadataSha256:'c'.repeat(64),sourceUnits:[{sourceUnitId:'S01-U001',sourceTextSha256:'d'.repeat(64)},{sourceUnitId:'S01-U002',sourceTextSha256:'e'.repeat(64)}]};
 const metadataBytes=encode({schema:'fia-published-guide-sources@1',rows:[row]}),store=storage(),objects=bucket();let fetches=0;
 const options={metadataBytes,metadataSha256:await sha256(metadataBytes),storage:store,bucket:objects,knownSources:[{source:{publisherId:'fia-guide',resourceId:row.publisherSourceId,version:row.presentationRevision},policy:{policy:KNOWN_SOURCE_POLICY,url:row.sourceURL,sourceVersion:row.presentationRevision,sha256:await sha256(bytes),bytes:bytes.length}}],modelRecipe:{modelId:'disabled-test-model',modelRevision:'disabled',configSha256:'f'.repeat(64)},policyRevision:'integration-test-v1',makeStream:()=>new TransformStream(),fetchSource:async()=>{fetches++;return new Response(bytes,{headers:{'content-type':'audio/mpeg','content-length':String(bytes.length)}});}};
 const request={packId:row.packId,presentationRevision:row.presentationRevision,language:row.language,edition:row.edition,...row.sourceUnits[0]};
 return {options,request,store,objects,fetches:()=>fetches};
}
test('resolved section requests acquire real retained bytes once and stop before unavailable transcription',{skip:!process.env.FIA_RETAINED_P2},async()=>{
 const f=await fixture(),app=await createRequestAcquisition(f.options),first=await app.request(f.request);
 assert.equal(first.state,'blocked');assert.equal(first.node,'transcribe');assert.equal(first.reason,'capability-unavailable');assert.equal(f.fetches(),1);
 const second=await app.request({...f.request,sourceUnitId:'S01-U002',sourceTextSha256:'e'.repeat(64)});assert.equal(second.key,first.key);assert.equal(f.fetches(),1);
 const reopened=await createRequestAcquisition({...f.options,fetchSource:()=>{throw Error('publisher-offline');}});assert.equal((await reopened.request(f.request)).key,first.key);
 assert.ok(![...f.store.rows.values()].some(v=>['transcribe','align','accept','publish'].includes(v.identity?.node)));
});
test('wrong text is refused before acquisition and changed source pin cannot reuse prior completion',{skip:!process.env.FIA_RETAINED_P2},async()=>{
 const f=await fixture(),app=await createRequestAcquisition(f.options);await assert.rejects(app.request({...f.request,sourceTextSha256:'0'.repeat(64)}),/unresolved/);assert.equal(f.fetches(),0);
 const first=await app.request(f.request),knownSources=structuredClone(f.options.knownSources);knownSources[0].policy.sha256='0'.repeat(64);
 const changed=await createRequestAcquisition({...f.options,knownSources});
 const failed=await changed.request(f.request);assert.equal(failed.state,'uncertain');assert.equal(failed.node,'acquire');assert.notEqual(failed.key,first.key);
});
test('corrupted warm source prevents reuse and never reaches transcription',{skip:!process.env.FIA_RETAINED_P2},async()=>{
 const f=await fixture(),app=await createRequestAcquisition(f.options);await app.request(f.request);
 f.objects.objects.set(`originals/sha256/${f.options.knownSources[0].policy.sha256}.mp3`,new Uint8Array([1,2,3]));
 const result=await app.request(f.request);assert.equal(result.state,'unavailable');assert.equal(result.node,'acquire');assert.equal(f.fetches(),1);
});
test('unrelated metadata and admission changes preserve selected operation and node identities',{skip:!process.env.FIA_RETAINED_P2},async()=>{
 const f=await fixture(),app=await createRequestAcquisition(f.options),first=await app.request(f.request);
 const originalKeys=[...f.store.rows.keys()].sort();
 const metadata=JSON.parse(new TextDecoder().decode(f.options.metadataBytes)),other=structuredClone(metadata.rows[0]);
 other.packId='eng.MRK-1-21-28';other.publisherSourceId='test-p3';other.publisherPassage='1:21-28';other.sourceURL=other.sourceURL.replace('/p2/','/p3/');metadata.rows.unshift(other);
 const metadataBytes=encode(metadata),knownSources=structuredClone(f.options.knownSources),otherPin=structuredClone(knownSources[0]);otherPin.source.resourceId='test-p3';otherPin.policy.url=other.sourceURL;knownSources.unshift(otherPin);
 for(const pins of [knownSources,[...knownSources].reverse()]){
  const updated=await createRequestAcquisition({...f.options,metadataBytes,metadataSha256:await sha256(metadataBytes),knownSources:pins});
  assert.equal((await updated.request(f.request)).key,first.key);assert.deepEqual([...f.store.rows.keys()].sort(),originalKeys);assert.equal(f.fetches(),1);
 }
});
test('stalled retained artifact and unresolved cancellation return unavailable within deadline',{skip:!process.env.FIA_RETAINED_P2},async()=>{
 const f=await fixture(),app=await createRequestAcquisition(f.options);await app.request(f.request);
 const get=f.objects.get.bind(f.objects);let cancelled=0;
 f.objects.get=async key=>key.startsWith('preparation/discovery/')?{body:new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled++;return new Promise(()=>{});}})}:get(key);
 const bounded=await createRequestAcquisition({...f.options,artifactReadMs:10});let timer;
 try{const result=await Promise.race([bounded.request(f.request),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('hung')),500);})]);assert.equal(result.state,'unavailable');assert.equal(result.node,'discover');assert.equal(cancelled,1);}finally{clearTimeout(timer);}
});
