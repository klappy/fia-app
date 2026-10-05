import {canonicalJSONString,sha256} from './contract.mjs';
import {readBounded} from './service.mjs';
const maxBytes=2*1024*1024;
function validate(source){
 if(!source||!Number.isSafeInteger(source.bytes)||source.bytes<1||source.bytes>maxBytes||!/^[a-f0-9]{64}$/.test(source.sha256))throw Error('invalid-source-pin');
 const url=new URL(source.url);if(url.protocol!=='https:'||url.username||url.password||url.hash)throw Error('invalid-source-url');
}
export function sourceKey(source){validate(source);return `originals/sha256/${source.sha256}.mp3`;}
async function body(object,limit){return readBounded(new Response(object.body),limit);}
async function verify(bytes,source){if(bytes.byteLength!==source.bytes||await sha256(bytes)!==source.sha256)throw Error('source-object-corrupt');return bytes;}
export async function readSource(bucket,source){
 const key=sourceKey(source),object=await bucket.get(key);if(object===null)return null;
 return verify(await body(object,source.bytes),source);
}
export async function storeSource(bucket,source,bytes,sourceVersion){
 const pinned=structuredClone(source);validate(pinned);
 if(typeof sourceVersion!=='string'||!sourceVersion.trim()||sourceVersion.length>4096)throw Error('invalid-source-version');
 if(!(bytes instanceof Uint8Array)||bytes.byteLength>maxBytes)throw Error('invalid-source-bytes');
 const copy=bytes.slice();await verify(copy,pinned);
 const key=sourceKey(pinned),reference={schema:'fia-original-source-ref@1',url:pinned.url,sourceVersion,sha256:pinned.sha256,bytes:pinned.bytes};
 const referenceBytes=new TextEncoder().encode(canonicalJSONString(reference));
 const referenceKey=`originals/refs/${await sha256(canonicalJSONString({url:pinned.url,sourceVersion}))}/${pinned.sha256}.json`;
 // Check both existing immutable objects before any mutation. Corruption never authorizes replacement.
 const existing=await readSource(bucket,pinned),prior=await bucket.get(referenceKey);
 if(prior){const stored=await body(prior,referenceBytes.byteLength);if(await sha256(stored)!==await sha256(referenceBytes))throw Error('source-reference-conflict');}
 if(existing===null){
  await bucket.put(key,copy,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'audio/mpeg'}});
  if(await readSource(bucket,pinned)===null)throw Error('source-publication-missing');
 }
 if(!prior){
  await bucket.put(referenceKey,referenceBytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
  const stored=await bucket.get(referenceKey);if(!stored)throw Error('source-reference-missing');
  if(await sha256(await body(stored,referenceBytes.byteLength))!==await sha256(referenceBytes))throw Error('source-reference-conflict');
 }
 return {key,referenceKey,sha256:pinned.sha256,bytes:pinned.bytes};
}
