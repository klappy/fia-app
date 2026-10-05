import {canonicalJSONString,sha256} from '../contract.mjs';
export const PILOT_SOURCE_SHA256='0f3fa9e77215f5050f9e22b7abee329c47e0e9ff71a5f0c4d248926a8f42268d';
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function shape(value,keys){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))throw Error('invalid-raw-shape');}
export async function validateRawRecognition(input,expected){
 expected=structuredClone(expected);
 if(!(input instanceof Uint8Array)||input.length>1048576)throw Error('raw-size');const bytes=input.slice();
 const raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 shape(raw,['schema','status','source','modelSha256','runtimeSha256','scriptSha256','configSha256','effectiveConfig','decoder','durationSeconds','segments','text','uncertainty']);
 if(raw.schema!=='fia-hosted-raw-recognition@1'||raw.status!=='candidate')throw Error('raw-schema');
 shape(raw.source,['sha256','bytes']);shape(raw.decoder,['samples','sampleRate','sha256']);
 if(!hash(raw.source.sha256)||raw.source.sha256!==PILOT_SOURCE_SHA256||raw.source.sha256!==expected.sourceSha256||raw.source.bytes!==867865||raw.source.bytes!==expected.sourceBytes||!Number.isSafeInteger(raw.source.bytes)||raw.source.bytes<1||raw.source.bytes>2097152)throw Error('raw-source');
 for(const name of ['modelSha256','runtimeSha256','scriptSha256','configSha256'])if(!hash(raw[name])||raw[name]!==expected[name])throw Error('raw-identity');
 if(raw.effectiveConfig.device!=='cpu'||raw.effectiveConfig.computeType!=='int8'||raw.effectiveConfig.cpuThreads!==2||raw.effectiveConfig.language!=='en'||raw.effectiveConfig.modelId!=='Systran/faster-whisper-small'||raw.effectiveConfig.modelRevision!=='536b0662742c02347bc0e980a01041f333bce120'||raw.effectiveConfig.initialPrompt!==null||raw.effectiveConfig.prefix!==null||raw.effectiveConfig.hotwords!==null)throw Error('raw-pilot-config');
 if(await sha256(canonicalJSONString(raw.effectiveConfig))!==raw.configSha256)throw Error('raw-config');
 if(raw.decoder.sampleRate!==16000||!Number.isSafeInteger(raw.decoder.samples)||raw.decoder.samples<1||raw.decoder.samples>1440000||!hash(raw.decoder.sha256)||raw.durationSeconds!==raw.decoder.samples/16000)throw Error('raw-decoder');
 if(!Array.isArray(raw.segments)||raw.segments.length>2000||typeof raw.text!=='string'||!Array.isArray(raw.uncertainty)||raw.uncertainty.length<1||raw.uncertainty.length>32||raw.uncertainty.some(x=>typeof x!=='string'||!x||x.length>4096))throw Error('raw-evidence');
 let previousStart=0,previousEnd=0,count=0,segmentStart=0,segmentEnd=0;
 for(const segment of raw.segments){
  shape(segment,['id','seek','start','end','text','tokens','avg_logprob','compression_ratio','no_speech_prob','words','temperature']);
  if(!Number.isSafeInteger(segment.id)||segment.id<0||!Number.isSafeInteger(segment.seek)||segment.seek<0||typeof segment.text!=='string'||!Array.isArray(segment.tokens)||segment.tokens.length>10000||segment.tokens.some(x=>!Number.isSafeInteger(x)||x<0)||!Array.isArray(segment.words)||![segment.start,segment.end,segment.avg_logprob,segment.compression_ratio,segment.no_speech_prob,segment.temperature].every(Number.isFinite)||segment.start<segmentStart||segment.end<segmentEnd||segment.end<segment.start||segment.end>raw.durationSeconds||segment.no_speech_prob<0||segment.no_speech_prob>1)throw Error('raw-segment');
  segmentStart=segment.start;segmentEnd=segment.end;
  for(const word of segment.words){count++;shape(word,['word','start','end','probability']);if(count>2000||typeof word.word!=='string'||!word.word||word.word.length>4096||![word.start,word.end,word.probability].every(Number.isFinite)||word.start<previousStart||word.end<previousEnd||word.start<segment.start||word.end>segment.end||word.end<word.start||word.probability<0||word.probability>1)throw Error('raw-word');previousStart=word.start;previousEnd=word.end;}
 }
 if(raw.text!==raw.segments.map(segment=>segment.text).join(''))throw Error('raw-text');
 return true;
}
async function retained(bucket,key,limit){const object=await bucket.get(key);if(!object)return null;if(!Number.isSafeInteger(object.size)||object.size<1||object.size>limit)throw Error('retained-size');const reader=object.body.getReader(),chunks=[];let length=0;try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit)throw Error('retained-size');chunks.push(value);}}finally{await reader.cancel();}if(length!==object.size)throw Error('retained-length');const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;}
async function immutable(bucket,key,bytes){let old=await retained(bucket,key,bytes.length);if(!old){await bucket.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'}});old=await retained(bucket,key,bytes.length);}if(!old||await sha256(old)!==await sha256(bytes))throw Error('immutable-conflict');}
export async function publishRawRecognition({bucket,bytes,expected,nodeKey,ledger,attemptId,revision}){
 if(!['A','B'].includes(ledger)||typeof attemptId!=='string'||!attemptId||!Number.isSafeInteger(revision)||revision<1||!hash(nodeKey))throw Error('node-key');const body=bytes.slice();await validateRawRecognition(body,expected);
 const digest=await sha256(body),reference=`recognition/sha256/${digest}.json`;
 await immutable(bucket,reference,body);
 const receipt=new TextEncoder().encode(canonicalJSONString({schema:'fia-hosted-recognition-result@1',nodeKey,ledger,attemptId,revision,sha256:digest,reference}));
 await immutable(bucket,`recognition/nodes/${ledger}/${nodeKey}.json`,receipt);
 return {sha256:digest,reference};
}
