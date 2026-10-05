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
 constructor(ctx,env){this.ctx=ctx;this.env=env;let running=false;
 const container={get running(){return running;},inspect:async()=>running?{image:''}:null,start(){if(env.OFFLINE)throw Error('must-not-start');running=true;},monitor:()=>new Promise(()=>{}),setInactivityTimeout:async()=>{},destroy:async()=>{running=false;},getTcpPort:()=>({fetch:async url=>{if(url.endsWith('/ready'))return Response.json({schema:'fia-asr-ready@1',modelSha256:config.identity.modelSha256,runtimeSha256:config.identity.runtimeSha256,scriptSha256:config.identity.scriptSha256,configSha256:config.identity.configSha256,guards:{schema:'fia-image-guards@1',addressSpaceBytes:4294967296,scratchPolicy:'landlock-no-filesystem-writes',scratchBytes:0,landlockAbi:3,anonymousFilesDenied:true}});await new Promise(r=>setTimeout(r,30));return Response.json(raw);}})};
 this.pilot=createCloudflarePilot({ctx:{id:ctx.id,storage:ctx.storage,container,waitUntil(){}},env:{FIA_ORIGINALS:env.RESULTS,FIA_ASR_EXECUTOR:env.JOBS},loadActivation:async()=>{if(env.OFFLINE)throw Error('activation-disabled');return config;},readRetainedSource:async()=>new Uint8Array(867865)});
 }
 async fetch(request){if(new URL(request.url).pathname==='/budget')return Response.json(await this.ctx.storage.get('hosted:budget')??null);try{return Response.json(await this.pilot.pilotA());}catch(error){return Response.json({error:error.message});}}
 alarm(){return this.pilot.alarm();}
}
export default {fetch(request,env){return env.JOBS.get(env.JOBS.idFromName(new URL(request.url).searchParams.has('other')?'other':'asr-pilot-v1')).fetch(request);}};`;
const bundle=await build({stdin:{contents:worker,resolveDir:resolve('.')},bundle:true,format:'esm',platform:'browser',write:false});
function runtime(path,offline=false){return new Miniflare({...convertV4MiniflareOptions({name:'cloudflare-pilot-integration-fixture',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-01',bindings:{OFFLINE:offline},durableObjects:{JOBS:{className:'Fixture',useSQLite:true,unsafeUniqueKey:'cloudflare-pilot-integration-fixture'}},r2Buckets:['RESULTS']}),resourcePersistencePath:path});}
test('actual SQLite/R2 composition survives restart disabled; Container API is explicitly simulated',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'fia-cloudflare-pilot-'));t.after(()=>rm(directory,{recursive:true,force:true}));let mf=runtime(directory);
 try{
  const run=()=>mf.dispatchFetch('https://fixture.invalid/run').then(r=>r.json());
  const results=await Promise.all([run(),run()]);assert.equal(results.filter(r=>r.state==='completed').length,1);assert.equal(results.filter(r=>r.state==='preparing').length,1);
  const first=results.find(r=>r.state==='completed');const bucket=await mf.getR2Bucket('RESULTS');assert(await bucket.get(first.artifact.reference));
  assert.equal((await(await mf.dispatchFetch('https://fixture.invalid/run?other')).json()).error,'private-pilot-identity');assert.equal(await(await mf.dispatchFetch('https://fixture.invalid/budget?other')).json(),null);
  await mf.dispose();mf=runtime(directory,true);const warm=await run();assert.equal(warm.state,'completed');assert.equal(warm.attemptId,first.attemptId);assert.equal(warm.artifact.sha256,first.artifact.sha256);assert.equal((await(await mf.dispatchFetch('https://fixture.invalid/budget')).json()).starts,1);
 }finally{await mf.dispose();}
});
