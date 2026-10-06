import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {setup} from './fixtures/request-snapshot-fixture.mjs';
import {createFreshRequestAcquisition} from '../../server/fia/preparation/executor/fresh-request-acquisition.mjs';
function storage(){const rows=new Map();let pending=Promise.resolve();return {rows,get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v)),transaction(fn){const result=pending.then(()=>fn(this));pending=result.catch(()=>{});return result;}};}
function bucket(){const objects=new Map();return {objects,async get(k){const bytes=objects.get(k);return bytes?{size:bytes.length,body:new Blob([bytes]).stream()}:null;},async put(k,body,options){const bytes=body instanceof Uint8Array?body.slice():new Uint8Array(await new Response(body).arrayBuffer());if(options?.onlyIf?.etagDoesNotMatch==='*'&&objects.has(k))return null;objects.set(k,bytes);return {};}};}

test('explicit fresh GET feeds request acquisition with no further publisher GET and warm reopen reuse',{skip:!process.env.FIA_RETAINED_P2},async()=>{
 const bytes=await readFile(process.env.FIA_RETAINED_P2),store=storage(),objects=bucket(),f=await setup({store,objects,bytes});let gets=0,eligible=true;
 const freshness={source:{logicalId:f.next.logicalId,url:f.options.knownSources[0].policy.url,sourceVersionKind:'discovery-snapshot',sourceVersion:f.request.presentationRevision,publisherVersion:null},policy:{revision:'fixture-fresh-v1',maxBytes:1048576,totalMs:10000,progressMs:1000},admissions:[{checkId:'first',sequence:1,expectedPreviousObservationSha256:null,previousSourceSha256:null}],eligibility:()=>eligible,makeStream:()=>new TransformStream(),fetchSource:async()=>{gets++;return new Response(bytes,{headers:{'content-type':'audio/mpeg','content-length':String(bytes.length)}});}};
 const options={...f.options,freshness,snapshots:{policy:f.policy,eligibility:()=>eligible,alignmentConfigSha256:f.next.identity.alignmentConfigSha256,deliveryConfigSha256:f.next.identity.deliveryConfigSha256}},mutable=Buffer.from(f.options.metadataBytes),pending=createFreshRequestAcquisition({...options,metadataBytes:mutable});mutable.fill(0);const app=await pending;
 await assert.rejects(app.request(f.request),/fresh-observation-unavailable/);assert.equal(gets,0);
 await app.observe('first');assert.equal(gets,1);
 const first=await app.request(f.request);assert.equal(first.preparation.node,'transcribe');assert.equal(first.preparation.state,'blocked');assert.equal(first.acceptedPlayback,false);assert.equal(gets,1);
 const prepared=await app.demand(f.request,{sequence:2,expectedPreviousObservationSha256:f.prior.desired.observationSha256});assert.deepEqual(prepared.snapshot.served,f.prior.served);assert.equal(prepared.snapshot.refresh.state,'blocked');assert.equal(gets,1);
 const reopened=await createFreshRequestAcquisition({...options,freshness:{...freshness,fetchSource:()=>{throw Error('offline');}}});
 const warm=await reopened.request(f.request);assert.equal(warm.preparation.key,first.preparation.key);assert.equal(gets,1);
 const current=await app.read(),newer=await createFreshRequestAcquisition({...options,freshness:{...freshness,admissions:[{checkId:'second',sequence:2,expectedPreviousObservationSha256:current.observationSha256,previousSourceSha256:current.observation.sha256}]}});
 const snapshotBefore=structuredClone([...store.rows].filter(([key])=>key.startsWith('snapshot-')));
 const transaction=store.transaction.bind(store);let intercept=true;
 store.transaction=async fn=>{if(intercept){intercept=false;await newer.observe('second');}return transaction(fn);};
 await assert.rejects(app.demand(f.request,{sequence:3,expectedPreviousObservationSha256:prepared.snapshot.desired.observationSha256}),/stale-observation/);
 assert.deepEqual([...store.rows].filter(([key])=>key.startsWith('snapshot-')),snapshotBefore);assert.equal(gets,2);
 const same=await app.request(f.request);assert.equal(same.preparation.key,first.preparation.key);assert.notEqual(same.observationSha256,first.observationSha256);
 const sameSnapshot=await app.demand(f.request,{sequence:3,expectedPreviousObservationSha256:prepared.snapshot.desired.observationSha256});
 assert.equal(sameSnapshot.snapshot.desired.revision,prepared.snapshot.desired.revision);assert.equal(sameSnapshot.preparation,null);assert.equal(gets,2);
 const baseline=await app.read(),changedBytes=new Uint8Array(bytes);changedBytes[changedBytes.length-1]^=1;
 const changed=await createFreshRequestAcquisition({...options,freshness:{...freshness,admissions:[{checkId:'third',sequence:3,expectedPreviousObservationSha256:baseline.observationSha256,previousSourceSha256:baseline.observation.sha256}],fetchSource:async()=>{gets++;return new Response(changedBytes,{headers:{'content-type':'audio/mpeg','content-length':String(changedBytes.length)}});}}});
 await changed.observe('third');const changedRequest=await changed.request(f.request);assert.notEqual(changedRequest.preparation.key,first.preparation.key);assert.equal(gets,3);
 const changedSnapshot=await changed.demand(f.request,{sequence:4,expectedPreviousObservationSha256:sameSnapshot.snapshot.desired.observationSha256});
 assert.notEqual(changedSnapshot.snapshot.desired.revision,sameSnapshot.snapshot.desired.revision);assert.deepEqual(changedSnapshot.snapshot.served,f.prior.served);
 const headKey=[...store.rows.keys()].find(key=>key.startsWith('fresh-head:')),goodHead=structuredClone(store.rows.get(headKey));
 for(const [field,value] of [['sequence',999],['sourceSha256','0'.repeat(64)],['bytes',1],['receiptKey','wrong']]){
  let tamper=true;store.transaction=async fn=>{if(tamper){tamper=false;store.rows.set(headKey,{...goodHead,[field]:value});}return transaction(fn);};
  const before=structuredClone([...store.rows].filter(([key])=>key.startsWith('snapshot-')));
  await assert.rejects(changed.demand(f.request,{sequence:5,expectedPreviousObservationSha256:changedSnapshot.snapshot.desired.observationSha256}),/stale-observation/);
  assert.deepEqual([...store.rows].filter(([key])=>key.startsWith('snapshot-')),before);store.rows.set(headKey,structuredClone(goodHead));
 }
 let remove=true;store.transaction=async fn=>{if(remove){remove=false;objects.objects.delete(changedRequest.observation.sourceKey);}return transaction(fn);};
 await assert.rejects(changed.request(f.request),/fresh-original-missing/);assert.equal(gets,3);
 objects.objects.set(changedRequest.observation.sourceKey,changedBytes);store.transaction=transaction;
 eligible=false;await assert.rejects(reopened.request(f.request),/fresh-ineligible/);eligible=true;
 objects.objects.set(changedRequest.observation.sourceKey,new Uint8Array([1,2,3]));await assert.rejects(reopened.request(f.request),/fresh-retained/);assert.equal(gets,3);
});
