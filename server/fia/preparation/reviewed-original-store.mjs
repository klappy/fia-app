import {canonicalJSONString,sha256} from './contract.mjs';
import {verifyReviewedOriginal} from './reviewed-original.mjs';
const copy=value=>structuredClone(value),encode=value=>new TextEncoder().encode(canonicalJSONString(value));
const POLICY='fia-reviewed-original-catalog-admission@1';
function scope(totalMs){
 const end=Date.now()+totalMs;let expired=false;
 return {check(){if(expired||Date.now()>=end)throw Error('reviewed-original-timeout');},async wait(fn){this.check();let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('reviewed-original-timeout'));},Math.max(1,end-Date.now()));})]);}finally{clearTimeout(timer);}}};
}
function allowed(fn,row){const result=fn(copy(row));if(result&&typeof result.then==='function')Promise.resolve(result).catch(()=>{});return result===true;}

// Stable selection owns the head; each served snapshot retains its full revision.
// Callers must bind playback to the returned served identity, never the desired text.
// All admissions and callbacks are trusted deployment configuration, never request JSON.
export async function createReviewedOriginalStore({storage,bucket,admissions,fetchAsset,readOriginal,eligibility,guard,totalMs=30000}){
 const rows=copy(admissions),fetcher=fetchAsset,original=readOriginal,eligible=eligibility,fence=guard;
 if(!Array.isArray(rows)||rows.length>1000||[fetcher,original,eligible,fence].some(fn=>typeof fn!=='function')||!storage?.transaction||!bucket||!Number.isSafeInteger(totalMs)||totalMs<1||totalMs>30000)throw Error('reviewed-original-capability');
 const approved=new Map();
 for(const row of rows){if(row.eligibility!=='eligible'||!row.accepted||row.selection.quality!=='original')continue;
  const admissionSha256=await sha256(canonicalJSONString(row)),logicalId=canonicalJSONString(Object.fromEntries(Object.entries(row.selection).filter(([key])=>key!=='presentationRevision'))),key=row.accepted.expected.resultSha256;
  if(approved.has(key))throw Error('reviewed-original-ambiguous-admission');approved.set(key,{row,admissionSha256,logicalId,headKey:`reviewed-original:head:${await sha256(logicalId)}`});
 }
 async function body(object,task,max){
  if(!object?.body)throw Error('reviewed-original-artifact-missing');const reader=object.body.getReader(),chunks=[];let size=0;
  try{for(;;){const part=await task.wait(()=>reader.read());if(part.done)break;if(!(part.value instanceof Uint8Array))throw Error('reviewed-original-artifact-bytes');size+=part.value.length;if(size>max)throw Error('reviewed-original-artifact-size');chunks.push(part.value.slice());}}
  finally{reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
 }
 function sources(row){const e=row.accepted.expected;return {preparedResult:{sha256:e.resultSha256,path:row.accepted.path},recordingLedger:{sha256:e.evidence.recordingLedgerSha256},timing:{sha256:e.evidence.timingSha256},acceptance:{sha256:e.acceptanceSha256}};}
 async function verify(entry,task,load){
  if(!allowed(eligible,entry.row))throw Error('reviewed-original-ineligible');
  const received=await task.wait(()=>original(copy(entry.row)));
  if(!(received instanceof Uint8Array)||received.length!==entry.row.source.bytes||received.length>8388608)throw Error('reviewed-original-source-integrity');
  const bytes=new Uint8Array(received);
  if(await sha256(bytes)!==entry.row.source.sha256)throw Error('reviewed-original-source-integrity');
  const artifacts={};
  for(const [role,item] of Object.entries(sources(entry.row))){const key=`reviewed-original/evidence/${item.sha256}.json`;let stored=await task.wait(()=>bucket.get(key));
   if(!stored&&load){const response=await task.wait(()=>fetcher(item.path??`/content/prepared-audio-evidence/${item.sha256}.json`));if(response.status!==200)throw Error('reviewed-original-artifact-unavailable');
    const content=await body(response,task,262144);if(await sha256(content)!==item.sha256)throw Error('reviewed-original-artifact-hash');
    await task.wait(()=>bucket.put(key,content,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}}));stored=await task.wait(()=>bucket.get(key));
   }
   artifacts[role]=await body(stored,task,262144);
  }
  const snapshot=await task.wait(()=>verifyReviewedOriginal(entry.row,artifacts));
  for(const [role,item] of Object.entries(snapshot.artifacts))item.reference=`reviewed-original/evidence/${item.sha256}.json`;
  snapshot.original={sha256:entry.row.source.sha256,bytes:bytes.length,reference:`originals/sha256/${entry.row.source.sha256}.mp3`};
  snapshot.policy=POLICY;snapshot.policySha256=await sha256(POLICY);
  task.check();if(!allowed(eligible,entry.row))throw Error('reviewed-original-ineligible');return snapshot;
 }
 function find(key){const entry=approved.get(key);if(!entry)throw Error('reviewed-original-not-admitted');return entry;}
 async function read(key,task=scope(totalMs)){const entry=find(key),head=await task.wait(()=>storage.get(entry.headKey));
  if(!head||head.schema!=='fia-reviewed-original-head@1'||head.logicalId!==entry.logicalId||!head.served)return {state:'unavailable',reason:'no-reviewed-original-snapshot',result:null};
  const served=[...approved.values()].find(item=>item.admissionSha256===head.served.admissionSha256&&item.logicalId===entry.logicalId);
  if(!served)return {state:'unavailable',reason:'reviewed-original-admission-revoked',result:null};
  const snapshot=await verify(served,task,false);if(await sha256(encode(snapshot))!==head.served.snapshotSha256)throw Error('reviewed-original-snapshot-integrity');
  await task.wait(()=>storage.transaction(async tx=>{
   const current=await tx.get(entry.headKey);
   if(canonicalJSONString(current??null)!==canonicalJSONString(head))throw Error('reviewed-original-head-changed');
   if(!allowed(eligible,entry.row)||!allowed(eligible,served.row)||await fence(tx,copy(entry.row),'read')!==true||!allowed(eligible,entry.row)||!allowed(eligible,served.row))throw Error('reviewed-original-read-refused');
   task.check();
  }));
  return {state:'ready',reason:served.admissionSha256===entry.admissionSha256?null:'retained-reviewed-original',result:snapshot.result,resultSha256:served.row.accepted.expected.resultSha256,resultSerialized:canonicalJSONString(snapshot.result),snapshot,desiredSelection:copy(entry.row.selection),servedSelection:copy(served.row.selection)};
 }
 async function demand(key){const entry=find(key),task=scope(totalMs),refreshKey=`reviewed-original:refresh:${entry.admissionSha256}`;
  const claim=await task.wait(()=>storage.transaction(async tx=>{
   if(!allowed(eligible,entry.row)||await fence(tx,copy(entry.row),'admission')!==true||!allowed(eligible,entry.row))throw Error('reviewed-original-admission-refused');task.check();
   const old=await tx.get(entry.headKey);if(old&&(old.schema!=='fia-reviewed-original-head@1'||old.logicalId!==entry.logicalId))throw Error('reviewed-original-head-corrupt');
   await tx.put(entry.headKey,{schema:'fia-reviewed-original-head@1',logicalId:entry.logicalId,desired:entry.admissionSha256,served:old?.served??null});
   const prior=await tx.get(refreshKey);
   if(prior){
    if(!['preparing','completed','blocked'].includes(prior.state)||typeof prior.attemptId!=='string'||!prior.attemptId)throw Error('reviewed-original-refresh-corrupt');
    if(prior.state!=='completed'||old?.served?.admissionSha256===entry.admissionSha256)return {owned:false,record:prior};
   }
   const record={state:'preparing',attemptId:crypto.randomUUID()};await tx.put(refreshKey,record);task.check();return {owned:true,record};
  }));
  if(claim.owned){try{const snapshot=await verify(entry,task,true),snapshotSha256=await sha256(encode(snapshot));
   await task.wait(()=>storage.transaction(async tx=>{const current=await tx.get(refreshKey),head=await tx.get(entry.headKey);
    if(current?.attemptId!==claim.record.attemptId||current.state!=='preparing'||head?.desired!==entry.admissionSha256)throw Error('reviewed-original-stale-attempt');
    if(await fence(tx,copy(entry.row),'promotion')!==true||!allowed(eligible,entry.row))throw Error('reviewed-original-promotion-refused');task.check();
    await tx.put(refreshKey,{...current,state:'completed',snapshotSha256});await tx.put(entry.headKey,{...head,served:{admissionSha256:entry.admissionSha256,snapshotSha256}});task.check();
   }));
  }catch(error){task.check();await task.wait(()=>storage.transaction(async tx=>{const current=await tx.get(refreshKey);task.check();if(current?.attemptId===claim.record.attemptId&&current.state==='preparing')await tx.put(refreshKey,{...current,state:'blocked'});}));}}
  const result=await read(key,task);return result.state==='ready'?result:{state:'blocked',reason:'reviewed-original-evidence-unavailable',result:null,resultSha256:null};
 }
 return Object.freeze({demand,read:key=>read(key)});
}
