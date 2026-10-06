import {canonicalJSONString,sha256} from '../contract.mjs';
import {retainedJSON} from './alignment.mjs';
import {createFreshSourceObservations} from './fresh-source-observation.mjs';
async function wait(fn,ms){let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('observed-stream-discovery-timeout')),ms);})]);}finally{clearTimeout(timer);}}
const same=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b);
/** Trusted execution-only port. Requires a durable store scoped to the logical
 * source and current synchronous eligibility; never authorizes public playback. */
export async function createObservedStreamAcquisition({storage,bucket,validatePublisherURL,eligibility,policy,fetchSource=fetch,makeStream,now}){
 const limits=structuredClone(policy),validator=validatePublisherURL,eligible=eligibility;
 if(typeof validator!=='function'||typeof eligible!=='function'||!storage?.transaction||!storage?.get||!bucket?.get||!bucket?.put)throw Error('observed-stream-capability');
 // Validate limits before any operation is admitted, even before a warm read.
 if(!limits||Object.keys(limits).sort().join()!=='maxBytes,progressMs,revision,totalMs'||typeof limits.revision!=='string'||!limits.revision||!Number.isSafeInteger(limits.maxBytes)||limits.maxBytes<1||limits.maxBytes>8388608||!Number.isSafeInteger(limits.totalMs)||limits.totalMs<1||limits.totalMs>120000||!Number.isSafeInteger(limits.progressMs)||limits.progressMs<1||limits.progressMs>15000)throw Error('observed-stream-policy');
 storage={get:storage.get.bind(storage),transaction:storage.transaction.bind(storage)};bucket={get:bucket.get.bind(bucket),put:bucket.put.bind(bucket)};
 const dependencySha256=await sha256(canonicalJSONString({schema:'fia-observed-stream-acquisition@1',policy:limits}));
 return {paid:false,dependencySha256,async run({input,nodeOutputs}){
  input=structuredClone(input);const descriptor=structuredClone(nodeOutputs?.discover);
  if(descriptor?.reference!==`preparation/discovery/${descriptor?.sha256}.json`)throw Error('observed-stream-discovery');
  const discovery=await retainedJSON(descriptor,async d=>{const deadline=Date.now()+limits.totalMs,object=await wait(()=>bucket.get(d.reference),limits.progressMs);if(!object||object.size>32768)throw Error('observed-stream-discovery');const reader=object.body.getReader(),chunks=[];let size=0;try{for(;;){const left=deadline-Date.now();if(left<=0)throw Error('observed-stream-discovery-timeout');const part=await wait(()=>reader.read(),Math.min(left,limits.progressMs));if(part.done)break;size+=part.value.length;if(size>32768)throw Error('observed-stream-discovery');chunks.push(new Uint8Array(part.value));}}finally{reader.cancel().catch(()=>{});}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return bytes;});
  if(Object.keys(discovery).sort().join()!=='metadataSha256,schema,selection,source'||!/^[a-f0-9]{64}$/.test(discovery.metadataSha256)||!discovery.source||Object.keys(discovery.source).sort().join()!=='publisherId,resourceId,url,version'||discovery.schema!=='fia-source-discovery@1'||!same(discovery.source&&{publisherId:discovery.source.publisherId,resourceId:discovery.source.resourceId,version:discovery.source.version},input.source)||!same(discovery.selection,Object.fromEntries(['book','language','edition','passage','resource'].map(k=>[k,input[k]]))))throw Error('observed-stream-binding');
  const url=new URL(discovery.source.url);
  if(url.protocol!=='https:'||url.origin!=='https://s3.amazonaws.com'||!url.pathname.startsWith('/cbbt-er.public/pericopes/')||url.username||url.password||url.search||url.hash||await validator(url.href,{input:structuredClone(input),discovery:structuredClone(discovery)})!==true)throw Error('observed-stream-publisher');
  const context={input,discovery};
  const allowed=evidence=>{try{const value=eligible({...structuredClone(context),...evidence});if(value&&typeof value.then==='function')Promise.resolve(value).catch(()=>{});return value===true;}catch{return false;}};
  if(!allowed({phase:'request',observedContent:null}))throw Error('observed-stream-ineligible');
  const checkId=descriptor.sha256,observations=createFreshSourceObservations({storage,bucket,source:{logicalId:`discovery:${descriptor.sha256}`,url:url.href,sourceVersionKind:'discovery-snapshot',sourceVersion:discovery.source.version,publisherVersion:null},policy:limits,admissions:[{checkId,sequence:1,expectedPreviousObservationSha256:null,previousSourceSha256:null}],eligibility:allowed,fetchSource,...(makeStream?{makeStream}:{}),...(now?{now}:{})});
  let current=await observations.read();
  if(current.state==='unobserved'){
   const operation=await observations.observe(checkId);
   if(operation.state!=='completed'||operation.promoted!==true)throw Error(`observed-stream-${operation.state==='preparing'?'preparing':operation.state==='uncertain'?'uncertain':'not-promoted'}`);
   current=await observations.read();
  }
  if(current.state!=='observed'||current.contentVerified!==true||!same(current.observation.binding.policy,limits)||current.observation.binding.source.url!==url.href||current.observation.binding.source.sourceVersion!==discovery.source.version)throw Error('observed-stream-receipt');
  return {sha256:current.observation.sha256,reference:current.observation.sourceKey};
 }};
}
