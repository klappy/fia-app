import test from 'node:test';import assert from 'node:assert/strict';
import {validateRawRecognition,publishRawRecognition,PILOT_SOURCE_SHA256} from '../../server/fia/preparation/hosted-asr/artifact.mjs';
import {canonicalJSONString,sha256} from '../../server/fia/preparation/contract.mjs';
const effectiveConfig={transcribeOptions:{language:'en',task:'transcribe',beam_size:5,word_timestamps:true,condition_on_previous_text:false,initial_prompt:null,prefix:null,hotwords:null,vad_filter:false},device:'cpu',computeType:'int8',cpuThreads:2,initialPrompt:null,prefix:null,hotwords:null,language:'en',modelId:'Systran/faster-whisper-small',modelRevision:'536b0662742c02347bc0e980a01041f333bce120'};
const expected={sourceSha256:PILOT_SOURCE_SHA256,sourceBytes:867865,modelSha256:'b'.repeat(64),runtimeSha256:'c'.repeat(64),scriptSha256:'d'.repeat(64),configSha256:await sha256(canonicalJSONString(effectiveConfig))};
function raw(){return {schema:'fia-hosted-raw-recognition@1',status:'candidate',source:{sha256:expected.sourceSha256,bytes:867865},modelSha256:expected.modelSha256,runtimeSha256:expected.runtimeSha256,scriptSha256:expected.scriptSha256,configSha256:expected.configSha256,effectiveConfig,decoder:{samples:16000,sampleRate:16000,sha256:'e'.repeat(64)},durationSeconds:1,text:' example',segments:[{id:0,seek:0,start:0.1,end:0.5,text:' example',tokens:[123],avg_logprob:-0.2,compression_ratio:1,no_speech_prob:0.1,temperature:0,words:[{word:' example',start:0.1,end:0.5,probability:0.8}]}],uncertainty:['Uncalibrated model estimates; not playback acceptance.']};}
const encode=x=>new TextEncoder().encode(canonicalJSONString(x));
function bucket(){const data=new Map();return {data,async get(key){const bytes=data.get(key);return bytes?{size:bytes.length,body:new Blob([bytes]).stream()}:null;},async put(key,bytes,options){assert.deepEqual(options,{onlyIf:{etagDoesNotMatch:'*'}});if(data.has(key))return null;data.set(key,bytes.slice());return {};}};}

import {createCloudflarePilot,requestPilotA,requestPilotB} from '../../server/fia/preparation/hosted-asr/cloudflare.mjs';

