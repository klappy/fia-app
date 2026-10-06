import {setup as setupFixture} from './fixtures/request-snapshot-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequestSnapshots} from '../../server/fia/preparation/executor/request-snapshot.mjs';
import {createCoherentSnapshots,SNAPSHOT_EDGES} from '../../server/fia/preparation/executor/coherent-snapshot.mjs';
import {canonicalJSONString,sha256} from '../../server/fia/preparation/contract.mjs';
import {KNOWN_SOURCE_POLICY} from '../../server/fia/preparation/executor/known-source-stream.mjs';
const encode=v=>new TextEncoder().encode(canonicalJSONString(v));
function storage(){const rows=new Map();let pending=Promise.resolve();return {rows,get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v)),transaction(fn){const result=pending.then(()=>fn(this));pending=result.catch(()=>{});return result;}};}
function bucket(){const objects=new Map();return {objects,async get(k){const bytes=objects.get(k);return bytes?{size:bytes.length,body:new Blob([bytes]).stream()}:null;},async put(k,body,options){const bytes=body instanceof Uint8Array?body.slice():new Uint8Array(await new Response(body).arrayBuffer());if(options?.onlyIf?.etagDoesNotMatch==='*'&&objects.has(k))return null;objects.set(k,bytes);return {};}};}
async function setup(){return setupFixture({store:storage(),objects:bucket(),bytes:await readFile(process.env.FIA_RETAINED_P2)});}
test('request acquisition preserves complete prior snapshot when transcription is unavailable, including restart and revocation',{skip:!process.env.FIA_RETAINED_P2},async()=>{
 const f=await setup();let eligible=true;
 const options={acquisition:f.options,policy:f.policy,eligibility:()=>eligible};
 const service=await createRequestSnapshots(options),result=await service.demand(f.request,f.next);
 assert.equal(result.preparation.node,'transcribe');assert.equal(result.preparation.state,'blocked');
 assert.equal(result.snapshot.refresh.state,'blocked');assert.deepEqual(result.snapshot.served,f.prior.served);assert.equal(f.fetches(),1);
 const reopened=await createRequestSnapshots({...options,acquisition:{...f.options,fetchSource:()=>{throw Error('offline');}}});
 const warm=await reopened.demand(f.request,f.next);assert.deepEqual(warm.snapshot.served,f.prior.served);assert.equal(warm.preparation,null);assert.equal(f.fetches(),1);
 eligible=false;assert.equal((await reopened.demand(f.request,f.next)).snapshot.served,null);
});
test('wrong observation dependencies refuse before source acquisition or snapshot mutation',{skip:!process.env.FIA_RETAINED_P2},async()=>{
 const f=await setup(),service=await createRequestSnapshots({acquisition:f.options,policy:f.policy,eligibility:()=>true}),before=structuredClone([...f.store.rows]);
 for(const key of ['sourceSha256','scriptSha256','recognitionConfigSha256'])await assert.rejects(service.demand(f.request,{...f.next,identity:{...f.next.identity,[key]:'0'.repeat(64)}}),/request-observation-binding/);
 assert.equal(f.fetches(),0);assert.deepEqual([...f.store.rows],before);
});
test('failed real acquisition preserves prior served graph without fabricated readiness',{skip:!process.env.FIA_RETAINED_P2},async()=>{
 const f=await setup(),service=await createRequestSnapshots({acquisition:{...f.options,fetchSource:()=>{throw Error('fixture-offline');}},policy:f.policy,eligibility:()=>true});
 const result=await service.demand(f.request,f.next);assert.equal(result.preparation.state,'uncertain');assert.equal(result.preparation.node,'acquire');assert.deepEqual(result.snapshot.served,f.prior.served);assert.equal(result.capability,'accepted-snapshot-builder-unavailable');
});
test('same settings hash with a different model or model revision cannot reuse the snapshot observation',{skip:!process.env.FIA_RETAINED_P2},async()=>{
 for(const field of ['modelId','modelRevision']){
  const f=await setup(),modelRecipe={...f.options.modelRecipe,[field]:'changed'};
  const service=await createRequestSnapshots({acquisition:{...f.options,modelRecipe},policy:f.policy,eligibility:()=>true});
  const before=structuredClone([...f.store.rows]);
  await assert.rejects(service.demand(f.request,f.next),/request-observation-binding/);
  assert.equal(f.fetches(),0);assert.deepEqual([...f.store.rows],before);
 }
});
test('a different edition cannot inherit the previous logical snapshot',{skip:!process.env.FIA_RETAINED_P2},async()=>{
 const f=await setup(),metadata=JSON.parse(new TextDecoder().decode(f.options.metadataBytes));metadata.rows[0].edition='another-edition';
 const metadataBytes=encode(metadata),service=await createRequestSnapshots({acquisition:{...f.options,metadataBytes,metadataSha256:await sha256(metadataBytes)},policy:f.policy,eligibility:()=>true});
 await assert.rejects(service.demand({...f.request,edition:'another-edition'},f.next),/request-observation-binding/);assert.equal(f.fetches(),0);
});
test('factory captures snapshot storage and policy before asynchronous acquisition initialization',{skip:!process.env.FIA_RETAINED_P2},async()=>{
 const f=await setup(),options={...f.options},policy={...f.policy};
 const pending=createRequestSnapshots({acquisition:options,policy,eligibility:()=>true});
 options.storage=storage();options.bucket=bucket();policy.validateSnapshot=()=>false;
 const result=await(await pending).demand(f.request,f.next);
 assert.deepEqual(result.snapshot.served,f.prior.served);assert.equal(result.preparation.node,'transcribe');
});
