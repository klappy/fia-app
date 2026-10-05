import test from 'node:test';import assert from 'node:assert/strict';
import {validateRawRecognition,publishRawRecognition,PILOT_SOURCE_SHA256} from '../../server/fia/preparation/hosted-asr/artifact.mjs';
import {canonicalJSONString,sha256} from '../../server/fia/preparation/contract.mjs';
const effectiveConfig={device:'cpu',computeType:'int8',cpuThreads:2,initialPrompt:null,prefix:null,hotwords:null,language:'en',modelId:'Systran/faster-whisper-small',modelRevision:'536b0662742c02347bc0e980a01041f333bce120'};
const expected={sourceSha256:PILOT_SOURCE_SHA256,sourceBytes:867865,modelSha256:'b'.repeat(64),runtimeSha256:'c'.repeat(64),scriptSha256:'d'.repeat(64),configSha256:await sha256(canonicalJSONString(effectiveConfig))};
function raw(){return {schema:'fia-hosted-raw-recognition@1',status:'candidate',source:{sha256:expected.sourceSha256,bytes:867865},modelSha256:expected.modelSha256,runtimeSha256:expected.runtimeSha256,scriptSha256:expected.scriptSha256,configSha256:expected.configSha256,effectiveConfig,decoder:{samples:16000,sampleRate:16000,sha256:'e'.repeat(64)},durationSeconds:1,text:' example',segments:[{id:0,seek:0,start:0.1,end:0.5,text:' example',tokens:[123],avg_logprob:-0.2,compression_ratio:1,no_speech_prob:0.1,temperature:0,words:[{word:' example',start:0.1,end:0.5,probability:0.8}]}],uncertainty:['Uncalibrated model estimates; not playback acceptance.']};}
const encode=x=>new TextEncoder().encode(canonicalJSONString(x));
import {createRequire} from 'node:module';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json')),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
function runtime(path){return new Miniflare({...convertV4MiniflareOptions({name:'hosted-result-r2-fixture',modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-01',r2Buckets:['RESULTS']}),resourcePersistencePath:path});}
test('actual R2 immutable result/isolated receipts persist after runtime restart',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'fia-hosted-result-r2-'));t.after(()=>rm(directory,{recursive:true,force:true}));let mf=runtime(directory);
 try{
  let bucket=await mf.getR2Bucket('RESULTS');const bytes=encode(raw()),input={bucket,bytes,expected,nodeKey:'f'.repeat(64),ledger:'A',attemptId:'attempt-a',revision:1};
  const result=await publishRawRecognition(input);await bucket.put(result.reference,'replace forbidden',{onlyIf:{etagDoesNotMatch:'*'}});assert.deepEqual(new Uint8Array(await(await bucket.get(result.reference)).arrayBuffer()),bytes);
  await publishRawRecognition({...input,ledger:'B',attemptId:'attempt-b'});
  await mf.dispose();mf=runtime(directory);bucket=await mf.getR2Bucket('RESULTS');assert.deepEqual(await publishRawRecognition({...input,bucket}),result);
  await assert.rejects(publishRawRecognition({...input,bucket,attemptId:'other-attempt'}),/conflict|size/);
  await bucket.put(result.reference,'corrupt');await assert.rejects(publishRawRecognition({...input,bucket}),/conflict|size|length/);assert.equal(await(await bucket.get(result.reference)).text(),'corrupt');
 }finally{await mf.dispose();}
});
