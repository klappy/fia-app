import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canonicalJSONString,sha256} from '../../server/fia/preparation/contract.mjs';
import {reviewedOriginalStatus} from '../../server/fia/preparation/reviewed-original-status.mjs';
import {createReviewedOriginalStore} from '../../server/fia/preparation/reviewed-original-store.mjs';
async function setup(){
 const row=JSON.parse(await readFile(new URL('../../server/fia/preparation/catalog.json',import.meta.url))).entries[0];
 const source=process.env.FIA_RETAINED_P2?new Uint8Array(await readFile(process.env.FIA_RETAINED_P2)):new Uint8Array(1024).fill(42);
 const fixtures=new Map();
 if(!process.env.FIA_RETAINED_P2){
  // CI without retained publisher bytes uses explicitly synthetic source pins.
  const e=row.accepted.expected,paths={ledger:`/content/prepared-audio-evidence/${e.evidence.recordingLedgerSha256}.json`,timing:`/content/prepared-audio-evidence/${e.evidence.timingSha256}.json`,acceptance:`/content/prepared-audio-evidence/${e.acceptanceSha256}.json`,result:row.accepted.path},docs={};
  for(const [role,path] of Object.entries(paths))docs[role]=JSON.parse(await readFile(new URL('../../apps/web/public'+path,import.meta.url)));
  row.source={...row.source,sha256:await sha256(source),bytes:source.length};
  const {ledger,timing,acceptance,result}=docs;
  ledger.source=row.source;acceptance.source=row.source;result.source=row.source;
  result.delivery={...result.delivery,sha256:row.source.sha256,bytes:source.length,url:`/v1/preparation-audio/${row.source.sha256}.mp3`};
  Object.assign(timing,{sourceAudioSha256:row.source.sha256,deliveryAudioSha256:row.source.sha256,sourceBytes:source.length,deliveryBytes:source.length});
  const pin=async(doc,folder)=>{const text=canonicalJSONString(doc),sha=await sha256(text);fixtures.set(`/content/${folder}/${sha}.json`,text);return sha;};
  const evidence={recordingLedgerSha256:await pin(ledger,'prepared-audio-evidence'),timingSha256:await pin(timing,'prepared-audio-evidence')};
  Object.assign(acceptance,evidence);const acceptanceSha256=await pin(acceptance,'prepared-audio-evidence');
  result.evidence={...evidence,acceptanceSha256};const resultSha256=await pin(result,'prepared-audio');
  row.accepted={path:`/content/prepared-audio/${resultSha256}.json`,bytes:new TextEncoder().encode(canonicalJSONString(result)).length,expected:{...e,source:row.source,delivery:result.delivery,evidence,acceptanceSha256,resultSha256}};
 }

 const records=new Map(),objects=new Map();let assetReads=0,hook=null,allowed=true;
 const storage={async get(k){return structuredClone(records.get(k));},async put(k,v){records.set(k,structuredClone(v));},async transaction(fn){return fn(storage);}};
 const bucket={async get(k){if(hook)await hook(k);return objects.has(k)?new Response(objects.get(k)):null;},async put(k,v){if(!objects.has(k))objects.set(k,new Uint8Array(v));}};
 const options={storage,bucket,admissions:[row],readOriginal:async()=>source,eligibility:()=>allowed,guard:async()=>true,fetchAsset:async path=>{assetReads++;return new Response(fixtures.has(path)?fixtures.get(path):await readFile(new URL('../../apps/web/public'+path,import.meta.url)));}};
 return {row,records,objects,options,key:row.accepted.expected.resultSha256,get assetReads(){return assetReads;},setHook(fn){hook=fn;},revoke(){allowed=false;}};
}
test('retains all four evidence artifacts and reconstructs warm snapshot without asset fetch',async()=>{
 const f=await setup(),store=await createReviewedOriginalStore(f.options),cold=await store.demand(f.key);
 assert.equal(cold.state,'ready');assert.equal(cold.result.activities.length,8);assert.equal(f.assetReads,4);
 const restarted=await createReviewedOriginalStore({...f.options,fetchAsset:()=>{throw Error('warm fetch forbidden');}});
 assert.deepEqual(await restarted.read(f.key),cold);
 f.objects.values().next().value[0]^=1;
 await assert.rejects(restarted.read(f.key));
});
test('a concurrent head replacement during evidence reads refuses stale result',async()=>{
 const f=await setup(),store=await createReviewedOriginalStore(f.options);await store.demand(f.key);
 let changed=false;f.setHook(()=>{if(!changed){changed=true;const key=[...f.records.keys()].find(k=>k.startsWith('reviewed-original:head:'));f.records.set(key,{...f.records.get(key),desired:'changed'});}});
 await assert.rejects(store.read(f.key),/head-changed/);
});
test('revocation during evidence reads refuses ready result',async()=>{
 const f=await setup(),store=await createReviewedOriginalStore(f.options);await store.demand(f.key);
 f.setHook(()=>f.revoke());await assert.rejects(store.read(f.key),/ineligible/);
});
test('unresolved admission guard is bounded and cannot later publish',async()=>{
 const f=await setup();let release;
 const pending=new Promise(resolve=>{release=resolve;});
 const store=await createReviewedOriginalStore({...f.options,totalMs:20,guard:()=>pending});
 await assert.rejects(store.demand(f.key),/timeout/);release(true);
 await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.records.size,0);assert.equal(f.assetReads,0);
});
test('failed replacement retains full independently admitted older presentation',async()=>{
 const f=await setup(),store=await createReviewedOriginalStore(f.options);const old=await store.demand(f.key);
 const revised=structuredClone(f.row);revised.selection.presentationRevision='a'.repeat(64);
 revised.identity.presentationRevision='a'.repeat(64);revised.accepted.expected.resultSha256='b'.repeat(64);
 revised.accepted.path='/content/prepared-audio/'+ 'b'.repeat(64)+'.json';
 const other=await createReviewedOriginalStore({...f.options,admissions:[f.row,revised],fetchAsset:async()=>new Response('',{status:404})});
 const retained=await other.demand(revised.accepted.expected.resultSha256);
 assert.equal(retained.state,'ready');assert.equal(retained.reason,'retained-reviewed-original');
 assert.deepEqual(retained.result,old.result);assert.deepEqual(retained.servedSelection,f.row.selection);
 assert.deepEqual(retained.desiredSelection,revised.selection);
 assert.equal(reviewedOriginalStatus(revised,retained).state,'blocked');
 assert.equal(reviewedOriginalStatus(revised,retained).result,null);
 const revoked=await createReviewedOriginalStore({...f.options,admissions:[revised]});
 assert.equal((await revoked.read(revised.accepted.expected.resultSha256)).state,'unavailable');
 const unrelated=structuredClone(revised);unrelated.selection.language='spa';
 const isolated=await createReviewedOriginalStore({...f.options,admissions:[f.row,unrelated]});
 assert.equal((await isolated.read(unrelated.accepted.expected.resultSha256)).state,'unavailable');
});

test('revocation while read guard awaits cannot return ready',async()=>{
 const f=await setup();let revokeOnRead=false;
 const store=await createReviewedOriginalStore({...f.options,guard:async(tx,row,phase)=>{if(revokeOnRead&&phase==='read'){await Promise.resolve();f.revoke();}return true;}});
 await store.demand(f.key);revokeOnRead=true;await assert.rejects(store.read(f.key),/read-refused/);
});
