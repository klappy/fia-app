import {canonicalJSONString,sha256} from '../contract.mjs';
export const LOCAL_RECOGNITION_CONFIG=Object.freeze({device:'cpu',computeType:'int8',cpuThreads:4,task:'transcribe',beam_size:5,word_timestamps:true,condition_on_previous_text:false,initial_prompt:null,prefix:null,hotwords:null,vad_filter:false});
export async function localRecognitionConfigSha256(scriptSha256,runtimeManifest){return sha256(canonicalJSONString({scriptSha256,runtimeManifest,settings:LOCAL_RECOGNITION_CONFIG}));}
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export async function validateRecognitionIdentity(raw,input){
 const runtime=raw.runtime,model=raw.model,recipe=input.modelRecipe;
 if(!hash(raw.scriptSha256)||!runtime||Object.getPrototypeOf(runtime)!==Object.prototype||Object.keys(runtime).sort().join(',')!=='av,ctranslate2,faster-whisper,numpy,python'||Object.values(runtime).some(value=>typeof value!=='string'||!value.trim()))throw Error('recognition-runtime-binding');
 const language={eng:'en',spa:'es'}[input.language];
 if(!language||raw.recognitionConfig?.language!==language||!recipe||model?.id!==recipe.modelId||!hash(model?.manifestSha256)||model.manifestSha256!==recipe.modelRevision||!model.files||Object.getPrototypeOf(model.files)!==Object.prototype||!Object.keys(model.files).length)throw Error('recognition-model-binding');
 for(const file of Object.values(model.files))if(!file||Object.keys(file).sort().join(',')!=='bytes,sha256'||!hash(file.sha256)||!Number.isSafeInteger(file.bytes)||file.bytes<1)throw Error('recognition-model-manifest');
 if(await sha256(canonicalJSONString(model.files))!==model.manifestSha256||await localRecognitionConfigSha256(raw.scriptSha256,runtime)!==recipe.configSha256)throw Error('recognition-config-binding');
 if((/tiny\.en|\.en$/.test(model.id))&&input.language!=='eng')throw Error('recognition-model-language');
 for(const [key,value] of Object.entries(LOCAL_RECOGNITION_CONFIG)){
  const actual=['device','computeType','cpuThreads'].includes(key)?model[key]:raw.recognitionConfig[key];
  if(actual!==value)throw Error('recognition-settings-binding');
 }
 return true;
}
