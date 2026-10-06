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
const worker=`import {canonicalJSONString,sha256} from ${JSON.stringify(fileURLToPath(new URL('../../server/fia/preparation/contract.mjs',import.meta.url)))};import {createCloudflarePilot} from ${JSON.stringify(modulePath)};
const config=${JSON.stringify(config)},raw=${JSON.stringify(raw())};
export class Fixture {
 constructor(ctx,env){this.ctx=ctx;this.env=env;let running=false;this.starts=0;this.stops=0;this.recognitions=0;
 const container={get running(){return running;},inspect:async()=>running?{image:''}:null,start:()=>{if(env.OFFLINE)throw Error('must-not-start');running=true;this.starts++;},monitor:()=>new Promise(()=>{}),setInactivityTimeout:async()=>{},destroy:async()=>{running=false;this.stops++;},getTcpPort:()=>({fetch:async url=>{if(url.endsWith('/ready')){if(env.READY_GATE)await new Promise(r=>this.releaseReady=r);return Response.json({privateAccount:'must-not-retain',rawTranscript:'must-not-retain',schema:'fia-asr-ready@1',modelSha256:env.READY_MISMATCH?'f'.repeat(64):config.identity.modelSha256,runtimeSha256:config.identity.runtimeSha256,scriptSha256:config.identity.scriptSha256,configSha256:config.identity.configSha256,guards:{schema:'fia-image-guards@1',addressSpaceBytes:4294967296,scratchPolicy:'landlock-no-filesystem-writes',scratchBytes:0,landlockAbi:env.GUARD_MISMATCH?0:3,anonymousFilesDenied:true}});}this.recognitions++;if(env.RESULT_GATE)await new Promise(r=>this.releaseResult=r);return Response.json(raw);}})};
 this.pilot=createCloudflarePilot({ctx:{id:ctx.id,storage:ctx.storage,container,waitUntil(){}},env:{FIA_ORIGINALS:env.RESULTS,FIA_ASR_EXECUTOR:env.JOBS},loadActivation:async()=>{if(env.OFFLINE)throw Error('activation-disabled');return config;},readRetainedSource:async()=>{if(env.SOURCE_GATE)await new Promise(r=>this.releaseSource=r);return new Uint8Array(867865);}});
 }
 async fetch(request){const path=new URL(request.url).pathname;try{
  if(path==='/release-ready'){this.releaseReady?.();return Response.json({released:true});}if(path==='/tamper'){const mutation=await request.json(),key='hosted:readiness:A';let saved=await this.ctx.storage.get(key);if(!this.originalReceipt)this.originalReceipt=structuredClone(saved);saved=structuredClone(this.originalReceipt);if(mutation.kind==='revision')saved.receipt.revision++;if(mutation.kind==='image')saved.receipt.binding.imageReferenceSha256='f'.repeat(64);if(mutation.kind==='config')saved.receipt.binding.configurationSha256='f'.repeat(64);if(mutation.kind==='guard')saved.receipt.guards.landlockAbi=0;if(mutation.kind==='extra')saved.receipt.privateAccount='secret';if(mutation.kind==='hash')saved.sha256='f'.repeat(64);else saved.sha256=await sha256(canonicalJSONString(saved.receipt));if(mutation.kind==='missing')await this.ctx.storage.delete(key);else await this.ctx.storage.put(key,saved);return Response.json({changed:true});}if(path==='/status-A')return Response.json(await this.pilot.statusA());if(path==='/status-B')return Response.json(await this.pilot.statusB());
  if(path==='/stop-A')return Response.json(await this.pilot.emergencyStopA(await request.json()));if(path==='/interrupt-B')return Response.json(await this.pilot.interruptPilotB(await request.json()));
  if(path==='/controlled-B')return Response.json(await this.pilot.pilotBForInterruption());
  if(path==='/release-source'){this.releaseSource?.();return Response.json({released:true});}if(path==='/release-result'){this.releaseResult?.();return Response.json({released:true});}
  if(path==='/counts')return Response.json({starts:this.starts,stops:this.stops,recognitions:this.recognitions,readyWaiting:!!this.releaseReady,sourceWaiting:!!this.releaseSource,resultWaiting:!!this.releaseResult});
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
test('actual SQLite readiness receipt is bounded, sanitized, bound and retained after disabled restart',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'fia-ready-retained-'));t.after(()=>rm(directory,{recursive:true,force:true}));let mf=runtime(directory);try{
 assert.equal((await call(mf,'/run')).state,'completed');const status=await call(mf,'/status-A');assert.equal(status.readinessEvidence,'response-verified');const saved=status.readiness;assert.equal(await sha256(canonicalJSONString(saved.receipt)),saved.sha256);assert.equal(saved.receipt.attemptId,status.attemptId);assert.equal(saved.receipt.nodeKey,status.nodeKey);assert.equal(saved.receipt.binding.configurationSha256,await sha256(canonicalJSONString(config)));assert.equal(saved.receipt.binding.imageReferenceSha256,await sha256(config.image));assert.equal(saved.receipt.binding.enforcementSha256,config.enforcementSha256);assert.equal(saved.receipt.guards.landlockAbi,3);assert.ok(encode(saved).length<=2048);assert.ok(!JSON.stringify(saved).includes('must-not-retain'));assert.ok(!JSON.stringify(saved).includes('registry/image'));
 await mf.dispose();mf=runtime(directory,{OFFLINE:true});assert.deepEqual((await call(mf,'/status-A')).readiness,saved);assert.equal((await call(mf,'/counts')).starts,0);
 }finally{await mf.dispose();}
});
test('actual SQLite status refuses corrupt, rebound, and extra-field receipts without revealing them',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'fia-ready-corrupt-'));t.after(()=>rm(directory,{recursive:true,force:true}));const mf=runtime(directory);try{
 await call(mf,'/run');for(const kind of ['hash','revision','image','config','guard','extra']){await call(mf,'/tamper',{kind});const status=await call(mf,'/status-A');assert.equal(status.readinessEvidence,'invalid',kind);assert.equal(status.readiness,null,kind);}await call(mf,'/tamper',{kind:'missing'});assert.equal((await call(mf,'/status-A')).readinessEvidence,'missing');
 }finally{await mf.dispose();}
});
test('actual SQLite mismatched readiness identity never retains a verified receipt',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'fia-ready-mismatch-'));t.after(()=>rm(directory,{recursive:true,force:true}));const mf=runtime(directory,{READY_MISMATCH:true});try{
 assert.equal((await call(mf,'/run')).state,'uncertain');const status=await call(mf,'/status-A');assert.equal(status.readinessEvidence,'missing');assert.equal(status.readiness,null);assert.equal((await call(mf,'/counts')).recognitions,0);
 }finally{await mf.dispose();}
});
test('actual SQLite mismatched readiness guard never retains a verified receipt',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'fia-ready-mismatch-'));t.after(()=>rm(directory,{recursive:true,force:true}));const mf=runtime(directory,{GUARD_MISMATCH:true});try{
 assert.equal((await call(mf,'/run')).state,'uncertain');const status=await call(mf,'/status-A');assert.equal(status.readinessEvidence,'missing');assert.equal(status.readiness,null);assert.equal((await call(mf,'/counts')).recognitions,0);
 }finally{await mf.dispose();}
});
test('actual SQLite cancelled readiness response cannot publish a receipt or recognize',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'fia-ready-cancel-'));t.after(()=>rm(directory,{recursive:true,force:true}));const mf=runtime(directory,{READY_GATE:true});try{
 const pending=call(mf,'/run');await poll(mf,'/counts',r=>r.readyWaiting);const row=await call(mf,'/status-A');await call(mf,'/stop-A',{attemptId:row.attemptId,revision:row.revision});await call(mf,'/release-ready');assert.equal((await pending).interrupted,true);assert.equal((await call(mf,'/status-A')).readinessEvidence,'missing');assert.equal((await call(mf,'/counts')).recognitions,0);
 }finally{await mf.dispose();}
});
