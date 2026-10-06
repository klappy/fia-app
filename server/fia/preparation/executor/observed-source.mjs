import {canonicalJSONString,sha256} from '../contract.mjs';
import {readBounded} from '../service.mjs';
import {readSource,storeSource,sourceKey,verifySourceReference} from '../source-store.mjs';
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fields=(value,keys)=>{if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))throw Error('invalid-acquisition-record');};
const equal=(a,b)=>{if(canonicalJSONString(a)!==canonicalJSONString(b))throw Error('acquisition-binding-mismatch');};
async function jsonObject(object){const bytes=await readBounded(new Response(object.body),32768),text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),value=JSON.parse(text);if(canonicalJSONString(value)!==text)throw Error('noncanonical-acquisition-record');return {bytes,value};}
export function createObservedSourceAdapter({bucket,fetchSource=fetch,validatePublisherURL}){
 if(typeof validatePublisherURL!=='function')throw Error('publisher-policy-required');
 return {paid:false,async run({input,nodeOutputs}){
  input=structuredClone(input);const descriptor=structuredClone(nodeOutputs?.discover);
  if(!hash(descriptor?.sha256)||descriptor.reference!==`preparation/discovery/${descriptor.sha256}.json`)throw Error('invalid-discovery-reference');
  const object=await bucket.get(descriptor.reference);if(!object)throw Error('discovery-missing');
  const {bytes:discoveryBytes,value:discovery}=await jsonObject(object);if(await sha256(discoveryBytes)!==descriptor.sha256)throw Error('discovery-corrupt');
  fields(discovery,['schema','source','selection','metadataSha256']);fields(discovery.source,['url','version','publisherId','resourceId']);fields(discovery.selection,['book','language','edition','passage','resource']);
  if(discovery.schema!=='fia-source-discovery@1'||!hash(discovery.metadataSha256))throw Error('invalid-discovery');
  equal({publisherId:discovery.source.publisherId,resourceId:discovery.source.resourceId,version:discovery.source.version},input.source);
  equal(discovery.selection,Object.fromEntries(['book','language','edition','passage','resource'].map(key=>[key,input[key]])));
  const url=new URL(discovery.source.url);
  if(url.protocol!=='https:'||url.origin!=='https://s3.amazonaws.com'||url.username||url.password||url.search||url.hash||!url.pathname.startsWith('/cbbt-er.public/pericopes/')||await validatePublisherURL(discovery.source.url,{input:structuredClone(input),discovery:structuredClone(discovery)})!==true)throw Error('publisher-url-refused');
  const receiptKey=`originals/acquisitions/${descriptor.sha256}.json`;
  async function retained(){
   const object=await bucket.get(receiptKey);if(!object)return null;
   const {value:receipt}=await jsonObject(object);fields(receipt,['schema','discoverySha256','url','sourceVersion','sourceSha256','sourceBytes','sourceKey']);
   if(receipt.schema!=='fia-observed-acquisition@1'||receipt.discoverySha256!==descriptor.sha256||receipt.url!==discovery.source.url||receipt.sourceVersion!==discovery.source.version)throw Error('acquisition-receipt-conflict');
   const source={url:receipt.url,sha256:receipt.sourceSha256,bytes:receipt.sourceBytes};if(sourceKey(source)!==receipt.sourceKey)throw Error('acquisition-receipt-conflict');
   if(await readSource(bucket,source)===null)throw Error('acquisition-source-missing');await verifySourceReference(bucket,source,receipt.sourceVersion);
   return {sha256:source.sha256,reference:receipt.sourceKey};
  }
  const warm=await retained();if(warm)return warm;
  const response=await fetchSource(discovery.source.url,{redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(response.status!==200||response.headers.get('Content-Type')?.split(';')[0].trim()!=='audio/mpeg')throw Error('publisher-response-refused');
  const body=await readBounded(response,2*1024*1024);if(!body.byteLength)throw Error('empty-source');
  const source={url:discovery.source.url,sha256:await sha256(body),bytes:body.byteLength};
  await storeSource(bucket,source,body,discovery.source.version);
  const receipt={schema:'fia-observed-acquisition@1',discoverySha256:descriptor.sha256,url:source.url,sourceVersion:discovery.source.version,sourceSha256:source.sha256,sourceBytes:source.bytes,sourceKey:sourceKey(source)};
  await bucket.put(receiptKey,new TextEncoder().encode(canonicalJSONString(receipt)),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
  const result=await retained();if(!result)throw Error('acquisition-receipt-missing');equal(result,{sha256:source.sha256,reference:sourceKey(source)});return result;
 }};
}
