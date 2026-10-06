import {canonicalJSONString,sha256} from '../contract.mjs';
import {createAlignmentAdapter,retainedJSON} from './alignment.mjs';
import {assessUnitQualityEvidence} from './quality-evidence.mjs';

export const UNIT_ELIGIBILITY_POLICY='fia-unit-evidence-eligibility@1';
// Existing measurement schemas deliberately do not qualify recognition or native
// playback clocks. These are policy/data gaps, not a mandate for manual approval.
export const AUTOMATIC_QUALIFICATION_BLOCKERS=Object.freeze([
 'recognition-calibration-policy-unavailable',
 'native-clock-qualification-policy-unavailable',
 'quiet-boundary-qualification-policy-unavailable',
]);

/** Read-only assessment of retained local-recognition evidence. No acquisition,
 * generation, publication, acceptance callback or caller-provided trust flag.
 * `script.units` is the complete ordered unit ledger resolved for input.scriptSha256.
 * This is a resolved narration ledger, not a claim to enumerate every source
 * production note or pause. Nonspoken dispositions need their own versioned
 * source association; this classifier does not infer them or invent ranges.
 * Source bytes remain the acquisition layer's responsibility; source identity is
 * joined here, while raw/alignment/signal/browser JSON bytes are hash-verified.
 */
export async function classifyUnitEligibility({input,source,rawRecognition,alignment,script,signal=null,browser=null,resolveArtifact}){
 ({input,source,rawRecognition,alignment,script,signal,browser}=structuredClone({input,source,rawRecognition,alignment,script,signal,browser}));
 const bindings={sourceSha256:source?.sha256,rawRecognitionSha256:rawRecognition?.sha256,alignmentSha256:alignment?.sha256,scriptSha256:input?.scriptSha256,signalSha256:signal?.sha256??null,browserSha256:browser?.sha256??null};
 const result={schema:UNIT_ELIGIBILITY_POLICY,status:'rejected',bindings,units:[],reasons:[],qualifiedForPlayback:false,acceptedPlaybackRanges:[]};
 try {
  if(typeof resolveArtifact!=='function'||!script||script.scriptSha256!==input?.scriptSha256)throw Error('unit-ledger-binding');
  // Recompute with the existing versioned exact-match algorithm and recognition
  // identity validator. This rejects forged spans, omitted/extra/reordered units,
  // mismatched model/config and changed raw words without a new policy.
  let recomputed;
  const adapter=createAlignmentAdapter({resolveArtifact,resolveUnits:async()=>script,storeArtifact:async bytes=>{
   recomputed=JSON.parse(new TextDecoder().decode(bytes));return {sha256:await sha256(bytes),reference:'memory-only'};
  }});
  await adapter.run({input,nodeOutputs:{acquire:source,transcribe:rawRecognition}});
  const supplied=await retainedJSON(alignment,resolveArtifact);
  if(canonicalJSONString(supplied)!==canonicalJSONString(recomputed))throw Error('alignment-ledger-or-recomputation-mismatch');
  // Reject extra signal rows; missing rows remain explicit per-unit missing input.
  if(signal){const s=await retainedJSON(signal,resolveArtifact);const ids=new Set(script.units.map(u=>u.activityId));
   if(!Array.isArray(s.units)||s.units.some(u=>!ids.has(u.activityId)))throw Error('signal-unit-ledger-mismatch');}
  const quality=await assessUnitQualityEvidence({alignment,signal,browser,sourceSha256:source.sha256,rawRecognitionSha256:rawRecognition.sha256,guideScriptSha256:script.scriptSha256,resolveArtifact});
  result.units=quality.units.map(u=>{
   const missing=[],rejected=[...u.reasons];
   if(u.correspondence!=='exact-candidate')missing.push('unique-exact-correspondence-unresolved');
   if(u.signal==='missing')missing.push('signal-evidence-missing');
   if(u.browser==='missing')missing.push('browser-evidence-missing');
   const complete=u.correspondence==='exact-candidate'&&u.signal==='measured'&&u.browser==='measured-unqualified';
   return {activityId:u.activityId,sourceUnitId:u.sourceUnitId,sourceTextSha256:u.sourceTextSha256,
    correspondence:u.correspondence,evidenceStatus:rejected.length?'rejected':complete?'complete':'missing',
    qualification:'unsupported',qualifiedForPlayback:false,
    reasons:[...rejected,...missing,...AUTOMATIC_QUALIFICATION_BLOCKERS],acceptedPlaybackRanges:[]};
  });
  result.status='assessed';
  result.diagnostics={unassignedRecognizedTokens:recomputed.unassignedRecognizedTokens,classification:'unclassified-context-or-drift'};
  result.policyBlockers=[...AUTOMATIC_QUALIFICATION_BLOCKERS];
 } catch(error){result.reasons=['evidence-binding-or-ledger-rejected',error.message];}
 return result;
}
