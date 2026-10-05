import test from 'node:test';import assert from 'node:assert/strict';
import {canonicalJSONString,sha256} from '../../server/fia/preparation/contract.mjs';
import {createAcceptanceAdapter} from '../../server/fia/preparation/executor/acceptance.mjs';
import {NORMALIZATION_REVISION} from '../../server/fia/preparation/executor/alignment.mjs';
test('exact unit has its own review reasons independent of mismatched neighbor and global context',async()=>{
 const h='a'.repeat(64),input={packId:'pack',book:'MRK',language:'eng',edition:'fixture',passage:'1:21-28',resource:'S01',policyRevision:'fixture',scriptSha256:h},identity=Object.fromEntries(['packId','book','language','edition','passage','resource','policyRevision'].map(k=>[k,input[k]]));
 const alignment={schema:'fia-exact-word-alignment@1',status:'candidate',normalizationRevision:NORMALIZATION_REVISION,identity,sourceSha256:h,scriptSha256:h,rawRecognitionSha256:h,unassignedRecognizedTokens:12,mappings:[{activityId:'a1',sourceUnitId:'u1',sourceTextSha256:h,status:'unmatched'},{activityId:'a2',sourceUnitId:'u2',sourceTextSha256:h,status:'exact-candidate'}]};
 const bytes=new TextEncoder().encode(canonicalJSONString(alignment)),digest=await sha256(bytes);let report;
 const adapter=createAcceptanceAdapter({resolveArtifact:async()=>bytes,storeArtifact:async output=>{report=JSON.parse(new TextDecoder().decode(output));return {sha256:await sha256(output),reference:'immutable:report'};}});
 await adapter.run({input,nodeOutputs:{align:{sha256:digest,reference:'immutable:alignment'},acquire:{sha256:h},transcribe:{sha256:h}}});
 assert.equal(report.status,'review-required');assert(report.reasons.includes('unresolved-unit-correspondence'));assert(report.units[0].reasons.includes('unresolved-unit-correspondence'));assert(!report.units[1].reasons.includes('unresolved-unit-correspondence'));
 assert.deepEqual(report.units[1].reasons,['uncalibrated-recognition','quiet-boundary-policy-missing','browser-clock-evidence-missing']);assert.equal(report.units[1].correspondenceStatus,'exact-candidate');assert.equal(report.units[1].status,'review-required');assert.equal(report.diagnostics.unassignedRecognizedTokens,12);assert(!report.units.some(unit=>unit.reasons.includes('unassigned-recognized-speech')));assert.deepEqual(report.acceptedPlaybackRanges,[]);
});
