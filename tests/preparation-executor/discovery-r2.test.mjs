import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {createGuideDiscoveryAdapter} from '../../server/fia/preparation/executor/discovery.mjs';
import {createObservedSourceAdapter} from '../../server/fia/preparation/executor/observed-source.mjs';
import {canonicalJSONString,sha256} from '../../server/fia/preparation/contract.mjs';
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json')),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
function runtime(path){return new Miniflare({...convertV4MiniflareOptions({name:'discovery-r2-fixture',modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-01',r2Buckets:['SOURCES']}),resourcePersistencePath:path});}
const h='a'.repeat(64),body=new TextEncoder().encode('synthetic publisher recording bytes');
async function setup(bucket){
 const row={packId:'eng.MRK-1-14-20',book:'MRK',language:'eng',edition:'fia-guide',presentationRevision:h,publisherSourceId:'eng-mrk-p2-v2.1',publisherPassage:'1:14-20',stepId:'S01',sourceURL:'https://s3.amazonaws.com/cbbt-er.public/pericopes/eng/mrk/p2/s1/v2/vbr0.mp3',sourceMetadataSha256:h,guideContentSha256:h,sourceUnits:[{sourceUnitId:'S01-U001',sourceTextSha256:h}]};
 const metadataBytes=new TextEncoder().encode(canonicalJSONString({schema:'fia-published-guide-sources@1',rows:[row]})),discovery=await createGuideDiscoveryAdapter({metadataBytes,metadataSha256:await sha256(metadataBytes),bucket});
 const {input}=await discovery.resolveRequest({packId:row.packId,presentationRevision:h,language:'eng',edition:'fia-guide',sourceUnitId:'S01-U001',sourceTextSha256:h});
 const artifact=await discovery.adapter.run({input});return {discovery,context:{input,nodeOutputs:{discover:artifact}}};
}
test('actual R2 conditional writes and persisted discovery/source reuse survive runtime restart offline',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'fia-discovery-r2-'));t.after(()=>rm(directory,{recursive:true,force:true}));let mf=runtime(directory),calls=0;
 try{
  let bucket=await mf.getR2Bucket('SOURCES'),f=await setup(bucket);const adapter=createObservedSourceAdapter({bucket,validatePublisherURL:f.discovery.validatePublisherURL,fetchSource:async()=>{calls++;return new Response(body,{headers:{'Content-Type':'audio/mpeg'}});}});
  const first=await adapter.run(f.context);assert.equal(first.sha256,await sha256(body));assert.deepEqual(new Uint8Array(await(await bucket.get(first.reference)).arrayBuffer()),body);
  // Exercise native conditional semantics: existing bytes survive a losing write.
  await bucket.put(first.reference,'must not replace',{onlyIf:{etagDoesNotMatch:'*'}});assert.deepEqual(new Uint8Array(await(await bucket.get(first.reference)).arrayBuffer()),body);
  await mf.dispose();mf=runtime(directory);bucket=await mf.getR2Bucket('SOURCES');f=await setup(bucket);
  const offline=createObservedSourceAdapter({bucket,validatePublisherURL:f.discovery.validatePublisherURL,fetchSource:async()=>{calls++;throw Error('publisher offline');}});
  assert.deepEqual(await offline.run(f.context),first);assert.equal(calls,1);
  const refKey=`originals/refs/${await sha256(canonicalJSONString({url:'https://s3.amazonaws.com/cbbt-er.public/pericopes/eng/mrk/p2/s1/v2/vbr0.mp3',sourceVersion:h}))}/${first.sha256}.json`;
  const ref=await bucket.get(refKey);assert(ref);const refBytes=new Uint8Array(await ref.arrayBuffer());await bucket.delete(refKey);await assert.rejects(offline.run(f.context),/reference-missing/);assert.equal(calls,1);await bucket.put(refKey,new TextEncoder().encode('{}'));await assert.rejects(offline.run(f.context),/reference-conflict/);assert.equal(calls,1);await bucket.put(refKey,refBytes);
  await bucket.put(first.reference,'corrupt');await assert.rejects(offline.run(f.context));assert.equal(calls,1);assert.equal(await(await bucket.get(first.reference)).text(),'corrupt');await bucket.put(first.reference,body);
  await bucket.delete(first.reference);await assert.rejects(offline.run(f.context),/source-missing/);assert.equal(calls,1);
 }finally{await mf.dispose();}
});
