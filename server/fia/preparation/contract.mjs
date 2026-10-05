const identityFields=['packId','language','edition','presentationRevision','sourceVersion','recipeRevision','configSha256'];
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const plain=value=>value!==null&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype;
function fields(value,keys){if(!plain(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))throw Error('invalid-prepared-audio-shape');}
function text(value){if(typeof value!=='string'||!value.trim()||value.length>4096)throw Error('invalid-prepared-audio-identity');}
export function canonicalJSONString(value){
  const seen=new Set();
  function encode(v){
    if(v===null||typeof v==='boolean')return JSON.stringify(v);
    if(typeof v==='string'){if(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v))throw Error('unsupported-canonical-value');return JSON.stringify(v);}
    if(typeof v==='number'){if(!Number.isFinite(v))throw Error('unsupported-canonical-value');return JSON.stringify(v);}
    if(!v||typeof v!=='object'||seen.has(v))throw Error('unsupported-canonical-value');
    seen.add(v);let result;
    if(Array.isArray(v)){
      if(Reflect.ownKeys(v).length!==v.length+1||Object.keys(v).some(k=>!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'))||Object.keys(v).length!==v.length||Array.from({length:v.length},(_,i)=>i).some(i=>!Object.hasOwn(v,i)))throw Error('unsupported-canonical-value');
      result='['+v.map(encode).join(',')+']';
    }else{
      if(!plain(v)||Reflect.ownKeys(v).length!==Object.keys(v).length)throw Error('unsupported-canonical-value');
      const keys=Object.keys(v).sort();
      if(keys.some(k=>!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')))throw Error('unsupported-canonical-value');
      result='{'+keys.map(k=>encode(k)+':'+encode(v[k])).join(',')+'}';
    }
    seen.delete(v);return result;
  }
  return encode(value);
}
export async function sha256(bytes){
  if(typeof bytes==='string')bytes=new TextEncoder().encode(bytes);
  if(!(bytes instanceof Uint8Array))throw Error('expected-bytes');
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}
function equal(actual,expected){if(canonicalJSONString(actual)!==canonicalJSONString(expected))throw Error('prepared-audio-binding-mismatch');}
function media(value,delivery=false){
  fields(value,delivery?['url','sha256','bytes','duration','mime','quality']:['url','sha256','bytes','duration']);
  text(value.url);let url;try{url=new URL(value.url);}catch{throw Error('invalid-prepared-audio-url');}
  if(url.protocol!=='https:'||url.username||url.password||url.hash)throw Error('invalid-prepared-audio-url');
  if(!hash(value.sha256)||!Number.isSafeInteger(value.bytes)||value.bytes<1||!Number.isFinite(value.duration)||value.duration<=0)throw Error('invalid-prepared-audio-media');
  if(delivery){if(!['audio/mpeg','audio/mp4','audio/ogg','audio/webm','audio/wav'].includes(value.mime))throw Error('invalid-prepared-audio-mime');text(value.quality);}
}
export function validatePreparedAudio(result,expected){
  // expected is trusted server configuration, never copied from a client/result.
  canonicalJSONString(result);canonicalJSONString(expected);
  fields(expected,['resultSha256','acceptanceSha256','identity','source','delivery','evidence','activities']);
  if(!hash(expected.resultSha256)||!hash(expected.acceptanceSha256))throw Error('missing-trusted-prepared-audio-evidence');
  fields(expected.identity,identityFields);fields(expected.evidence,['recordingLedgerSha256','timingSha256']);
  fields(result,['schema',...identityFields,'source','delivery','provenance','evidence','activities']);
  if(result.schema!=='fia-prepared-audio@1'||result.provenance!=='official-recording')throw Error('unsupported-prepared-audio');
  for(const key of identityFields){text(result[key]);if(['presentationRevision','configSha256'].includes(key)&&!hash(result[key]))throw Error('invalid-prepared-audio-identity');equal(result[key],expected.identity[key]);}
  media(result.source);media(result.delivery,true);equal(result.source,expected.source);equal(result.delivery,expected.delivery);
  fields(result.evidence,['acceptanceSha256','recordingLedgerSha256','timingSha256']);
  for(const v of Object.values(result.evidence))if(!hash(v))throw Error('invalid-prepared-audio-evidence');
  equal(result.evidence,{acceptanceSha256:expected.acceptanceSha256,...expected.evidence});
  if(!Array.isArray(result.activities)||!result.activities.length||!Array.isArray(expected.activities)||result.activities.length!==expected.activities.length)throw Error('invalid-prepared-audio-activities');
  const ids=new Set(),units=new Set();let end=0;
  result.activities.forEach((activity,index)=>{
    fields(activity,['activityId','sourceUnitId','sourceTextSha256','playbackRange']);fields(expected.activities[index],['activityId','sourceUnitId','sourceTextSha256']);
    for(const key of ['activityId','sourceUnitId'])text(activity[key]);
    if(!hash(activity.sourceTextSha256)||ids.has(activity.activityId)||units.has(activity.sourceUnitId))throw Error('invalid-prepared-audio-activities');
    ids.add(activity.activityId);units.add(activity.sourceUnitId);
    equal({activityId:activity.activityId,sourceUnitId:activity.sourceUnitId,sourceTextSha256:activity.sourceTextSha256},expected.activities[index]);
    fields(activity.playbackRange,['startSeconds','endSeconds']);const {startSeconds:start,endSeconds:stop}=activity.playbackRange;
    if(!Number.isFinite(start)||!Number.isFinite(stop)||start<end||start<0||start>=stop||stop>result.delivery.duration)throw Error('invalid-prepared-audio-range');end=stop;
  });
  return structuredClone(result);
}
export async function readPreparedAudio(bytes,expected){
  if(!(bytes instanceof Uint8Array)||bytes.byteLength>2*1024*1024||!hash(expected?.resultSha256))throw Error('missing-trusted-prepared-audio-evidence');
  const copy=bytes.slice();const trusted=structuredClone(expected);
  if(await sha256(copy)!==trusted.resultSha256)throw Error('prepared-audio-bytes-mismatch');
  let result;try{result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(copy));}catch{throw Error('invalid-prepared-audio-json');}
  return validatePreparedAudio(result,trusted);
}
