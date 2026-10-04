const MAX_BYTES=1048576;
const unavailable=reason=>({status:'unavailable',reason});
export async function readStaticArtifact(item,fetchAsset){
 if(!fetchAsset)return unavailable('artifact-not-found');
 let response;
 try{response=await fetchAsset(item.staticPath);}catch{return unavailable('artifact-not-found');}
 if(response.status===404){await response.body?.cancel();return unavailable('artifact-not-found');}
 const fail=async()=>{await response.body?.cancel().catch(()=>{});return unavailable('artifact-integrity-failed');};
 if(response.status!==200||response.redirected||response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'||item.descriptor.bytes>MAX_BYTES)return fail();
 const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)!==item.descriptor.bytes))return fail();
 if(!response.body)return fail();
 const reader=response.body.getReader(),chunks=[];let total=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BYTES||total>item.descriptor.bytes){await reader.cancel();return unavailable('artifact-integrity-failed');}chunks.push(value);}}catch{await reader.cancel().catch(()=>{});return unavailable('artifact-integrity-failed');}finally{reader.releaseLock();}
 if(total!==item.descriptor.bytes)return unavailable('artifact-integrity-failed');
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(digest!==item.descriptor.sha256)return unavailable('artifact-integrity-failed');
 let content;try{content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return unavailable('artifact-integrity-failed');}
 return {artifact:structuredClone(item.descriptor),content};
}

/** Immutable storage adapter only; input validation and envelopes live in publication/read-operations. */
export function snapshotStorage(snapshot,{fetchAsset}={}){
 if(snapshot.schema!=='fia.worker-read-snapshot.v1')throw Error('invalid-read-snapshot');
 const records=new Map(),artifacts=new Map(),external=new Map();
 for(const item of snapshot.staticArtifacts||[]){if(!/^\/content\/(?:registry\.json|packs\/(?:eng|spa)\.MRK-[0-9-]+\/[a-f0-9]{64}\.json)$/.test(item.staticPath)||external.has(item.descriptor.sha256))throw Error('invalid-static-artifact');external.set(item.descriptor.sha256,Object.freeze(structuredClone(item)));}
 for(const item of snapshot.artifacts){
  if(artifacts.has(item.descriptor.sha256))throw Error('duplicate-artifact');
  artifacts.set(item.descriptor.sha256,Object.freeze(structuredClone(item)));
 }
 for(const record of snapshot.records){
  if(record.status!=='ready'||!artifacts.has(record.artifact.sha256)&&!external.has(record.artifact.sha256))throw Error('invalid-snapshot-record');
  const key=record.packId+'@'+record.revision;
  if(records.has(key))throw Error('duplicate-revision');
  records.set(key,Object.freeze(structuredClone(record)));
 }
 const current=Object.freeze({...snapshot.current});
 for(const [id,revision] of Object.entries(current))if(!records.has(id+'@'+revision))throw Error('invalid-current-pointer');
 return {
  readCatalog(packId,revision){const record=records.get(packId+'@'+(revision||current[packId]));return record?structuredClone(record):{status:'unavailable',packId,reason:revision?'revision-not-found':'not-found'};},
  findArtifact(hash){const artifact=artifacts.get(hash);return artifact?{artifact:structuredClone(artifact.descriptor),content:artifact.content}:external.has(hash)?readStaticArtifact(external.get(hash),fetchAsset):null;}
 };
}
