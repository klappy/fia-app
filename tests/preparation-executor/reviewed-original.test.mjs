import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {verifyReviewedOriginal} from '../../server/fia/preparation/reviewed-original.mjs';
import {canonicalJSONString,sha256} from '../../server/fia/preparation/contract.mjs';
const encode=value=>new TextEncoder().encode(canonicalJSONString(value));
async function fixture(){
 const row=JSON.parse(await readFile(new URL('../../server/fia/preparation/catalog.json',import.meta.url))).entries[0],expected=row.accepted.expected;
 const files={preparedResult:row.accepted.path,recordingLedger:`/content/prepared-audio-evidence/${expected.evidence.recordingLedgerSha256}.json`,timing:`/content/prepared-audio-evidence/${expected.evidence.timingSha256}.json`,acceptance:`/content/prepared-audio-evidence/${expected.acceptanceSha256}.json`};
 const artifacts={};for(const [role,path] of Object.entries(files))artifacts[role]=new Uint8Array(await readFile(new URL('../../apps/web/public'+path,import.meta.url)));
 return {row,artifacts};
}
async function repin(f,change){
 const docs=Object.fromEntries(Object.entries(f.artifacts).map(([role,bytes])=>[role,JSON.parse(new TextDecoder().decode(bytes))]));change(docs);
 const ledger=await sha256(encode(docs.recordingLedger)),timing=await sha256(encode(docs.timing));
 docs.acceptance.recordingLedgerSha256=ledger;docs.acceptance.timingSha256=timing;const acceptance=await sha256(encode(docs.acceptance));
 docs.preparedResult.evidence={recordingLedgerSha256:ledger,timingSha256:timing,acceptanceSha256:acceptance};
 f.artifacts=Object.fromEntries(Object.entries(docs).map(([role,doc])=>[role,encode(doc)]));
 Object.assign(f.row.accepted.expected,{evidence:{recordingLedgerSha256:ledger,timingSha256:timing},acceptanceSha256:acceptance,resultSha256:await sha256(f.artifacts.preparedResult)});
 f.row.accepted.path=`/content/prepared-audio/${f.row.accepted.expected.resultSha256}.json`;f.row.accepted.bytes=f.artifacts.preparedResult.length;
}
test('real retained reviewed-original evidence forms a typed snapshot without synthetic recognition nodes',async()=>{
 const f=await fixture(),snapshot=await verifyReviewedOriginal(f.row,f.artifacts);
 assert.equal(snapshot.schema,'fia-reviewed-original-snapshot@1');assert.equal(snapshot.result.activities.length,8);
 assert.deepEqual(Object.keys(snapshot.artifacts),['preparedResult','recordingLedger','timing','acceptance']);
 assert.equal(snapshot.externalEvidenceBodiesVerified,false);assert.match(snapshot.evidenceLimits.scope,/candidate admission only/);
 assert.equal(snapshot.artifacts.preparedResult.sha256,f.row.accepted.expected.resultSha256);
});
test('catalog identity and evidence corruption cannot authorize a different selection',async()=>{
 for(const mutate of [f=>f.row.eligibility='revoked',f=>f.row.selection.language='spa',f=>f.row.scriptSha256='0'.repeat(64),f=>f.row.activities[0].sourceTextSha256='0'.repeat(64),f=>f.artifacts.acceptance[0]^=1]){
  const f=await fixture();mutate(f);await assert.rejects(verifyReviewedOriginal(f.row,f.artifacts));
 }
});
test('even rehashed catalog fixtures cannot bypass clock, ranges or review joins',async()=>{
 for(const change of [d=>d.timing.mapping.scale=2,d=>d.timing.deliveryAudioSha256='0'.repeat(64),d=>d.timing.deliveryDuration+=1,d=>d.acceptance.clockReviewSha256='0'.repeat(64),d=>d.recordingLedger.mappings[0].playbackRange.startSeconds+=.1,d=>d.acceptance.sourceReviewSha256='0'.repeat(64)]){
  const f=await fixture();await repin(f,change);await assert.rejects(verifyReviewedOriginal(f.row,f.artifacts),/reviewed-original-/);
 }
});
