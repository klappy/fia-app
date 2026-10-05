import {canonicalJSONString,sha256} from '../contract.mjs';
import {createHostedDispatch} from './dispatch.mjs';
import {publishRawRecognition,validateRawRecognition} from './artifact.mjs';
import {readSource} from '../source-store.mjs';
import {readBounded} from '../service.mjs';
const CONFIG_KEY='hosted:integration-config';
const sourceURL='https://s3.amazonaws.com/cbbt-er.public/pericopes/eng/mrk/p2/s1/v2/vbr0.mp3';
const copy=x=>structuredClone(x);
const readinessHashes=['modelSha256','runtimeSha256','scriptSha256','configSha256'];
const guardFields=['schema','addressSpaceBytes','scratchPolicy','scratchBytes','landlockAbi','anonymousFilesDenied'];
const exactKeys=(value,keys)=>value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
function sanitizedReadiness(body,identity){
 if(body?.schema!=='fia-asr-ready@1'||body.guards?.schema!=='fia-image-guards@1'||body.guards.addressSpaceBytes!==4294967296||body.guards.scratchPolicy!=='landlock-no-filesystem-writes'||body.guards.scratchBytes!==0||!Number.isSafeInteger(body.guards.landlockAbi)||body.guards.landlockAbi<3||body.guards.anonymousFilesDenied!==true||readinessHashes.some(key=>body[key]!==identity[key]))throw Error('ready-identity-mismatch');
 return {identity:Object.fromEntries(readinessHashes.map(key=>[key,body[key]])),guards:Object.fromEntries(guardFields.map(key=>[key,body.guards[key]]))};
}