import {createRequire} from 'node:module';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json')),{Miniflare,convertV4MiniflareOptions}=require('miniflare'),{build}=require('esbuild');
const modulePath=fileURLToPath(new URL('../../server/fia/preparation/hosted-asr/cloudflare.mjs',import.meta.url));
const identity={...expected,modelId:'Systran/faster-whisper-small',modelRevision:'536b0662742c02347bc0e980a01041f333bce120',language:'eng'},startedAt=Date.now(),config={enabled:true,identity,activation:{startedAt,expiresAt:startedAt+1200000},image:'registry/image@sha256:'+'a'.repeat(64),enforcementSha256:'b'.repeat(64),enforcement:{offline:true}};
const worker=`import {createCloudflarePilot} from ${JSON.stringify(modulePath)};
const config=${JSON.stringify(config)},raw=${JSON.stringify(raw())};
export class Fixture {
 constructor(ctx,env){this.ctx=ctx;this.env=env;let running=false;this.starts=0;this.stops=0;this.recognitions=0;
 const container={get running(){return running;},inspect:async()=>running?{image:''}:null,start:()=>{if(env.OFFLINE)throw Error('must-not-start');running=true;this.starts++;},monitor:()=>new Promise(()=>{}),setInactivityTimeout:async()=>{},destroy:async()=>{running=false;this.stops++;},getTcpPort:()=>({fetch:async url=>{if(url.endsWith('/ready'))return Response.json({schema:'fia-asr-ready@1',modelSha256:config.identity.modelSha256,runtimeSha256:config.identity.runtimeSha256,scriptSha256:config.identity.scriptSha256,configSha256:config.identity.configSha256,guards:{schema:'fia-image-guards@1',addressSpaceBytes:4294967296,scratchPolicy:'landlock-no-filesystem-writes',scratchBytes:0,landlockAbi:3,anonymousFilesDenied:true}});this.recognitions++;if(env.RESULT_GATE)await new Promise(r=>this.releaseResult=r);return Response.json(raw);}})};
 this.pilot=createCloudflarePilot({ctx:{id:ctx.id,storage:ctx.storage,container,waitUntil(){}},env:{FIA_ORIGINALS:env.RESULTS,FIA_ASR_EXECUTOR:env.JOBS},loadActivation:async()=>{if(env.OFFLINE)throw Error('activation-disabled');return config;},readRetainedSource:async()=>{if(env.SOURCE_GATE)await new Promise(r=>this.releaseSource=r);return new Uint8Array(867865);}});
 }
 async fetch(request){const path=new URL(request.url).pathname;try{
  if(path==='/status-A')return Response.json(await this.pilot.statusA());if(path==='/status-B')return Response.json(await this.pilot.statusB());
  if(path==='/stop-A')return Response.json(await this.pilot.emergencyStopA(await request.json()));if(path==='/interrupt-B')return Response.json(await this.pilot.interruptPilotB(await request.json()));
  if(path==='/controlled-B')return Response.json(await this.pilot.pilotBForInterruption());
  if(path==='/release-source'){this.releaseSource?.();return Response.json({released:true});}if(path==='/release-result'){this.releaseResult?.();return Response.json({released:true});}
  if(path==='/counts')return Response.json({starts:this.starts,stops:this.stops,recognitions:this.recognitions,sourceWaiting:!!this.releaseSource,resultWaiting:!!this.releaseResult});
  if(path==='/budget')return Response.json(await this.ctx.storage.get('hosted:budget')??null);
  return Response.json(await this.pilot.pilotA());
 }catch(error){return Response.json({error:error.message});}}

 alarm(){return this.pilot.alarm();}
}
export default {fetch(request,env){return env.JOBS.get(env.JOBS.idFromName(new URL(request.url).searchParams.has('other')?'other':'asr-pilot-v1')).fetch(request);}};`;
const bundle=await build({stdin:{contents:worker,resolveDir:resolve('.')},bundle:true,format:'esm',platform:'browser',write:false});
function runtime(path,options={}){return new Miniflare({...convertV4MiniflareOptions({name:'operator-pilot-integration-fixture',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-01',bindings:options,durableObjects:{JOBS:{className:'Fixture',useSQLite:true,unsafeUniqueKey:'operator-pilot-integration-fixture'}},r2Buckets:['RESULTS']}),resourcePersistencePath:path});}
const call=(mf,path,body)=>mf.dispatchFetch('https://fixture.invalid'+path,body?{method:'POST',body:JSON.stringify(body)}:undefined).then(r=>r.json());
async function poll(mf,path,predicate){for(let i=0;i<100;i++){const result=await call(mf,path);if(predicate(result))return result;await new Promise(r=>setTimeout(r,5));}throw Error('poll-timeout');}
test('actual SQLite stop fences gated source read and persists interruption across restart',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'fia-operator-source-'));t.after(()=>rm(directory,{recursive:true,force:true}));let mf=runtime(directory,{SOURCE_GATE:true});try{
  const pending=call(mf,'/run');await poll(mf,'/counts',r=>r.sourceWaiting);const row=await call(mf,'/status-A'),fence={attemptId:row.attemptId,revision:row.revision};
  assert.equal((await call(mf,'/stop-A',fence)).interrupted,true);await call(mf,'/release-source');assert.equal((await pending).state,'uncertain');assert.equal((await call(mf,'/counts')).starts,0);
  await mf.dispose();mf=runtime(directory,{OFFLINE:true});assert.equal((await call(mf,'/status-A')).interrupted,true);assert.equal((await call(mf,'/run')).state,'uncertain');assert.equal((await call(mf,'/budget')).starts,1);
 }finally{await mf.dispose();}
});
test('actual SQLite controlled B readiness interruption preserves two-start budget and refuses completed A stop',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'fia-operator-ready-'));t.after(()=>rm(directory,{recursive:true,force:true}));const mf=runtime(directory);try{
  const a=await call(mf,'/run');assert.equal(a.state,'completed');await call(mf,'/controlled-B');const b=await poll(mf,'/status-B',r=>r.phase==='ready-for-interruption');
  assert.equal((await call(mf,'/stop-A',{attemptId:a.attemptId,revision:a.revision})).error,'operator-stop-fence');assert.equal((await call(mf,'/counts')).stops,1);
  const fence={attemptId:b.attemptId,revision:b.revision};assert.equal((await call(mf,'/interrupt-B',fence)).stopVerified,true);assert.equal((await call(mf,'/interrupt-B',fence)).interrupted,true);
  const counts=await call(mf,'/counts');assert.equal(counts.starts,2);assert.equal(counts.stops,2);assert.equal(counts.recognitions,1);assert.equal((await call(mf,'/budget')).starts,2);
 }finally{await mf.dispose();}
});
test('actual SQLite rejects a late response after operator fence without R2 publication',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'fia-operator-result-'));t.after(()=>rm(directory,{recursive:true,force:true}));const mf=runtime(directory,{RESULT_GATE:true});try{
  const pending=call(mf,'/run');await poll(mf,'/counts',r=>r.resultWaiting);const row=await call(mf,'/status-A');await call(mf,'/stop-A',{attemptId:row.attemptId,revision:row.revision});await call(mf,'/release-result');assert.equal((await pending).interrupted,true);
  const bucket=await mf.getR2Bucket('RESULTS');assert.equal((await bucket.list({prefix:'recognition/'})).objects.length,0);
 }finally{await mf.dispose();}
});
