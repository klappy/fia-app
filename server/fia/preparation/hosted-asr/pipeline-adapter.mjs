import {canonicalJSONString,sha256} from '../contract.mjs';
import {validateRawRecognition} from './artifact.mjs';
// The recipe hash carries every executor dependency into the existing pipeline's
// transcribe node identity. Raw recognition remains unchanged and candidate-only.
export async function hostedModelRecipe(config){
 const identity=structuredClone(config.identity);
 return {modelId:identity.modelId,modelRevision:identity.modelRevision,configSha256:await sha256(canonicalJSONString({schema:'fia-hosted-pipeline-recipe@1',identity,image:config.image,enforcementSha256:config.enforcementSha256,reviewSha256:config.reviewSha256,adapterRevision:'private-pilot-A@1'}))};
}
export function createHostedRecognitionAdapter({namespace,config,resolveArtifact}){
 if(typeof namespace?.idFromName!=='function'||typeof namespace?.get!=='function'||typeof resolveArtifact!=='function'||config?.enabled!==true)throw Error('hosted-pipeline-unavailable');
 const pinned=structuredClone(config);
 return {paid:true,async run({input,nodeOutputs}){
  const request=structuredClone(input),outputs=structuredClone(nodeOutputs);
  if(canonicalJSONString(request.modelRecipe)!==canonicalJSONString(await hostedModelRecipe(pinned))||request.language!==pinned.identity.language||outputs.acquire?.sha256!==pinned.identity.sourceSha256)throw Error('hosted-pipeline-identity');
  const result=await namespace.get(namespace.idFromName('asr-pilot-v1')).pilotA();
  if(result?.state!=='completed'||result.stopVerified!==true||!result.artifact)throw Error('hosted-pipeline-unresolved');
  const descriptor=structuredClone(result.artifact),bytes=await resolveArtifact(descriptor);
  if(!(bytes instanceof Uint8Array)||bytes.length>1048576||await sha256(bytes)!==descriptor.sha256||descriptor.reference!==`recognition/sha256/${descriptor.sha256}.json`)throw Error('hosted-pipeline-artifact');
  await validateRawRecognition(bytes,pinned.identity);
  return descriptor;
 }};
}
export function hostedAlignmentValidator(config){
 const pinned=structuredClone(config);
 return async(raw,input)=>{
  if(canonicalJSONString(input.modelRecipe)!==canonicalJSONString(await hostedModelRecipe(pinned))||input.language!==pinned.identity.language)throw Error('hosted-alignment-recipe');
  return validateRawRecognition(new TextEncoder().encode(canonicalJSONString(raw)),pinned.identity);
 };
}
