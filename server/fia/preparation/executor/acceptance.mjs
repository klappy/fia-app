import {canonicalJSONString} from '../contract.mjs';
import {retainedJSON,storeJSON,NORMALIZATION_REVISION} from './alignment.mjs';
// This adapter has no calibrated recognition/boundary/browser-clock policy.
// Exact token correspondence remains review-required; it never invents acceptance.
export function createAcceptanceAdapter({resolveArtifact,storeArtifact}){
 if(typeof resolveArtifact!=='function'||typeof storeArtifact!=='function')throw Error('acceptance-policy-unavailable');
 return {paid:false,async run({input,nodeOutputs}){
  input=structuredClone(input);nodeOutputs=structuredClone(nodeOutputs);
  const alignment=await retainedJSON(nodeOutputs.align,resolveArtifact),identity=Object.fromEntries(['packId','book','language','edition','passage','resource','policyRevision'].map(key=>[key,input[key]]));
  if(alignment.schema!=='fia-exact-word-alignment@1'||alignment.status!=='candidate'||alignment.normalizationRevision!==NORMALIZATION_REVISION||alignment.scriptSha256!==input.scriptSha256||alignment.sourceSha256!==nodeOutputs.acquire?.sha256||alignment.rawRecognitionSha256!==nodeOutputs.transcribe?.sha256||canonicalJSONString(alignment.identity)!==canonicalJSONString(identity)||!Array.isArray(alignment.mappings)||!alignment.mappings.length)throw Error('acceptance-alignment-binding');
  const reasons=['uncalibrated-recognition','quiet-boundary-policy-missing','browser-clock-evidence-missing'];
  if(alignment.mappings.some(row=>row.status!=='exact-candidate'))reasons.push('unresolved-unit-correspondence');
  if(alignment.unassignedRecognizedTokens!==0)reasons.push('unassigned-recognized-speech');
  return storeJSON({schema:'fia-preparation-acceptance@1',status:'review-required',identity,sourceSha256:alignment.sourceSha256,scriptSha256:alignment.scriptSha256,rawRecognitionSha256:alignment.rawRecognitionSha256,alignmentSha256:nodeOutputs.align.sha256,reasons,acceptedPlaybackRanges:[]},storeArtifact);
 }};
}
