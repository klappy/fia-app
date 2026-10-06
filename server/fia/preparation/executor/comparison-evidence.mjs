import {canonicalJSONString,sha256} from '../contract.mjs';
import {retainedJSON,storeJSON} from './alignment.mjs';
import {compareSpokenReference,compareSpokenPromptLabel,spokenComparisonPolicyIdentity} from './spoken-reference.mjs';

// Trusted structural contexts only. Produces review evidence, never new ranges.
export async function createComparisonEvidenceAdapter({resolveArtifact,contexts:rawContexts,storeArtifact}){
 if([resolveArtifact,storeArtifact].some(fn=>typeof fn!=='function'))throw Error('comparison-capability');
 const contexts=structuredClone(rawContexts);
 if(!Array.isArray(contexts)||contexts.length>100)throw Error('comparison-context-limit');
 const serialized=canonicalJSONString(contexts);if(serialized.length>200000)throw Error('comparison-context-limit');
 const dependencySha256=await sha256(canonicalJSONString({schema:'fia-review-comparison-policy@1',policy:await spokenComparisonPolicyIdentity(),contexts}));
 return {paid:false,dependencySha256,async run({input,nodeOutputs}){
  input=structuredClone(input);nodeOutputs=structuredClone(nodeOutputs);
  const alignment=await retainedJSON(nodeOutputs.align,resolveArtifact);
  if(alignment.schema!=='fia-exact-word-alignment@1'||alignment.sourceSha256!==nodeOutputs.acquire.sha256||alignment.rawRecognitionSha256!==nodeOutputs.transcribe.sha256||alignment.scriptSha256!==input.scriptSha256)throw Error('comparison-alignment-binding');
  const raw=await retainedJSON(nodeOutputs.transcribe,resolveArtifact);
  if(raw.source?.sha256!==nodeOutputs.acquire.sha256||!Array.isArray(raw.segments))throw Error('comparison-raw-binding');
  const words=[],wordOrigins=[];
  for(const [segmentIndex,segment] of raw.segments.entries()){
   if(!Array.isArray(segment.words))throw Error('comparison-words');
   for(const [wordIndex,word] of segment.words.entries()){
    words.push(word);wordOrigins.push({segmentIndex,wordIndex});
    if(words.length>10000)throw Error('comparison-word-limit');
   }
  }
  const recognitionBytes=new TextEncoder().encode(canonicalJSONString({schema:'fia-comparison-word-view@1',rawRecognitionSha256:nodeOutputs.transcribe.sha256,words,wordOrigins}));
  if(recognitionBytes.length>1048576)throw Error('comparison-byte-limit');
  const recognitionSha256=await sha256(recognitionBytes);
  const comparisons=[];
  for(const entry of contexts){
   const unit=alignment.mappings?.find(row=>row.activityId===entry.activityId);
   if(!unit||typeof entry.script!=='string'||await sha256(entry.script)!==unit.sourceTextSha256)throw Error('comparison-unit-binding');
   const compare=entry.context?.kind==='bible-reference'?compareSpokenReference:entry.context?.kind==='numbered-prompt-label'?compareSpokenPromptLabel:null;
   if(!compare)throw Error('comparison-context-kind');
   const result=await compare({...entry,scriptSha256:unit.sourceTextSha256,recognitionBytes,recognitionSha256});
   comparisons.push({activityId:unit.activityId,sourceUnitId:unit.sourceUnitId,result});
  }
  const normalizationSha256=await sha256(canonicalJSONString(comparisons.map(c=>({activityId:c.activityId,sourceUnitId:c.sourceUnitId,pins:c.result.pins}))));
  const view=await storeArtifact(recognitionBytes);
  if(view?.sha256!==recognitionSha256||typeof view.reference!=='string'||!view.reference)throw Error('comparison-view-store');
  const retainedView=await retainedJSON(view,resolveArtifact);
  if(retainedView.schema!=='fia-comparison-word-view@1'||retainedView.rawRecognitionSha256!==nodeOutputs.transcribe.sha256)throw Error('comparison-view-binding');
  return storeJSON({schema:'fia-review-comparison-evidence@1',status:'review-required',grantsAcceptance:false,timingValidated:false,
   sourceSha256:nodeOutputs.acquire.sha256,scriptSha256:input.scriptSha256,rawRecognitionSha256:nodeOutputs.transcribe.sha256,
   alignmentSha256:nodeOutputs.align.sha256,dependencySha256,normalizationSha256,wordView:{sha256:view.sha256,reference:view.reference},comparisons},storeArtifact);
 }};
}
