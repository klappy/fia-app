import {canonicalJSONString,sha256,readPreparedAudio} from './contract.mjs';

export const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export const selectionKeys=['packId','presentationRevision','language','edition','quality'];
const requestKeys=[...selectionKeys,'activityId','sourceUnitId','sourceTextSha256'];
export function resolveSelection(input,catalog){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join()!==[...requestKeys].sort().join())return null;
  return catalog.entries.find(row=>selectionKeys.every(key=>typeof input[key]==='string'&&input[key]===row.selection[key])&&row.activities.some(activity=>['activityId','sourceUnitId','sourceTextSha256'].every(key=>input[key]===activity[key])))??null;
}
// All identity components come from the reviewed server catalog, never caller keys.
export async function operationId(row){return sha256(canonicalJSONString({schema:'fia-preparation-operation@1',selection:row.selection,identity:row.identity,scriptSha256:row.scriptSha256,unitsSha256:row.unitsSha256,source:row.source,activities:row.activities}));}
export async function indexedCatalog(catalog){return Promise.all(catalog.entries.map(async row=>({id:await operationId(row),row})));}
export async function readBounded(response,maxBytes){
  if(!response.body)return new Uint8Array();
  const reader=response.body.getReader(),chunks=[];let length=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>maxBytes)throw Error('body-too-large');chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
export async function prepareAccepted(row,fetchAsset){
  if(!row.accepted)return {state:'blocked',reason:row.blockedReason||'accepted-recording-required',result:null};
  const {path,bytes,expected}=row.accepted;
  if(!/^\/content\/prepared-audio\/[0-9a-f]{64}\.json$/.test(path)||path!==`/content/prepared-audio/${expected.resultSha256}.json`||!Number.isSafeInteger(bytes)||bytes<1||bytes>32768)throw Error('invalid-accepted-artifact');
  if(canonicalJSONString(expected.identity)!==canonicalJSONString(row.identity)||canonicalJSONString(expected.source)!==canonicalJSONString(row.source)||canonicalJSONString(expected.activities)!==canonicalJSONString(row.activities))throw Error('accepted-identity-mismatch');
  const response=await fetchAsset(path);
  if(response.status!==200)throw Error('accepted-artifact-unavailable');
  const body=await readBounded(response,32768);if(body.byteLength!==bytes)throw Error('accepted-artifact-length');
  const result=await readPreparedAudio(body,expected);
  if(new TextDecoder().decode(body)!==canonicalJSONString(result))throw Error('noncanonical-accepted-artifact');
  if(result.delivery.quality!==row.selection.quality)throw Error('delivery-quality-mismatch');
  if(result.delivery.quality==='original'){
    if(result.delivery.mime!=='audio/mpeg'||result.delivery.url!==`/v1/preparation-audio/${result.source.sha256}.mp3`||['sha256','bytes','duration'].some(key=>result.delivery[key]!==result.source[key]))throw Error('original-delivery-mismatch');
  }else if(result.delivery.quality!=='medium'||new URL(result.delivery.url).origin!=='https://transcode.klappy.dev')throw Error('unsupported-delivery-origin');
  return {state:'ready',reason:null,result,resultSha256:expected.resultSha256,resultSerialized:new TextDecoder().decode(body)};
}
