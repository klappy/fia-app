import {canonicalJSONString,sha256} from '../contract.mjs';
import {createGuideDiscoveryAdapter} from './discovery.mjs';
import {createKnownSourceAcquisition} from './known-source-stream.mjs';
import {createPipeline} from './pipeline.mjs';

// Trusted composition boundary. No public route or recognition capability is installed.
export async function createRequestAcquisition({metadataBytes,metadataSha256,knownSources,bucket,storage,modelRecipe,policyRevision,fetchSource,makeStream,artifactReadMs=30000}){
 if(!(metadataBytes instanceof Uint8Array)||metadataBytes.byteLength>2*1024*1024)throw Error('guide-metadata-identity');
 const pins=structuredClone(knownSources),recipe=structuredClone(modelRecipe);
 if(!Number.isSafeInteger(artifactReadMs)||artifactReadMs<1||artifactReadMs>30000)throw Error('invalid-artifact-deadline');
 metadataBytes=new Uint8Array(metadataBytes);
 if(!Array.isArray(pins)||!pins.length)throw Error('known-source-policy-required');
 const guide=await createGuideDiscoveryAdapter({metadataBytes,metadataSha256,bucket});
 const rows=JSON.parse(new TextDecoder().decode(metadataBytes)).rows;
 const sourceId=input=>canonicalJSONString(input.source);
 const admitted=new Map();
 for(const item of pins){
  if(!item||Object.keys(item).sort().join()!=='policy,source'||Object.keys(item.source||{}).sort().join()!=='publisherId,resourceId,version'||Object.values(item.source).some(v=>typeof v!=='string'||!v))throw Error('invalid-source-admission');
  if(item.policy?.sourceVersion!==item.source.version)throw Error('source-version-mismatch');
  const key=canonicalJSONString(item.source);if(admitted.has(key))throw Error('ambiguous-source-admission');
  const acquisition=createKnownSourceAcquisition({bucket,storage,policy:item.policy,...(fetchSource?{fetchSource}:{}),...(makeStream?{makeStream}:{})});
  admitted.set(key,{policy:item.policy,acquisition});
 }

 function admission(input){const item=admitted.get(sourceId(input));if(!item)throw Error('source-not-admitted');return item;}
 async function readArtifact(artifact,limit){
  const deadline=Date.now()+artifactReadMs;let reader;
  async function bounded(fn){let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('artifact-read-timeout')),Math.max(0,deadline-Date.now()));})]);}finally{clearTimeout(timer);}}
  try{
   const object=await bounded(()=>bucket.get(artifact.reference));if(!object)throw Error('retained-artifact-missing');
   reader=object.body.getReader();const chunks=[];let size=0;
   for(;;){const {value,done}=await bounded(()=>reader.read());if(done)break;size+=value.byteLength;if(size>limit)throw Error('artifact-size-limit');chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
   if(await sha256(bytes)!==artifact.sha256)throw Error('retained-artifact-corrupt');return bytes;
  }finally{reader?.cancel().catch(()=>{});}
 }
 async function selectedPipeline(input){
  const selected=rows.find(row=>row.packId===input.packId&&row.presentationRevision===input.source.version&&row.stepId===input.resource);
  if(!selected)throw Error('guide-selection-unresolved');
  const selectedBytes=new TextEncoder().encode(canonicalJSONString({schema:'fia-published-guide-sources@1',rows:[selected]}));
  const selectedHash=await sha256(selectedBytes);
  const selectedGuide=await createGuideDiscoveryAdapter({metadataBytes:selectedBytes,metadataSha256:selectedHash,bucket});
  const policyId=await sha256(canonicalJSONString({schema:'fia-request-acquisition@1',selectedHash,source:input.source,pin:admission(input).policy,recipe,policyRevision}));
 const acquire={paid:false,async run({input,nodeOutputs}){
  const item=admission(input),descriptor=nodeOutputs.discover;
  if(descriptor?.reference!==`preparation/discovery/${descriptor?.sha256}.json`)throw Error('discovery-reference');
  const discovery=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readArtifact(descriptor,32768)));
  if(await selectedGuide.validatePublisherURL(item.policy.url,{input,discovery})!==true)throw Error('source-discovery-mismatch');
  const result=await item.acquisition.acquire();if(result.state!=='completed')throw Error('source-acquisition-unresolved');
  return result.artifact;
 }};
 const pipeline=createPipeline({storage,policyId,allowPaid:false,adapters:{discover:selectedGuide.adapter,acquire},verifyArtifact:async(artifact,{input,node})=>{
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
 return pipeline;
 }
 return {async request(request){
  const resolved=await guide.resolveRequest(request);admission(resolved.input);
  const pipeline=await selectedPipeline(resolved.input);
  const result=await pipeline.run({...resolved.input,modelRecipe:recipe,policyRevision});
  return {...result,consumer:resolved.consumer};
 }};
}