async function bounded(operation,milliseconds,label){let timer;try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),Math.max(1,milliseconds));})]);}finally{clearTimeout(timer);}}
export function createCloudflarePilot({ctx,env,loadActivation,now=Date.now,readRetainedSource=readSource}){
 const storage=ctx.storage,container=ctx.container,bucket=env.FIA_ORIGINALS;
 if(!storage?.transaction||typeof loadActivation!=='function')throw Error('private-pilot-bindings');
 function assertSingleton(){if(!ctx.id||!env.FIA_ASR_EXECUTOR||ctx.id.toString()!==env.FIA_ASR_EXECUTOR.idFromName('asr-pilot-v1').toString())throw Error('private-pilot-identity');}
 async function stored(){const row=await storage.get(CONFIG_KEY);if(!row)return null;if(await sha256(canonicalJSONString(row.config))!==row.sha256)throw Error('integration-config-corrupt');return row.config;}
 async function configuration(){
  let config;try{config=copy(await loadActivation(env));}catch(error){const prior=await stored();if(!prior)throw error;return {...prior,enabled:false};}
  if(config.enabled!==true)throw Error('activation-disabled');
  const serial=canonicalJSONString(config),digest=await sha256(serial);
  await storage.transaction(async tx=>{const prior=await tx.get(CONFIG_KEY);if(prior&&prior.sha256!==digest)throw Error('integration-config-conflict');if(!prior)await tx.put(CONFIG_KEY,{config,sha256:digest});});
  return config;
 }
 async function schedule(tx){const deadlines=await Promise.all(['A','B'].map(lane=>tx.get(`hosted:alarm:${lane}`)));const finite=deadlines.filter(Number.isSafeInteger);if(finite.length)await storage.setAlarm(Math.min(...finite));else await storage.deleteAlarm();}
 function laneStorage(lane){return {transaction:fn=>storage.transaction(fn),get:key=>storage.get(key),setAlarm:deadline=>storage.transaction(async tx=>{await tx.put(`hosted:alarm:${lane}`,deadline);await schedule(tx);})};}
 async function clearLane(lane){await storage.transaction(async tx=>{await tx.delete(`hosted:alarm:${lane}`);await schedule(tx);});}
 async function stop(){if(!container)return false;try{return await bounded(async()=>{await container.destroy();return await container.inspect()===null&&container.running===false;},25000,'container-stop-timeout');}catch{return false;}}
 async function artifactBytes(artifact){if(!bucket)throw Error('artifact-bucket-unavailable');const object=await bucket.get(artifact.reference);if(!object)throw Error('artifact-missing');return readBounded(new Response(object.body),1048576);}
 function service(config,lane){
  async function fenced(attempt,action,phase,readiness){return storage.transaction(async tx=>{
   const key=`hosted:${lane}:${attempt.nodeKey}`;
   const assertLive=row=>{if(!row||row.attemptId!==attempt.attemptId||row.revision!==attempt.revision||row.state!=='preparing'||row.interrupted===true||now()>=row.deadline)throw Error('execution-fence');};
   assertLive(await tx.get(key));
   if(phase)await tx.put(`hosted:phase:${lane}`,{nodeKey:attempt.nodeKey,attemptId:attempt.attemptId,revision:attempt.revision,phase,at:now()});
   if(readiness){const prior=await tx.get(`hosted:readiness:${lane}`);if(prior&&canonicalJSONString(prior)!==canonicalJSONString(readiness))throw Error('readiness-receipt-conflict');await tx.put(`hosted:readiness:${lane}`,readiness);}
   assertLive(await tx.get(key));
   /* No await between this final durable check and starting the side effect. */return {value:action()};
  });}


  const executor={limitsEnforced:config.enabled===true&&!!container&&!!bucket,start:async attempt=>{
   const bytes=await bounded(()=>readRetainedSource(bucket,{url:sourceURL,sha256:config.identity.sourceSha256,bytes:config.identity.sourceBytes}),Math.min(10000,attempt.deadline-now()),'retained-source-timeout');if(!bytes)throw Error('retained-source-missing');
   if(container.running||await container.inspect()!==null)throw Error('unexpected-running-container');
   if(now()>=attempt.deadline)throw Error('attempt-expired');
   // Default scheduling: the reviewed deployment pins image/standard-3; no dynamic image or instance selection.
   await fenced(attempt,()=>container.start({enableInternet:false,env:{FIA_ASR_ABSOLUTE_DEADLINE_MS:String(attempt.deadline)}}),'starting');
   ctx.waitUntil?.(container.monitor().catch(()=>{}));
   await bounded(()=>container.setInactivityTimeout(30000),Math.min(5000,attempt.deadline-now()),'inactivity-timeout');
   const port=container.getTcpPort(8080),readyDeadline=Math.min(attempt.startedAt+60000,attempt.deadline);
   let ready=false,readyEvidence;
   while(now()<readyDeadline){
    await fenced(attempt,()=>undefined);
    try{const response=await bounded(()=>port.fetch('http://container/ready',{signal:AbortSignal.timeout(Math.max(1,Math.min(1000,readyDeadline-now())))}),Math.min(1000,readyDeadline-now()),'ready-request-timeout');if(response.status===200){const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bounded(()=>readBounded(response,16384),Math.max(1,readyDeadline-now()),'ready-body-timeout')));readyEvidence=sanitizedReadiness(body,config.identity);ready=true;break;}}catch(error){if(error.message==='ready-identity-mismatch')throw error;}
    await new Promise(resolve=>setTimeout(resolve,Math.min(100,Math.max(1,readyDeadline-now()))));
   }
   if(!ready)throw Error('readiness-expired');
   const readinessReceipt={schema:'fia-hosted-readiness-receipt@1',status:'response-verified',evidenceClass:'container-readiness-report',ledger:lane,nodeKey:attempt.nodeKey,attemptId:attempt.attemptId,revision:attempt.revision,phase:'ready',observedAt:now(),...readyEvidence};
   const readiness={sha256:await sha256(canonicalJSONString(readinessReceipt)),receipt:readinessReceipt};
   await fenced(attempt,()=>undefined,'ready',readiness);
   if(lane==='B'&&await storage.get('hosted:controlled-B')===true){
    await fenced(attempt,()=>undefined,'ready-for-interruption');
    while(now()<attempt.deadline){await new Promise(resolve=>setTimeout(resolve,100));await fenced(attempt,()=>undefined);}
    throw Error('controlled-interruption-deadline');
   }
   const requestDeadline=Math.min(now()+300000,attempt.deadline),remaining=Math.max(1,requestDeadline-now());
   const request=await fenced(attempt,()=>port.fetch('http://container/recognize',{method:'POST',headers:{'Content-Type':'audio/mpeg','X-Fia-Attempt-Id':attempt.attemptId,'X-Fia-Deadline-Ms':String(attempt.deadline),'X-Fia-Ledger':lane,'X-Fia-Node-Key':attempt.nodeKey,'X-Fia-Revision':String(attempt.revision)},body:bytes,signal:AbortSignal.timeout(remaining)}),'recognizing');
   const response=await bounded(()=>request.value,remaining,'recognition-expired');
   if(response.status!==200||response.headers.get('content-type')?.split(';')[0]!=='application/json')throw Error('recognition-response');
   const raw=await bounded(()=>readBounded(response,1048576),Math.max(1,requestDeadline-now()),'recognition-body-expired');
   await fenced(attempt,()=>undefined,'publishing');
   const guardedBucket={get:key=>bucket.get(key),put:async(...args)=>(await fenced(attempt,()=>bucket.put(...args))).value};
   return bounded(()=>publishRawRecognition({bucket:guardedBucket,bytes:raw,expected:config.identity,nodeKey:attempt.nodeKey,ledger:lane,attemptId:attempt.attemptId,revision:attempt.revision}),Math.max(1,attempt.deadline-now()),'result-publication-expired');
  },stop};
  return createHostedDispatch({storage:laneStorage(lane),ledger:lane,identity:config.identity,activation:config.activation,executor,verifyArtifact:artifactBytes,validateResult:validateRawRecognition,now});
 }
 async function run(lane){assertSingleton();const config=await configuration(),result=await service(config,lane).dispatch();if(result.stopVerified===true)await clearLane(lane);return result;}
 async function reconcile(lane,receipt){assertSingleton();const config=await configuration(),result=await service(config,lane).reconcile(receipt);if(result.stopVerified===true)await clearLane(lane);return result;}
 async function controlService(lane){assertSingleton();const config=await stored();if(!config)throw Error('operator-config-missing');return service({...config,enabled:false},lane);}
 async function readinessStatus(lane,row){
  const saved=await storage.get(`hosted:readiness:${lane}`);if(!saved)return {readiness:null,readinessEvidence:'missing'};
  try{
   const receipt=saved.receipt;
   if(!exactKeys(saved,['sha256','receipt'])||!exactKeys(receipt,['schema','status','evidenceClass','ledger','nodeKey','attemptId','revision','phase','observedAt','identity','guards'])||new TextEncoder().encode(canonicalJSONString(saved)).length>2048||receipt.schema!=='fia-hosted-readiness-receipt@1'||receipt.status!=='response-verified'||receipt.evidenceClass!=='container-readiness-report'||receipt.ledger!==lane||receipt.nodeKey!==row.nodeKey||receipt.attemptId!==row.attemptId||receipt.revision!==row.revision||receipt.phase!=='ready'||!Number.isSafeInteger(receipt.observedAt)||receipt.observedAt<row.startedAt||receipt.observedAt>row.deadline||!exactKeys(receipt.identity,readinessHashes)||!exactKeys(receipt.guards,guardFields)||await sha256(canonicalJSONString(receipt))!==saved.sha256)throw Error('invalid-readiness-receipt');
   const config=await stored();sanitizedReadiness({schema:'fia-asr-ready@1',...receipt.identity,guards:receipt.guards},config.identity);
   return {readiness:copy(saved),readinessEvidence:'response-verified'};
  }catch{return {readiness:null,readinessEvidence:'invalid'};}
 }
 async function status(lane){const row=await(await controlService(lane)).status();if(!row)return null;const phase=await storage.get(`hosted:phase:${lane}`);return {...row,phase:phase&&phase.nodeKey===row.nodeKey&&phase.attemptId===row.attemptId&&phase.revision===row.revision?phase.phase:null,...await readinessStatus(lane,row)};}

 async function operatorStop(lane,request,controlled=false){
  const control=await controlService(lane);
  if(controlled){const phase=await storage.get('hosted:phase:B');if(!phase||phase.phase!=='ready-for-interruption'||phase.attemptId!==request?.attemptId||phase.revision!==request?.revision)throw Error('pilot-B-interruption-stage');}
  const result=await control.operatorStop(request);if(result.stopVerified===true)await clearLane(lane);return result;
 }
 async function controlledB(){
  assertSingleton();await configuration();
  await storage.transaction(async tx=>{const budget=await tx.get('hosted:budget');if(budget&&await tx.get(`hosted:B:${budget.nodeKey}`))throw Error('pilot-B-already-claimed');await tx.put('hosted:controlled-B',true);});
  const operation=run('B');ctx.waitUntil?.(operation.catch(()=>{}));
  // Return only after the durable claim exists; status exposes the later readiness stage.
  for(let i=0;i<100;i++){const row=await status('B');if(row)return row;await new Promise(resolve=>setTimeout(resolve,10));}
  throw Error('pilot-B-claim-pending');
 }
 async function alarm(){
  let fallback;
  async function emergencyStop(reason){
   if(fallback)return fallback;
   const stopped=await stop();fallback={state:'uncertain',reason,stopVerified:stopped};
   const previous=await storage.get('hosted:cleanup-fallback'),attempts=Number.isSafeInteger(previous?.attempts)?previous.attempts+1:1;
   await storage.put('hosted:cleanup-fallback',{...fallback,attempts,at:now()});
   if(!stopped&&attempts<3)await storage.setAlarm(now()+30000);
   return fallback;
  }
  let config;try{config=await stored();}catch{return emergencyStop('integration-config-corrupt');}
  if(!config)return emergencyStop('integration-config-missing');
  // Cleanup remains possible despite disabled activation or corrupt budget/attempt rows.
  const results=[];for(const lane of ['A','B']){
   try{const result=await service({...config,enabled:false},lane).watchdog();results.push(result);if(!result||result.stopVerified===true||result.stopAttempts>=3)await clearLane(lane);}
   catch{results.push(await emergencyStop('dispatch-state-corrupt'));}
  }
  if(fallback&&!fallback.stopVerified){const record=await storage.get('hosted:cleanup-fallback');if(record.attempts<3)await storage.setAlarm(now()+30000);}
  return results;
 }
 return {pilotA:()=>run('A'),pilotB:()=>run('B'),pilotBForInterruption:controlledB,statusA:()=>status('A'),statusB:()=>status('B'),emergencyStopA:request=>operatorStop('A',request),emergencyStopB:request=>operatorStop('B',request),interruptPilotB:request=>operatorStop('B',request,true),reconcileA:receipt=>reconcile('A',receipt),reconcileB:receipt=>reconcile('B',receipt),alarm,fetch:()=>new Response('Not Found',{status:404})};
}
export const requestPilotA=binding=>binding.get(binding.idFromName('asr-pilot-v1')).pilotA();
export const requestPilotB=binding=>binding.get(binding.idFromName('asr-pilot-v1')).pilotB();
