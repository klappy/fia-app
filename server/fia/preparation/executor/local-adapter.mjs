// Local development/reference process bridge. No hosted execution claim.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {canonicalJSONString,sha256} from '../contract.mjs';
export const LOCAL_RECOGNITION_CONFIG=Object.freeze({device:'cpu',computeType:'int8',cpuThreads:4,task:'transcribe',beam_size:5,word_timestamps:true,condition_on_previous_text:false,initial_prompt:null,prefix:null,hotwords:null,vad_filter:false});
export async function localRecognitionConfigSha256(scriptSha256){return sha256(canonicalJSONString({scriptSha256,settings:LOCAL_RECOGNITION_CONFIG}));}
const isHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function createLocalRecognitionAdapter({pythonPath,scriptPath,scriptSha256,modelDirectory,modelId,modelManifestSha256,workDirectory,resolveSource,storeArtifact,supportedLanguages=['eng'],spawnProcess=spawn}){
 if(!isHash(scriptSha256)||!isHash(modelManifestSha256)||typeof modelId!=='string'||!modelId||typeof resolveSource!=='function'||typeof storeArtifact!=='function')throw Error('invalid-local-adapter-configuration');
 const languages=new Set(supportedLanguages),paths={python:resolve(pythonPath),script:resolve(scriptPath),model:resolve(modelDirectory),work:resolve(workDirectory)};
 if([...languages].some(language=>!['eng','spa'].includes(language))||(/tiny\.en|\.en$/.test(modelId)&&languages.has('spa')))throw Error('unsupported-local-model-language');
 return {paid:false,async run({input,nodeOutputs}){
  input=structuredClone(input);nodeOutputs=structuredClone(nodeOutputs);
  const language={eng:'en',spa:'es'}[input.language];
  if(!languages.has(input.language)||!language)throw Error('unsupported-local-language');
  const configSha256=await localRecognitionConfigSha256(scriptSha256);
  if(canonicalJSONString(input.modelRecipe)!==canonicalJSONString({modelId,modelRevision:modelManifestSha256,configSha256}))throw Error('local-model-recipe-mismatch');
  if(await sha256(await readFile(paths.script))!==scriptSha256)throw Error('local-script-mismatch');
  const source=structuredClone(await resolveSource(structuredClone(nodeOutputs.acquire)));
  if(!isHash(source.sha256)||!Number.isSafeInteger(source.bytes)||source.bytes<1||source.bytes>2*1024*1024)throw Error('local-source-limit');
  const sourcePath=resolve(source.path);if((await stat(sourcePath)).size!==source.bytes)throw Error('local-source-length');
  const sourceBytes=await readFile(sourcePath);if(await sha256(sourceBytes)!==source.sha256)throw Error('local-source-hash');
  const directory=await mkdtemp(join(paths.work,'recognition-')),inputPath=join(directory,'input.json'),outputPath=join(directory,'output.json');
  await writeFile(inputPath,canonicalJSONString({sourcePath,sourceSha256:source.sha256,sourceBytes:source.bytes,language,modelId,modelManifestSha256}),{flag:'wx',mode:0o600});
  await new Promise((resolveRun,reject)=>{
   const child=spawnProcess(paths.python,[paths.script,'--input',inputPath,'--model-dir',paths.model,'--output',outputPath],{shell:false,stdio:['ignore','pipe','pipe'],env:{...process.env,HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'}});
   let total=0,finished=false;const finish=error=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolveRun();};
   const timer=setTimeout(()=>{child.kill('SIGKILL');finish(Error('local-recognition-timeout'));},125000);
   const consume=data=>{total+=data.length;if(total>1024*1024){child.kill('SIGKILL');finish(Error('local-recognition-log-limit'));}};
   child.stdout.on('data',consume);child.stderr.on('data',consume);child.on('error',finish);child.on('close',code=>finish(code===0?null:Error('local-recognition-failed')));
  });
  const size=(await stat(outputPath)).size;if(size<1||size>4*1024*1024)throw Error('local-recognition-output-limit');
  const bytes=await readFile(outputPath),result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(result.schema!=='fia-local-raw-recognition@1'||result.status!=='candidate'||result.executionClass!=='local-offline-development-reference'||result.source?.sha256!==source.sha256||result.source?.bytes!==source.bytes||result.model?.id!==modelId||result.model?.manifestSha256!==modelManifestSha256||result.scriptSha256!==scriptSha256)throw Error('local-recognition-binding');
  if(await sha256(canonicalJSONString(result.model.files))!==modelManifestSha256)throw Error('local-recognition-model-manifest');
  for(const key of ['device','computeType','cpuThreads'])if(result.model[key]!==LOCAL_RECOGNITION_CONFIG[key])throw Error('local-recognition-settings');
  if(result.recognitionConfig?.language!==language)throw Error('local-recognition-language');
  for(const [key,value] of Object.entries(LOCAL_RECOGNITION_CONFIG))if(!['device','computeType','cpuThreads'].includes(key)&&result.recognitionConfig[key]!==value)throw Error('local-recognition-settings');
  if(!Array.isArray(result.segments)||!Number.isFinite(result.durationSeconds)||result.durationSeconds<=0||result.durationSeconds>600)throw Error('local-recognition-output');
  const digest=await sha256(bytes),stored=await storeArtifact(new Uint8Array(bytes));
  if(stored?.sha256!==digest||typeof stored.reference!=='string'||!stored.reference.trim())throw Error('local-artifact-store-mismatch');
  return {sha256:digest,reference:stored.reference,status:'candidate',executionClass:'local-offline-development-reference'};
 }};
}
