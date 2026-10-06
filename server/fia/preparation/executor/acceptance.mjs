import {canonicalJSONString} from '../contract.mjs';
import {retainedJSON,storeJSON,NORMALIZATION_REVISION} from './alignment.mjs';
// This adapter has no calibrated recognition/boundary/browser-clock policy.
// Exact token correspondence remains review-required; it never invents acceptance.
export function createAcceptanceAdapter({resolveArtifact,storeArtifact,comparisonAdapter}){
 if(typeof resolveArtifact!=='function'||typeof storeArtifact!=='function')throw Error('acceptance-policy-unavailable');
 const compare=comparisonAdapter?.run;
 const dependencySha256=comparisonAdapter?.dependencySha256;
 if(comparisonAdapter&&(comparisonAdapter.paid!==false||typeof compare!=='function'||typeof dependencySha256!=='string'||!/^[a-f0-9]{64}$/.test(dependencySha256)))throw Error('comparison-capability');
 return {paid:false,...(compare?{dependencySha256}:{}),async run({input,nodeOutputs}){
  input=structuredClone(input);nodeOutputs=structuredClone(nodeOutputs);
  const alignment=await retainedJSON(nodeOutputs.align,resolveArtifact),identity=Object.fromEntries(['packId','book','language','edition','passage','resource','policyRevision'].map(key=>[key,input[key]]));
  if(alignment.schema!=='fia-exact-word-alignment@1'||alignment.status!=='candidate'||alignment.normalizationRevision!==NORMALIZATION_REVISION||alignment.scriptSha256!==input.scriptSha256||alignment.sourceSha256!==nodeOutputs.acquire?.sha256||alignment.rawRecognitionSha256!==nodeOutputs.transcribe?.sha256||canonicalJSONString(alignment.identity)!==canonicalJSONString(identity)||!Array.isArray(alignment.mappings)||!alignment.mappings.length)throw Error('acceptance-alignment-binding');
  const sharedReasons=['uncalibrated-recognition','quiet-boundary-policy-missing','browser-clock-evidence-missing'];
  // Each unit can later receive independent acceptance evidence; neighboring drift
  // never changes its correspondence result. Retained raw original stays reusable.
  const units=alignment.mappings.map(row=>({activityId:row.activityId,sourceUnitId:row.sourceUnitId,sourceTextSha256:row.sourceTextSha256,status:'review-required',correspondenceStatus:row.status,reasons:[...sharedReasons,...(row.status==='exact-candidate'?[]:['unresolved-unit-correspondence'])]}));
  const reasons=[...sharedReasons];
  if(alignment.mappings.some(row=>row.status!=='exact-candidate'))reasons.push('unresolved-unit-correspondence');
  const diagnostics={unassignedRecognizedTokens:alignment.unassignedRecognizedTokens,classification:'unclassified-context-or-drift',note:'Unassigned tokens may include introductions, numbering, closing context or recognition differences; this count is not a unit-level drift verdict.'};
  if(compare){
   const artifact=await compare({input:structuredClone(input),nodeOutputs:structuredClone(nodeOutputs)}),report=await retainedJSON(artifact,resolveArtifact);
   if(report.dependencySha256!==dependencySha256)throw Error('acceptance-comparison-policy');
   if(report.schema!=='fia-review-comparison-evidence@1'||report.status!=='review-required'||report.grantsAcceptance!==false||report.timingValidated!==false||report.alignmentSha256!==nodeOutputs.align.sha256||report.rawRecognitionSha256!==nodeOutputs.transcribe.sha256||report.sourceSha256!==nodeOutputs.acquire.sha256||report.scriptSha256!==input.scriptSha256)throw Error('acceptance-comparison-binding');
   diagnostics.comparisonEvidence=artifact;
  }
  return storeJSON({schema:'fia-preparation-acceptance@1',status:'review-required',identity,sourceSha256:alignment.sourceSha256,scriptSha256:alignment.scriptSha256,rawRecognitionSha256:alignment.rawRecognitionSha256,alignmentSha256:nodeOutputs.align.sha256,reasons,units,diagnostics,acceptedPlaybackRanges:[]},storeArtifact);
 }};
}
