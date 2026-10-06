import {canonicalJSONString,sha256} from '../contract.mjs';
import {readBounded} from '../service.mjs';
import {createGuideDiscoveryAdapter} from './discovery.mjs';
import {createKnownSourceAcquisition} from './known-source-stream.mjs';
import {createPipeline} from './pipeline.mjs';

// Trusted composition boundary. No public route or recognition capability is installed.
export async function createRequestAcquisition({metadataBytes,metadataSha256,knownSources,bucket,storage,modelRecipe,policyRevision,fetchSource,makeStream}){
 const pins=structuredClone(knownSources),recipe=structuredClone(modelRecipe);
 if(!Array.isArray(pins)||!pins.length)throw Error('known-source-policy-required');
 const guide=await createGuideDiscoveryAdapter({metadataBytes,metadataSha256,bucket});
 const sourceId=input=>canonicalJSONString(input.source);
 const admitted=new Map();
 for(const item of pins){
  if(!item||Object.keys(item).sort().join()!=='policy,source'||Object.keys(item.source||{}).sort().join()!=='publisherId,resourceId,version'||Object.values(item.source).some(v=>typeof v!=='string'||!v))throw Error('invalid-source-admission');
  if(item.policy?.sourceVersion!==item.source.version)throw Error('source-version-mismatch');
  const key=canonicalJSONString(item.source);if(admitted.has(key))throw Error('ambiguous-source-admission');
  const acquisition=createKnownSourceAcquisition({bucket,storage,policy:item.policy,...(fetchSource?{fetchSource}:{}),...(makeStream?{makeStream}:{})});
  admitted.set(key,{policy:item.policy,acquisition});
 }
 // A changed trusted source pin must never reuse a completed node under its old policy.
 const policyId=await sha256(canonicalJSONString({schema:'fia-request-acquisition@1',metadataSha256,pins,recipe,policyRevision}));
 function admission(input){const item=admitted.get(sourceId(input));if(!item)throw Error('source-not-admitted');return item;}
 async function readArtifact(artifact,limit){
  const object=await bucket.get(artifact.reference);if(!object)throw Error('retained-artifact-missing');
  const bytes=await readBounded(new Response(object.body),limit);if(await sha256(bytes)!==artifact.sha256)throw Error('retained-artifact-corrupt');return bytes;
 }
 const acquire={paid:false,async run({input,nodeOutputs}){
  const item=admission(input),descriptor=nodeOutputs.discover;
  if(descriptor?.reference!==`preparation/discovery/${descriptor?.sha256}.json`)throw Error('discovery-reference');
  const discovery=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readArtifact(descriptor,32768)));
  if(await guide.validatePublisherURL(item.policy.url,{input,discovery})!==true)throw Error('source-discovery-mismatch');
  const result=await item.acquisition.acquire();if(result.state!=='completed')throw Error('source-acquisition-unresolved');
  return result.artifact;
 }};
 const pipeline=createPipeline({storage,policyId,allowPaid:false,adapters:{discover:guide.adapter,acquire},verifyArtifact:async(artifact,{input,node})=>{
  if(node==='discover'){
   if(artifact.reference!==`preparation/discovery/${artifact.sha256}.json`)throw Error('discovery-reference');
   return readArtifact(artifact,32768);
  }
  if(node!=='acquire')throw Error('capability-unavailable');
  const item=admission(input);
  if(artifact.sha256!==item.policy.sha256||artifact.reference!==`originals/sha256/${item.policy.sha256}.mp3`)throw Error('source-artifact-mismatch');
  if((await item.acquisition.status())?.state!=='completed')throw Error('source-receipt-unavailable');
  await item.acquisition.acquire(); // Completed-only integrity/receipt validation, never a new transfer.
  const bytes=await readArtifact(artifact,item.policy.bytes);if(bytes.length!==item.policy.bytes)throw Error('source-artifact-length');return bytes;
 }});
 return {policyId,async request(request){
  const resolved=await guide.resolveRequest(request);admission(resolved.input);
  const result=await pipeline.run({...resolved.input,modelRecipe:recipe,policyRevision});
  return {...result,consumer:resolved.consumer};
 }};
}
