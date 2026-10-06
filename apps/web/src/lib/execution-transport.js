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
 const transport={
  async readBoundArtifactBytes(reference,{signal}={}){
   if(!validReference(reference))throw Error('The server artifact reference is invalid.');
   const expected=reference.sha256;
   signal?.throwIfAborted();
   const response=await fetchArtifact(`/v1/artifacts/${expected}`,{method:'GET',cache:'no-store',redirect:'error',signal});
   signal?.throwIfAborted();
   if(response.status!==200||response.redirected)throw Error('The server artifact could not be read.');
   const bytes=await response.arrayBuffer();
   signal?.throwIfAborted();
   if(await hash(bytes)!==expected)throw Error('The server artifact could not be verified.');
   signal?.throwIfAborted();
   return bytes;
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
 return transport;
}
