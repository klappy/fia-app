// The server supplies the reference and owns artifact eligibility. This reader
// verifies transport bytes only; it does not interpret source or narration.
const hashPattern=/^[a-f0-9]{64}$/;
const validReference=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===2&&typeof value.id==='string'&&value.id.length>0&&hashPattern.test(value.sha256);
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');

export function createExecutionTransport({fetch:fetchArtifact=globalThis.fetch}={}){
 return {
  async readBoundArtifactBytes(reference,{signal}={}){
   if(!validReference(reference))throw Error('The server artifact reference is invalid.');
   const expected=reference.sha256;
   signal?.throwIfAborted();
   const response=await fetchArtifact(`/v1/artifacts/${expected}`,{method:'GET',cache:'no-store',signal});
   signal?.throwIfAborted();
   if(response.status!==200)throw Error('The server artifact could not be read.');
   const bytes=await response.arrayBuffer();
   signal?.throwIfAborted();
   if(await hash(bytes)!==expected)throw Error('The server artifact could not be verified.');
   signal?.throwIfAborted();
   return bytes;
  },
 };
}
