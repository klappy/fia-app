import {canonicalJSONString,sha256} from '../contract.mjs';
import {createRequestAcquisition} from './request-acquisition.mjs';
import {createCoherentSnapshots} from './coherent-snapshot.mjs';

// Private trusted observation port. This increment has no accepted-output builder.
export async function createRequestSnapshots({acquisition:options,policy,eligibility}){
 const snapshotOptions={storage:options.storage,bucket:options.bucket,
  policy:{sha256:policy?.sha256,validateSnapshot:policy?.validateSnapshot},eligibility};
 // Validate policy capabilities now, before any request can acquire bytes.
 createCoherentSnapshots({...snapshotOptions,builder:{paid:false,run:async()=>({state:'blocked'})}});
 const acquisition=await createRequestAcquisition(options);
 return Object.freeze({async demand(rawRequest,rawObservation){
  const request=structuredClone(rawRequest),observation=structuredClone(rawObservation);
  const resolved=await acquisition.resolve(request);
  const recognitionRecipeSha256=await sha256(canonicalJSONString({schema:'fia-recognition-recipe@1',...resolved.modelRecipe}));
  const logicalId=canonicalJSONString(Object.fromEntries(['packId','language','edition','book','passage','resource'].map(key=>[key,resolved.input[key]])));
  if(observation?.logicalId!==logicalId||observation.identity?.sourceSha256!==resolved.sourcePolicy.sha256||
   observation.identity?.scriptSha256!==resolved.input.scriptSha256||
   observation.identity?.recognitionConfigSha256!==recognitionRecipeSha256)
   throw Error('request-observation-binding');
  let preparation=null;
  const snapshots=createCoherentSnapshots({...snapshotOptions,builder:{paid:false,async run(){
   preparation=await acquisition.request(request);
   // Even a future ready acquisition response cannot bypass the missing
   // production semantic, rights, timing and presentation acceptance builder.
   return {state:'blocked'};
  }}});
  const snapshot=await snapshots.demand(observation);
  return {consumer:resolved.consumer,preparation,snapshot,
   capability:'accepted-snapshot-builder-unavailable'};
 }});
}
