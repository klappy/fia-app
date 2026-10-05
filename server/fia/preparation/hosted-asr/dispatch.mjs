import {canonicalJSONString,sha256} from '../contract.mjs';
import {PILOT_SOURCE_SHA256} from './artifact.mjs';
const copy=x=>structuredClone(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const shape=(x,keys)=>x&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
// Private trusted composition only. There is no caller-selected namespace or HTTP route.
export function createHostedDispatch({storage,ledger,identity,activation,executor,verifyArtifact,validateResult,now=Date.now,uuid=()=>crypto.randomUUID()}){
 if(!['A','B'].includes(ledger)||!storage?.transaction||typeof verifyArtifact!=='function'||typeof validateResult!=='function')throw Error('invalid-private-dispatch');
 const pinned=copy(identity),window=copy(activation),run=executor?Object.freeze({...executor}):null;
 if(!shape(pinned,['sourceSha256','sourceBytes','modelId','modelRevision','language','runtimeSha256','configSha256','modelSha256','scriptSha256'])||pinned.sourceSha256!==PILOT_SOURCE_SHA256||pinned.sourceBytes!==867865||pinned.modelId!=='Systran/faster-whisper-small'||pinned.modelRevision!=='536b0662742c02347bc0e980a01041f333bce120'||pinned.language!=='eng'||!['runtimeSha256','configSha256','modelSha256','scriptSha256'].every(k=>hash(pinned[k]))||!shape(window,['startedAt','expiresAt'])||!Number.isSafeInteger(window.startedAt)||window.expiresAt!==window.startedAt+1200000||new TextEncoder().encode(canonicalJSONString({identity:pinned,activation:window})).length>16384)throw Error('invalid-pilot-pins');
 const keyPromise=sha256(canonicalJSONString({schema:'fia-hosted-asr-node@1',identity:pinned}));
 const artifactShape=x=>shape(x,['sha256','reference'])&&hash(x.sha256)&&x.reference===`recognition/sha256/${x.sha256}.json`;
 function validRecord(row,nodeKey,lane){
  if(!row)return;
  const required=['schema','nodeKey','ledger','state','attemptId','revision','startedAt','deadline','stopAttempts'];
  const optional=['artifact','stopVerified','stopDeadline','reconciled','reason','alarmError','interrupted'];
  if(Object.getPrototypeOf(row)!==Object.prototype||required.some(k=>!Object.hasOwn(row,k))||Object.keys(row).some(k=>!required.includes(k)&&!optional.includes(k))||row.schema!=='fia-hosted-asr-attempt@1'||row.nodeKey!==nodeKey||row.ledger!==lane||!['preparing','uncertain','completed'].includes(row.state)||typeof row.attemptId!=='string'||!row.attemptId||row.attemptId.length>128||row.revision!==1||!Number.isSafeInteger(row.startedAt)||row.startedAt<window.startedAt||row.startedAt>=window.expiresAt||!Number.isSafeInteger(row.deadline)||row.deadline<=row.startedAt||row.deadline>Math.min(row.startedAt+360000,window.expiresAt)||!Number.isSafeInteger(row.stopAttempts)||row.stopAttempts<0||row.stopAttempts>3||('stopVerified'in row&&typeof row.stopVerified!=='boolean')||('stopDeadline'in row&&(!Number.isSafeInteger(row.stopDeadline)||row.stopDeadline<=row.startedAt))||(row.stopVerified===true&&(row.stopAttempts<1||!Number.isSafeInteger(row.stopDeadline)))||('alarmError'in row&&typeof row.alarmError!=='boolean')||('interrupted'in row&&(row.interrupted!==true||row.state!=='uncertain'))||('reason'in row&&(typeof row.reason!=='string'||row.reason.length>128))||('reconciled'in row&&row.reconciled!==true)||('artifact'in row&&!artifactShape(row.artifact))||row.state==='completed'&&(!artifactShape(row.artifact)||row.stopVerified!==true))throw Error('corrupt-attempt');
 }
 async function snapshot(tx,nodeKey){
  const budget=await tx.get('hosted:budget'),a=await tx.get(`hosted:A:${nodeKey}`),b=await tx.get(`hosted:B:${nodeKey}`);
  validRecord(a,nodeKey,'A');validRecord(b,nodeKey,'B');
  if(budget){if(!shape(budget,['nodeKey','activation','starts'])||budget.nodeKey!==nodeKey||canonicalJSONString(budget.activation)!==canonicalJSONString(window)||!Number.isInteger(budget.starts)||budget.starts!==Number(Boolean(a))+Number(Boolean(b))||budget.starts<1||budget.starts>2)throw Error('budget-identity-conflict');}else if(a||b)throw Error('missing-budget');
  return {budget,A:a,B:b};
 }
 const check=async artifact=>{const saved=copy(artifact);if(!artifactShape(saved))throw Error('invalid-result');const retained=await verifyArtifact(saved);if(!(retained instanceof Uint8Array))throw Error('invalid-retained-result');const bytes=retained.slice();if(bytes.length>1048576||await sha256(bytes)!==saved.sha256)throw Error('invalid-retained-result');if(await validateResult(bytes.slice(),copy(pinned))!==true)throw Error('result-provenance-mismatch');return saved;};
 async function stopAttempt(nodeKey,attempt,completion=false){
  const key=`hosted:${ledger}:${nodeKey}`;
  const row=await storage.transaction(async tx=>{const s=await snapshot(tx,nodeKey),current=s[ledger];if(!current||current.attemptId!==attempt.attemptId||current.revision!==attempt.revision)throw Error('stop-fence');if(current.stopVerified===true)return current;if(current.stopAttempts>=3)throw Error('stop-attempts-exhausted');if(completion&&(current.interrupted===true||now()>=current.deadline))throw Error('stop-fence');current.stopDeadline=completion?Math.min(current.deadline,now()+30000):now()+30000;if(completion)current.deadline=current.stopDeadline;current.stopAttempts++;await tx.put(key,current);return current;});
  if(row.stopVerified===true)return true;
  let alarmError=false;try{await storage.setAlarm(row.stopDeadline);}catch{alarmError=true;}
  let timer,stopped=false;try{stopped=await Promise.race([Promise.resolve().then(()=>run.stop(copy(row))),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),Math.max(0,row.stopDeadline-now()));})])===true;}catch{}finally{clearTimeout(timer);}
  if(now()>=row.stopDeadline)stopped=false;
  await storage.transaction(async tx=>{const s=await snapshot(tx,nodeKey),current=s[ledger];if(current?.attemptId===row.attemptId&&current.state!=='completed'){current.stopVerified=stopped;current.alarmError=alarmError;await tx.put(key,current);}});
  if(!stopped&&row.stopAttempts<3){try{await storage.setAlarm(now()+30000);}catch{await storage.transaction(async tx=>{const s=await snapshot(tx,nodeKey),current=s[ledger];if(current?.attemptId===row.attemptId){current.alarmError=true;await tx.put(key,current);}});}}
  return stopped&&!alarmError;
 }
 async function dispatch(){
  const nodeKey=await keyPromise,recordKey=`hosted:${ledger}:${nodeKey}`;
  const claim=await storage.transaction(async tx=>{
   const s=await snapshot(tx,nodeKey),old=s[ledger];if(old)return {owned:false,record:old};
   const other=s[ledger==='A'?'B':'A'];if(other&&other.state!=='completed')return {owned:false,record:{state:'blocked',reason:'singleton-unresolved'}};
   if(now()<window.startedAt||now()>=window.expiresAt)return {owned:false,record:{state:'blocked',reason:'activation-expired'}};
   if((s.budget?.starts??0)>=2)return {owned:false,record:{state:'blocked',reason:'start-budget-exhausted'}};
   if(run?.limitsEnforced!==true||typeof run.start!=='function'||typeof run.stop!=='function'||typeof storage.setAlarm!=='function')return {owned:false,record:{state:'blocked',reason:'enforced-executor-unavailable'}};
   const startedAt=now(),record={schema:'fia-hosted-asr-attempt@1',nodeKey,ledger,state:'preparing',attemptId:uuid(),revision:1,startedAt,deadline:Math.min(startedAt+360000,window.expiresAt),stopAttempts:0};validRecord(record,nodeKey,ledger);
   await tx.put('hosted:budget',{nodeKey,activation:window,starts:(s.budget?.starts??0)+1});await tx.put(recordKey,record);return {owned:true,record};
  });
  if(!claim.owned){if(claim.record.state==='completed'){try{return {...claim.record,artifact:await check(claim.record.artifact)};}catch{return {...claim.record,state:'unavailable',reason:'retained-result-invalid'};}}return claim.record;}
  const attempt=claim.record;
  try{
   await storage.setAlarm(attempt.deadline);
   const artifact=await check(await run.start({...copy(attempt),identity:copy(pinned)}));
   if(!await stopAttempt(nodeKey,attempt,true))throw Error('stop-unverified');
   return await storage.transaction(async tx=>{const s=await snapshot(tx,nodeKey),current=s[ledger];if(current.attemptId!==attempt.attemptId||current.revision!==attempt.revision||current.state!=='preparing'||now()>=current.deadline)throw Error('stale-attempt');const done={...current,state:'completed',artifact,stopVerified:true};await tx.put(recordKey,done);return done;});
  }catch{
   await storage.transaction(async tx=>{const s=await snapshot(tx,nodeKey),row=s[ledger];if(row?.attemptId===attempt.attemptId&&row.state==='preparing'){row.state='uncertain';row.reason='dispatch-or-result-unresolved';await tx.put(recordKey,row);}});
   // A failed result/start also triggers immediate bounded shutdown; no compute replay.
   try{await stopAttempt(nodeKey,attempt);}catch{}
   return (await storage.transaction(tx=>snapshot(tx,nodeKey)))[ledger];
  }
 }
 async function watchdog(){
  const nodeKey=await keyPromise,key=`hosted:${ledger}:${nodeKey}`,row=(await storage.transaction(tx=>snapshot(tx,nodeKey)))[ledger];
  if(!row||row.stopVerified===true||now()<Math.min(row.deadline,row.stopDeadline??Infinity))return row;
  try{await stopAttempt(nodeKey,row);}catch{}
  return storage.transaction(async tx=>{const s=await snapshot(tx,nodeKey),current=s[ledger];if(current?.attemptId!==row.attemptId||current.state==='completed')return current;const next={...current,state:'uncertain',reason:current.stopAttempts>=3&&current.stopVerified!==true?'stop-unresolved-manual-intervention':'deadline-expired'};await tx.put(key,next);return next;});
 }
 async function reconcile({attemptId,revision,artifact}){
  const nodeKey=await keyPromise,key=`hosted:${ledger}:${nodeKey}`;
  if(now()>=window.expiresAt)throw Error('activation-expired');
  const verified=await check(artifact),before=(await storage.transaction(tx=>snapshot(tx,nodeKey)))[ledger];
  if(!before||before.interrupted===true||before.attemptId!==attemptId||before.revision!==revision||!['preparing','uncertain'].includes(before.state)||now()>=before.deadline)throw Error('reconcile-fence');
  if(!await stopAttempt(nodeKey,before,true))throw Error('stop-unverified');
  return storage.transaction(async tx=>{const s=await snapshot(tx,nodeKey),row=s[ledger];if(!row||row.interrupted===true||row.attemptId!==attemptId||row.revision!==revision||!['preparing','uncertain'].includes(row.state)||now()>=row.deadline)throw Error('reconcile-fence');const done={...row,state:'completed',artifact:verified,reconciled:true,stopVerified:true};await tx.put(key,done);return done;});
 }
 async function status(){const nodeKey=await keyPromise;return copy((await storage.transaction(tx=>snapshot(tx,nodeKey)))[ledger]??null);}
 async function operatorStop(request){
  if(!shape(request,['attemptId','revision']))throw Error('operator-stop-fence');
  const nodeKey=await keyPromise,key=`hosted:${ledger}:${nodeKey}`;
  const row=await storage.transaction(async tx=>{const s=await snapshot(tx,nodeKey),current=s[ledger];if(!current||current.attemptId!==request.attemptId||current.revision!==request.revision||current.state==='completed')throw Error('operator-stop-fence');current.interrupted=true;current.state='uncertain';current.reason='operator-interrupted';await tx.put(key,current);return current;});
  try{await stopAttempt(nodeKey,row);}catch{}
  return status();
 }
 return {dispatch,watchdog,reconcile,status,operatorStop};
}
