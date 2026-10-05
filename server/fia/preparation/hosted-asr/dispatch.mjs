import {canonicalJSONString,sha256} from '../contract.mjs';
const copy=x=>structuredClone(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
// Private pilot only. A/B are trusted constructor settings, never request input.
export function createHostedDispatch({storage,ledger,identity,activation,executor,verifyArtifact,validateResult,now=Date.now,uuid=()=>crypto.randomUUID()}){
 if(!['A','B'].includes(ledger)||!storage?.transaction||typeof verifyArtifact!=='function'||typeof validateResult!=='function')throw Error('invalid-private-dispatch');
 const pinned=copy(identity),window=copy(activation);
 if(!hash(pinned.sourceSha256)||!hash(pinned.configSha256)||!hash(pinned.modelSha256)||!hash(pinned.scriptSha256)||!Number.isSafeInteger(window.startedAt)||window.expiresAt!==window.startedAt+1200000)throw Error('invalid-pilot-pins');
 canonicalJSONString(pinned);
 const keyPromise=sha256(canonicalJSONString({schema:'fia-hosted-asr-node@1',identity:pinned}));
 const check=async artifact=>{const saved=copy(artifact);if(!hash(saved?.sha256)||saved.reference!==`recognition/sha256/${saved.sha256}.json`)throw Error('invalid-result');const bytes=await verifyArtifact(saved);if(!(bytes instanceof Uint8Array)||bytes.length>1048576||await sha256(bytes)!==saved.sha256)throw Error('invalid-retained-result');if(await validateResult(bytes.slice(),copy(pinned))!==true)throw Error('result-provenance-mismatch');return saved;};
 async function transact(fn){return storage.transaction(fn);}
 async function dispatch(){
  const nodeKey=await keyPromise,recordKey=`hosted:${ledger}:${nodeKey}`;
  const claim=await transact(async tx=>{
   const budget=await tx.get('hosted:budget');
   if(budget&&(budget.nodeKey!==nodeKey||canonicalJSONString(budget.activation)!==canonicalJSONString(window)||!Number.isInteger(budget.starts)||budget.starts<0||budget.starts>2))throw Error('budget-identity-conflict');
   const other=await tx.get(`hosted:${ledger==='A'?'B':'A'}:${nodeKey}`);
   if(other&&['preparing','uncertain'].includes(other.state))return {owned:false,record:{state:'blocked',reason:'singleton-unresolved'}};
   const old=await tx.get(recordKey);
   if(old)return {owned:false,record:old};
   if(now()<window.startedAt||now()>=window.expiresAt)return {owned:false,record:{state:'blocked',reason:'activation-expired'}};
   if((budget?.starts??0)>=2)return {owned:false,record:{state:'blocked',reason:'start-budget-exhausted'}};
   // A deployment must establish real enforcement, not environment variable assertions.
   if(executor?.limitsEnforced!==true||typeof executor.start!=='function'||typeof executor.stop!=='function')return {owned:false,record:{state:'blocked',reason:'enforced-executor-unavailable'}};
   const record={schema:'fia-hosted-asr-attempt@1',nodeKey,ledger,state:'preparing',attemptId:uuid(),revision:1,startedAt:now(),deadline:Math.min(now()+360000,window.expiresAt)};
   await tx.put('hosted:budget',{nodeKey,activation:window,starts:(budget?.starts??0)+1});await tx.put(recordKey,record);
   return {owned:true,record};
  });
  if(!claim.owned){if(claim.record.state==='completed'){try{return {...claim.record,artifact:await check(claim.record.artifact)};}catch{return {...claim.record,state:'unavailable',reason:'retained-result-invalid'};}}return claim.record;}
  const attempt=claim.record;
  try{
   // Persisted absolute alarm precedes infrastructure dispatch. Failure consumes debit.
   if(typeof storage.setAlarm!=='function')throw Error('durable-alarm-unavailable');
   await storage.setAlarm(attempt.deadline);
   const artifact=await check(await executor.start({...copy(attempt),identity:copy(pinned)}));
   return await transact(async tx=>{const current=await tx.get(recordKey);if(current.attemptId!==attempt.attemptId||current.revision!==attempt.revision||current.state!=='preparing'||now()>=attempt.deadline)throw Error('stale-attempt');const done={...current,state:'completed',artifact};await tx.put(recordKey,done);return done;});
  }catch(error){await transact(async tx=>{const row=await tx.get(recordKey);if(row?.attemptId===attempt.attemptId&&row.state==='preparing'){row.state='uncertain';row.reason='dispatch-or-result-unresolved';await tx.put(recordKey,row);}});return {...attempt,state:'uncertain',reason:'dispatch-or-result-unresolved'};}
 }
 async function watchdog(){
  const nodeKey=await keyPromise,key=`hosted:${ledger}:${nodeKey}`,row=await storage.get(key);
  if(!row||row.state==='completed'||now()<row.deadline)return row;
  // No new attempt is authorized, including when stop itself cannot be confirmed.
  let stopped=false;try{stopped=await executor.stop(copy(row))===true;}catch{}
  return transact(async tx=>{const current=await tx.get(key);if(current?.attemptId!==row.attemptId)return current;const next={...current,state:'uncertain',reason:'deadline-expired',stopVerified:stopped};await tx.put(key,next);return next;});
 }
 async function reconcile({attemptId,revision,artifact}){
  const nodeKey=await keyPromise,key=`hosted:${ledger}:${nodeKey}`;
  if(now()>=window.expiresAt)throw Error('activation-expired');
  const verified=await check(artifact);
  return transact(async tx=>{const row=await tx.get(key);if(!row||row.attemptId!==attemptId||row.revision!==revision||!['preparing','uncertain'].includes(row.state)||now()>=row.deadline)throw Error('reconcile-fence');const done={...row,state:'completed',artifact:verified,reconciled:true};await tx.put(key,done);return done;});
 }
 return {dispatch,watchdog,reconcile};
}
