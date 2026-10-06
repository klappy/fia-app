import {canonicalJSONString,sha256} from './contract.mjs';
import {createRequestSidecars} from './executor/request-sidecars.mjs';
const same=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b);
const policy='fia-stable-original-sidecar@1';
// Borrow the reviewed store's verified snapshot; this adapter grants no new
// acceptance. It projects already accepted original mappings, without execution.
export async function projectStableOriginalSidecar({storage,bucket,outcome,readVerified,eligible,totalMs=30000}){
 if(outcome.state!=='ready')return outcome;
 if(!Number.isSafeInteger(totalMs)||totalMs<1||totalMs>30000)throw Error('stable-sidecar-budget');
 const end=Date.now()+totalMs;
 async function bounded(fn){const remaining=end-Date.now();if(remaining<=0)throw Error('stable-sidecar-timeout');let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('stable-sidecar-timeout')),remaining);})]);}finally{clearTimeout(timer);}}
 const snapshot=outcome.snapshot,snapshotSha256=await sha256(canonicalJSONString(snapshot));
 const binding={consumer:{selection:outcome.servedSelection,desiredSelection:outcome.desiredSelection},sharedRequest:{snapshotSha256},capability:'reviewed-original-mapping',contractSha256:await sha256(policy),dependencies:{snapshot:snapshotSha256,admission:snapshot.admissionSha256,source:snapshot.original.sha256,script:snapshot.scriptSha256,units:snapshot.unitsSha256,policy:snapshot.policySha256,...Object.fromEntries(Object.entries(snapshot.artifacts).map(([role,item])=>[role,item.sha256]))}};
 const evidence=[...Object.values(snapshot.artifacts).map(({reference,sha256})=>({reference,sha256})),{reference:snapshot.original.reference,sha256:snapshot.original.sha256}];
 const decision={outcome:'accept',reason:'verified-existing-original-mapping',capability:binding.capability,evidence,result:outcome.result};
 const artifacts={async read(d){
  if(d.reference!==`preparation/executor/${d.sha256}.json`)throw Error('stable-sidecar-reference');
  const object=await bounded(()=>bucket.get(d.reference));if(!object?.body)throw Error('stable-sidecar-missing');
  const reader=object.body.getReader(),chunks=[];let length=0;
  try{for(;;){const {value,done}=await bounded(()=>reader.read());if(done)break;length+=value.length;if(length>1048576)throw Error('stable-sidecar-size');chunks.push(value);}}
  finally{reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
 },async write(bytes){const digest=await sha256(bytes),reference=`preparation/executor/${digest}.json`;await bounded(()=>bucket.put(reference,bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}}));return {reference,sha256:digest};}};
 const sidecars=createRequestSidecars({storage,artifacts,resolve:()=>binding,shared:{request:async()=>outcome},eligible,project:()=>decision,validate:async value=>{
  if(!same(value.decision,decision))return false;
  // Re-read through the original verifier, including source bytes, every retained
  // evidence document, head and authority fence; a cached sidecar is not authority.
  const fresh=await readVerified();
  return fresh.state==='ready'&&same(fresh.snapshot,snapshot)&&same(fresh.servedSelection,outcome.servedSelection)&&same(fresh.desiredSelection,outcome.desiredSelection)&&same(fresh.result,outcome.result);
 }});
 const retained=await sidecars.read({});
 const projected=retained.state==='missing'?await sidecars.request({},{subscriberId:`stable-original-projection:${crypto.randomUUID()}`}):retained;
 if(projected.state!=='ready'||!same(projected.sidecar.decision.result,outcome.result))throw Error('stable-sidecar-refused');
 // Preserve the established public and internal response contracts. The durable
 // pointer is an additional verified projection, not a new playback request.
 return outcome;
}
