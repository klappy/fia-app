// Local, offline reference adapter. No network acquisition or hosted activation.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,stat,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {canonicalJSONString,sha256} from '../contract.mjs';
import {planRecognitionWindows} from './recognition-window-plan.mjs';
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),same=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b);
const need=(ok,why)=>{if(!ok)throw Error('local-window-'+why);};
async function fileHash(path,limit,{signal,deadline}={}){const h=createHash('sha256');let n=0;need(!signal?.aborted,'cancelled');for await(const b of createReadStream(path,{signal})){need(!deadline||Date.now()<deadline,'verification-timeout');n+=b.length;need(n<=limit,'file-budget');h.update(b);}return {sha256:h.digest('hex'),bytes:n};}
export async function createLocalWindowAdapter({pythonPath,scriptPath,scriptSha256,modelDirectory,modelId,modelManifestSha256,runtimeManifest,workDirectory,language='eng',maxSamples=16000*1800,processMs=125000,spawnProcess=spawn}){
 need(hash(scriptSha256)&&hash(modelManifestSha256)&&typeof modelId==='string'&&modelId,'configuration');
 need(['eng','spa'].includes(language)&&!(language==='spa'&&/tiny\.en|\.en$/.test(modelId)),'language');
 need(Number.isSafeInteger(maxSamples)&&maxSamples>0&&maxSamples<=16000*86400&&Number.isSafeInteger(processMs)&&processMs>0&&processMs<=125000,'budget');
 const runtime=structuredClone(runtimeManifest);need(runtime&&Object.keys(runtime).sort().join()==='av,ctranslate2,faster-whisper,numpy,python'&&Object.values(runtime).every(v=>typeof v==='string'&&v),'runtime');
 const paths={python:resolve(pythonPath),script:resolve(scriptPath),model:resolve(modelDirectory),work:resolve(workDirectory)},runProcess=spawnProcess;
 const decoderSha256=await sha256(canonicalJSONString({schema:'fia-local-pcm-decoder@1',scriptSha256,runtime,format:'mono-f32le',sampleRate:16000}));
 const configSha256=await sha256(canonicalJSONString({schema:'fia-local-window-config@1',scriptSha256,runtime,language,modelId,roundingPolicy:'seconds-floor-start-ceil-end@1',device:'cpu',computeType:'int8',cpuThreads:4,beamSize:5,wordTimestamps:true,conditionOnPreviousText:false,prompts:null,vad:false}));
 const dependencySha256=await sha256(canonicalJSONString({decoderSha256,configSha256,modelManifestSha256}));
 async function processJob(job,{signal}={}){
  need(!signal?.aborted,'cancelled');need(await sha256(await readFile(paths.script))===scriptSha256,'script-pin');
  const directory=await mkdtemp(join(paths.work,'window-job-')),input=join(directory,'input.json'),output=join(directory,'output.json');let processClosed=true;
  try{await writeFile(input,canonicalJSONString({...job,scriptSha256,runtimeManifest:runtime}),{flag:'wx',mode:0o600});
   await new Promise((done,reject)=>{let child,timer,terminationTimer,total=0,settled=false,stopError=null;const finish=e=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(terminationTimer);signal?.removeEventListener('abort',abort);e?reject(e):done();};const stop=e=>{if(stopError)return;stopError=e;clearTimeout(timer);try{child.kill('SIGKILL');}catch{}terminationTimer=setTimeout(()=>finish(Error('local-window-termination-uncertain')),5000);};const abort=()=>stop(Error('local-window-cancelled'));
    try{child=runProcess(paths.python,[paths.script,'--input',input,'--output',output],{shell:false,stdio:['ignore','pipe','pipe'],env:{...process.env,HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'}});processClosed=false;}catch(e){finish(e);return;}
    const consume=b=>{total+=b.length;if(total>1024*1024)stop(Error('local-window-log-budget'));};child.stdout.on('data',consume);child.stderr.on('data',consume);child.on('error',e=>{stopError??=e;});child.on('close',code=>{processClosed=true;finish(stopError||(code===0?null:Error('local-window-process-failed')));});
    timer=setTimeout(()=>stop(Error('local-window-timeout')),processMs);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   });need(!signal?.aborted,'cancelled');const size=(await stat(output)).size;need(size>0&&size<=4*1024*1024,'output-budget');return new Uint8Array(await readFile(output));
  }finally{if(processClosed)await rm(directory,{recursive:true,force:true});}
 }
 async function decode({sourcePath,sourceSha256,sourceBytes,signal}){
  need(hash(sourceSha256)&&Number.isSafeInteger(sourceBytes)&&sourceBytes>0&&sourceBytes<=8*1024*1024,'source-budget');
  const deadline=Date.now()+processMs,directory=await mkdtemp(join(paths.work,'window-pcm-')),pcmPath=join(directory,'source.f32');
  try{const bytes=await processJob({mode:'decode',sourcePath:resolve(sourcePath),sourceSha256,sourceBytes,pcmPath,maxSamples,decoderSha256},{signal}),receipt=JSON.parse(new TextDecoder().decode(bytes));
   need(receipt.schema==='fia-local-window-pcm@1'&&receipt.sourceSha256===sourceSha256&&receipt.sourceBytes===sourceBytes&&receipt.decoderSha256===decoderSha256&&receipt.sampleRate===16000&&receipt.format==='mono-f32le'&&Number.isSafeInteger(receipt.totalSamples)&&receipt.totalSamples>0&&receipt.totalSamples<=maxSamples,'decode-binding');
   const verified=await fileHash(pcmPath,maxSamples*4,{signal,deadline});need(verified.sha256===receipt.pcmSha256&&verified.bytes===receipt.totalSamples*4,'pcm-binding');
   const captured=structuredClone(receipt);
   return {receipt:structuredClone(captured),pcmPath,async dispose(){await rm(directory,{recursive:true,force:true});},recognition:{paid:false,dependencySha256,async run({planIdentity,window,signal}){
    const identity=structuredClone(planIdentity),w=structuredClone(window);const {policy,...request}=identity;const plan=await planRecognitionWindows(request);need(same(plan.identity,identity)&&plan.windows.some(x=>same(x,w)),'plan-window');
    for(const k of ['sourceSha256','pcmSha256','decoderSha256','totalSamples','sampleRate'])need(identity[k]===captured[k],'plan-pcm');need(identity.modelSha256===modelManifestSha256&&identity.configSha256===configSha256,'plan-model');
    const rawBytes=await processJob({mode:'recognize',pcmPath,maxSamples,planIdentity:identity,window:w,modelDirectory:paths.model,modelId,language:{eng:'en',spa:'es'}[language]},{signal});const raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(rawBytes));
    need(raw.schema==='fia-window-raw-words@1'&&raw.windowSha256===w.windowSha256&&same(raw.planIdentity,identity)&&same(raw.window,w)&&raw.runtimeEvidence?.scriptSha256===scriptSha256&&raw.runtimeEvidence?.modelManifestSha256===modelManifestSha256&&same(raw.runtimeEvidence?.runtimeManifest,runtime)&&raw.roundingPolicy==='seconds-floor-start-ceil-end@1','raw-binding');return rawBytes;
   }}};
  }catch(e){if(e.message!=='local-window-termination-uncertain')await rm(directory,{recursive:true,force:true});throw e;}
 }
 return Object.freeze({paid:false,decoderSha256,configSha256,modelSha256:modelManifestSha256,dependencySha256,decode});
}
