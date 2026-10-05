import {canonicalJSONString,sha256} from '../contract.mjs';
import {createHostedDispatch} from './dispatch.mjs';
import {publishRawRecognition,validateRawRecognition} from './artifact.mjs';
import {readSource} from '../source-store.mjs';
import {readBounded} from '../service.mjs';
const CONFIG_KEY='hosted:integration-config';
const sourceURL='https://s3.amazonaws.com/cbbt-er.public/pericopes/eng/mrk/p2/s1/v2/vbr0.mp3';
const copy=x=>structuredClone(x);
async function bounded(operation,milliseconds,label){let timer;try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),Math.max(1,milliseconds));})]);}finally{clearTimeout(timer);}}
export function createCloudflarePilot({ctx,env,loadActivation,now=Date.now,readRetainedSource=readSource}){
 const storage=ctx.storage,container=ctx.container,bucket=env.FIA_ASR_ARTIFACTS;
 if(!storage?.transaction||typeof loadActivation!=='function')throw Error('private-pilot-bindings');
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
  const executor={limitsEnforced:config.enabled===true&&!!container&&!!bucket,start:async attempt=>{
   const bytes=await bounded(()=>readRetainedSource(bucket,{url:sourceURL,sha256:config.identity.sourceSha256,bytes:config.identity.sourceBytes}),Math.min(10000,attempt.deadline-now()),'retained-source-timeout');if(!bytes)throw Error('retained-source-missing');
   if(container.running||await container.inspect()!==null)throw Error('unexpected-running-container');
   if(now()>=attempt.deadline)throw Error('attempt-expired');
   // Default scheduling: the reviewed deployment pins image/standard-3; no dynamic image or instance selection.
   container.start({enableInternet:false,env:{FIA_ASR_ABSOLUTE_DEADLINE_MS:String(attempt.deadline)}});
   ctx.waitUntil?.(container.monitor().catch(()=>{}));
   await bounded(()=>container.setInactivityTimeout(30000),Math.min(5000,attempt.deadline-now()),'inactivity-timeout');
   const port=container.getTcpPort(8080),readyDeadline=Math.min(attempt.startedAt+60000,attempt.deadline);
   let ready=false;
   while(now()<readyDeadline){
    try{const response=await bounded(()=>port.fetch('http://container/ready',{signal:AbortSignal.timeout(Math.max(1,Math.min(1000,readyDeadline-now())))}),Math.min(1000,readyDeadline-now()),'ready-request-timeout');if(response.status===200){const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bounded(()=>readBounded(response,16384),Math.max(1,readyDeadline-now()),'ready-body-timeout')));if(body.schema!=='fia-asr-ready@1'||['modelSha256','runtimeSha256','scriptSha256','configSha256'].some(k=>body[k]!==config.identity[k]))throw Error('ready-identity-mismatch');ready=true;break;}}catch(error){if(error.message==='ready-identity-mismatch')throw error;}
    await new Promise(resolve=>setTimeout(resolve,Math.min(100,Math.max(1,readyDeadline-now()))));
   }
   if(!ready)throw Error('readiness-expired');
   const requestDeadline=Math.min(now()+300000,attempt.deadline),remaining=Math.max(1,requestDeadline-now());
   const response=await bounded(()=>port.fetch('http://container/recognize',{method:'POST',headers:{'Content-Type':'audio/mpeg','X-Fia-Attempt-Id':attempt.attemptId,'X-Fia-Deadline-Ms':String(attempt.deadline),'X-Fia-Ledger':lane,'X-Fia-Node-Key':attempt.nodeKey,'X-Fia-Revision':String(attempt.revision)},body:bytes,signal:AbortSignal.timeout(remaining)}),remaining,'recognition-expired');
   if(response.status!==200||response.headers.get('content-type')?.split(';')[0]!=='application/json')throw Error('recognition-response');
   const raw=await bounded(()=>readBounded(response,1048576),Math.max(1,requestDeadline-now()),'recognition-body-expired');
   return bounded(()=>publishRawRecognition({bucket,bytes:raw,expected:config.identity,nodeKey:attempt.nodeKey,ledger:lane,attemptId:attempt.attemptId,revision:attempt.revision}),Math.max(1,attempt.deadline-now()),'result-publication-expired');
  },stop};
  return createHostedDispatch({storage:laneStorage(lane),ledger:lane,identity:config.identity,activation:config.activation,executor,verifyArtifact:artifactBytes,validateResult:validateRawRecognition,now});
 }
 async function run(lane){const config=await configuration(),result=await service(config,lane).dispatch();if(result.stopVerified===true)await clearLane(lane);return result;}
 async function reconcile(lane,receipt){const config=await configuration(),result=await service(config,lane).reconcile(receipt);if(result.stopVerified===true)await clearLane(lane);return result;}
 async function alarm(){
  let config;try{config=await stored();}catch{await stop();throw Error('integration-config-corrupt');}
  if(!config){await stop();return;}
  // Captured configuration is cleanup evidence only; disabled or expired env never disables shutdown.
  const results=[];for(const lane of ['A','B']){const result=await service({...config,enabled:false},lane).watchdog();results.push(result);if(!result||result.stopVerified===true||result.stopAttempts>=3)await clearLane(lane);}
  return results;
 }
 return {pilotA:()=>run('A'),pilotB:()=>run('B'),reconcileA:receipt=>reconcile('A',receipt),reconcileB:receipt=>reconcile('B',receipt),alarm,fetch:()=>new Response('Not Found',{status:404})};
}
export const requestPilotA=binding=>binding.get(binding.idFromName('asr-pilot-v1')).pilotA();
export const requestPilotB=binding=>binding.get(binding.idFromName('asr-pilot-v1')).pilotB();
