// The server supplies the reference and owns artifact eligibility. This reader
// verifies transport bytes only; it does not interpret source or narration.
const hashPattern=/^[a-f0-9]{64}$/;
const validReference=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===2&&typeof value.id==='string'&&value.id.length>0&&typeof value.sha256==='string'&&hashPattern.test(value.sha256);
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const shape=(value,fields)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===fields.length&&fields.every(key=>Object.hasOwn(value,key));
const text=value=>typeof value==='string'&&value.length>0;
const identityFields=['packId','presentationRevision','language','edition','quality','activityId','sourceUnitId','sourceTextSha256'];
const validIdentity=value=>shape(value,identityFields)&&identityFields.every(key=>text(value[key]))&&hashPattern.test(value.presentationRevision)&&hashPattern.test(value.sourceTextSha256);
const validRange=value=>value===null||shape(value,['startSeconds','endSeconds'])&&Number.isFinite(value.startSeconds)&&value.startSeconds>=0&&Number.isFinite(value.endSeconds)&&value.endSeconds>value.startSeconds;

export function createExecutionTransport({fetch:fetchArtifact=globalThis.fetch}={}){
 async function readArtifactBytes(expected,{signal}={}){
   signal?.throwIfAborted();
   const response=await fetchArtifact(`/v1/artifacts/${expected}`,{method:'GET',cache:'no-store',redirect:'error',signal});
   signal?.throwIfAborted();
   if(response.status!==200||response.redirected)throw Error('The server artifact could not be read.');
   const bytes=await response.arrayBuffer();
   signal?.throwIfAborted();
   if(await hash(bytes)!==expected)throw Error('The server artifact could not be verified.');
   signal?.throwIfAborted();
   return bytes;
 }
 const transport={
  async readBoundArtifactBytes(reference,context={}){
   if(!validReference(reference))throw Error('The server artifact reference is invalid.');
   return readArtifactBytes(reference.sha256,context);
  },
 };
 async function readBoundJSON(reference,context){
  const bytes=await transport.readBoundArtifactBytes(reference,context);let value;
  try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch(error){if(error.name==='SyntaxError'||error.name==='TypeError')throw Error('The bound narration artifact is invalid.');throw error;}
  if(value?.id!==reference.id)throw Error('The bound narration artifact is invalid.');
  return value;
 }
 transport.playBoundAudio=async(reference,context={})=>{
  const value=await readBoundJSON(reference,context),delivery=value.delivery;
  if(!shape(value,['schema','id','delivery','playbackRange'])||value.schema!=='fia-bound-narration-audio@1'||!shape(delivery,['url','sha256','bytes','mime'])||!text(delivery.url)||typeof delivery.sha256!=='string'||!hashPattern.test(delivery.sha256)||!Number.isSafeInteger(delivery.bytes)||delivery.bytes<=0||!text(delivery.mime)||!validRange(value.playbackRange))throw Error('The bound narration audio is invalid.');
  context.signal?.throwIfAborted();
  const response=await fetchArtifact(delivery.url,{method:'GET',cache:'no-store',signal:context.signal});
  context.signal?.throwIfAborted();
  if(response.status!==200)throw Error('The bound narration audio could not be read.');
  const bytes=await response.arrayBuffer();
  context.signal?.throwIfAborted();
  if(bytes.byteLength!==delivery.bytes||await hash(bytes)!==delivery.sha256)throw Error('The bound narration audio could not be verified.');
  context.signal?.throwIfAborted();
  return{bytes,mime:delivery.mime,playbackRange:value.playbackRange};
 };
 transport.prepareOriginal=async(reference,context={})=>{
  const value=await readBoundJSON(reference,context);
  if(!shape(value,['schema','id','identity'])||value.schema!=='fia-bound-narration-demand@1'||!validIdentity(value.identity))throw Error('The bound narration demand is invalid.');
  context.signal?.throwIfAborted();
  if(typeof context.prepareNarration!=='function')throw Error('Original narration preparation is unavailable.');
  const result=await context.prepareNarration(value.identity,context);
  context.signal?.throwIfAborted();
  return result;
 };
 async function presentationStatus(url,options,expectedJobId){
  const response=await fetchArtifact(url,{cache:'no-store',redirect:'error',...options});
  options.signal?.throwIfAborted();
  if(response.redirected)throw Error('The server presentation status is invalid.');
  let value;try{value=await response.json();}catch{throw Error('The server presentation status is invalid.');}
  options.signal?.throwIfAborted();
  const statuses={ready:200,preparing:202,unavailable:404,blocked:409};
  if(!shape(value,['schema','status','jobId','reason','record'])||value.schema!=='fia-presentation-preparation@1'||!Object.hasOwn(statuses,value.status)||response.status!==statuses[value.status]||value.jobId!==null&&!(typeof value.jobId==='string'&&hashPattern.test(value.jobId))||expectedJobId&&value.jobId!==expectedJobId||value.reason!==null&&!text(value.reason))throw Error('The server presentation status is invalid.');
  if(['ready','preparing'].includes(value.status)&&value.jobId===null)throw Error('The server presentation status is invalid.');
  if(value.status==='ready'){
   const record=value.record;
   if(!record||record.status!=='ready'||typeof record.revision!=='string'||!hashPattern.test(record.revision)||record.artifact?.sha256!==record.revision||!Number.isSafeInteger(record.artifact?.bytes)||record.artifact.bytes<=0||record.execution?.schema!=='fia-executable-catalog@1')throw Error('The server presentation status is invalid.');
  }else if(value.record!==null)throw Error('The server presentation status is invalid.');
  return value;
 }
 transport.preparePresentation=async(demand,{signal}={})=>{
  if(!shape(demand,['packId','baseRevision','sourceRevision','capability'])||!text(demand.packId)||typeof demand.baseRevision!=='string'||!hashPattern.test(demand.baseRevision)||typeof demand.sourceRevision!=='string'||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(demand.sourceRevision)||demand.capability!=='executable-presentation')throw Error('The server presentation demand is invalid.');
  signal?.throwIfAborted();
  return presentationStatus('/v1/presentation-preparations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(demand),signal});
 };
 transport.readPresentationPreparation=async(jobId,{signal}={})=>{
  if(typeof jobId!=='string'||!hashPattern.test(jobId))throw Error('The server presentation job identity is invalid.');
  signal?.throwIfAborted();
  return presentationStatus(`/v1/presentation-preparations/${jobId}`,{method:'GET',signal},jobId);
 };
 transport.readPack=async(packId,{revision,signal}={})=>{
  if(!text(packId)||revision!==undefined&&(typeof revision!=='string'||!hashPattern.test(revision)))throw Error('The server catalog identity is invalid.');
  signal?.throwIfAborted();
  const response=await fetchArtifact(`/v1/packs/${encodeURIComponent(packId)}${revision?`?revision=${revision}`:''}`,{method:'GET',cache:'no-store',redirect:'error',signal});
  signal?.throwIfAborted();
  let record;try{record=await response.json();}catch{throw Error('The server catalog is invalid.');}
  signal?.throwIfAborted();
  const codes={ready:200,preparing:202,unavailable:404,refused:400};
  if(response.redirected||!record||!Object.hasOwn(codes,record.status)||response.status!==codes[record.status]||record.status==='ready'&&(record.packId!==packId||revision&&record.revision!==revision))throw Error('The server catalog is invalid.');
  if(record.status==='ready'&&response.headers.get('X-FIA-Offline-Snapshot')==='historical-verified')record.offlineSnapshot='historical-verified';
  return record;
 };
 transport.readPresentationRecord=async(record,context={})=>{
  const artifact=record?.artifact;
  if(record?.status!=='ready'||typeof record.revision!=='string'||!hashPattern.test(record.revision)||artifact?.sha256!==record.revision||!Number.isSafeInteger(artifact.bytes)||artifact.bytes<=0||artifact.mime!=='application/json')throw Error('The server presentation record is invalid.');
  const bytes=await readArtifactBytes(artifact.sha256,context);
  if(bytes.byteLength!==artifact.bytes)throw Error('The server presentation could not be verified.');
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('The server presentation is invalid.');}
 };
 return transport;
}
