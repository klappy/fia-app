import {createQualifiedUnitTransport} from './qualified-unit-audio.js';
import {readVerifiedMedia,validatePlaybackRange} from './media-delivery.js';
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const keys=(value,expected)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join()!==expected.split(',').sort().join())throw Error('The prepared recording descriptor is invalid.');};
const text=x=>typeof x==='string'&&x.length>0&&x.length<=4096;
export function canonicalPreparationJSON(value){
 if(typeof value==='string'&&/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))throw Error('The prepared recording descriptor is invalid.');
 if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
 if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonicalPreparationJSON).join(',')+']';
 if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype)return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalPreparationJSON(value[k])).join(',')+'}';
 throw Error('The prepared recording descriptor is invalid.');
}
export async function preparationHash(value){const bytes=typeof value==='string'?new TextEncoder().encode(value):value;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');}
function media(value,delivery=false,source=null){
 keys(value,delivery?'url,sha256,bytes,duration,mime,quality':'url,sha256,bytes,duration');
 const original=delivery&&value.quality==='original';
 if(original&&(value.url!==`/v1/preparation-audio/${source?.sha256}.mp3`||value.sha256!==source.sha256||value.bytes!==source.bytes||value.duration!==source.duration||value.mime!=='audio/mpeg'))throw Error('The original recording identity changed.');
 let u;try{u=new URL(value.url,original?'https://same-origin.invalid':undefined);}catch{throw Error('The recording URL is invalid.');}
 if(u.protocol!=='https:'||u.username||u.password||u.hash||!hash(value.sha256)||!Number.isSafeInteger(value.bytes)||value.bytes<=0||!Number.isFinite(value.duration)||value.duration<=0)throw Error('The prepared recording media identity is invalid.');
 if(delivery&&!original&&u.origin!=='https://transcode.klappy.dev')throw Error('The recording delivery origin is not approved.');
 if(delivery&&!['audio/mpeg','audio/mp4','audio/ogg','audio/webm','audio/wav'].includes(value.mime))throw Error('The recording format is unavailable.');
}
export function validatePreparationStatus(value,identity,jobId){
 keys(value,'schema,jobId,state,reason,sourceState,selection,result,resultSha256,statusUrl,reused');
 if(value.schema!=='fia-preparation-status@1'||!hash(value.jobId)||jobId&&value.jobId!==jobId||!['blocked','preparing','ready'].includes(value.state)||!(value.reason===null||text(value.reason))||typeof value.reused!=='boolean'||value.statusUrl!==`/v1/preparations/${value.jobId}`)throw Error('Preparation returned an invalid status.');
 keys(value.selection,'packId,presentationRevision,language,edition,resource,quality');
 for(const k of ['packId','presentationRevision','language','edition','quality'])if(value.selection[k]!==identity[k])throw Error('Preparation belongs to another instruction.');
 if(!text(value.selection.resource))throw Error('Preparation returned an invalid resource.');
 if(!['queued','verified','failed','uncertain'].includes(value.sourceState))throw Error('Preparation returned an invalid source state.');
 if(value.state==='ready'){if(value.sourceState!=='verified'||!value.result||!hash(value.resultSha256))throw Error('The prepared recording is not verified.');}
 else if(value.result!==null||value.resultSha256!==null)throw Error('Preparation returned premature recording data.');
 return value;
}
// This receives only a same-origin HTTPS API response, whose server validates its
// reviewed catalog. The hash below protects the canonical result representation;
// it is not a replacement for that server authority or a self-signed trust claim.
export async function verifyPreparedRecording(status,identity){
 validatePreparationStatus(status,identity);if(status.state!=='ready')throw Error('The recording is not ready.');
 const r=status.result;
 keys(r,'schema,packId,language,edition,presentationRevision,sourceVersion,recipeRevision,configSha256,source,delivery,provenance,evidence,activities');
 if(r.schema!=='fia-prepared-audio@1'||r.provenance!=='official-recording'||!text(r.sourceVersion)||!text(r.recipeRevision)||!hash(r.configSha256))throw Error('The recording provenance is not supported.');
 for(const k of ['packId','presentationRevision','language','edition'])if(r[k]!==identity[k])throw Error('The recording belongs to another passage revision.');
 media(r.source);media(r.delivery,true,r.source);if(r.delivery.quality!==identity.quality)throw Error('The recording quality changed.');
 keys(r.evidence,'acceptanceSha256,recordingLedgerSha256,timingSha256');if(Object.values(r.evidence).some(v=>!hash(v)))throw Error('The recording evidence is incomplete.');
 if(!Array.isArray(r.activities)||!r.activities.length)throw Error('The recording has no instruction binding.');
 const ids=new Set(),units=new Set();let end=0,selected;
 for(const a of r.activities){keys(a,'activityId,sourceUnitId,sourceTextSha256,playbackRange');if(!text(a.activityId)||!text(a.sourceUnitId)||!hash(a.sourceTextSha256)||ids.has(a.activityId)||units.has(a.sourceUnitId))throw Error('The recording instruction binding is invalid.');ids.add(a.activityId);units.add(a.sourceUnitId);validatePlaybackRange(a.playbackRange,r.delivery.duration);if(a.playbackRange.startSeconds<end)throw Error('The recording excerpts overlap.');end=a.playbackRange.endSeconds;if(a.activityId===identity.activityId){if(a.sourceUnitId!==identity.sourceUnitId||a.sourceTextSha256!==identity.sourceTextSha256)throw Error('The recording text binding changed.');selected=a;}}
 if(!selected)throw Error('The requested instruction is not in this recording.');
 if(await preparationHash(canonicalPreparationJSON(r))!==status.resultSha256)throw Error('The prepared recording descriptor hash changed.');
 return Object.freeze({jobId:status.jobId,resultSha256:status.resultSha256,identity:structuredClone(identity),source:structuredClone(r.source),delivery:structuredClone(r.delivery),evidence:structuredClone(r.evidence),playbackRange:structuredClone(selected.playbackRange)});
}
export async function boundedJSON(response,signal){
 if(!response.ok)throw Error(response.status===503?'Recording preparation is temporarily unavailable. Try again.':'Recording preparation could not be checked. Try again.');
 if(response.redirected||response.type==='opaque'||!(response.headers.get('content-type')||'').startsWith('application/json'))throw Error('Preparation returned an invalid response.');
 const reader=response.body?.getReader();if(!reader)throw Error('Preparation returned an empty response.');let length=0;const chunks=[];
 try{for(;;){if(signal?.aborted)throw Error('Preparation observation canceled.');const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>262144)throw Error('Preparation response is too large.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function withPreparationTimeout(signal,run){
 const controller=new AbortController(),abort=()=>controller.abort();if(signal?.aborted)throw Error('Preparation observation canceled.');signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,30000);
 try{return await run(controller.signal);}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export function createPreparationTransport({fetch:fetcher=(...args)=>fetch(...args),origin=()=>location.origin,browserProfile=()=>({userAgent:navigator.userAgent,platform:navigator.platform})}={}){
 const qualified=createQualifiedUnitTransport({fetch:fetcher,origin,browserProfile});
 const request=(path,identity,signal,post=false)=>withPreparationTimeout(signal,async signal=>{
  if(new URL(origin()).protocol!=='https:')throw Error('Recording preparation requires the published HTTPS app.');
  const response=await fetcher(path,{method:post?'POST':'GET',headers:post?{'Content-Type':'application/json'}:undefined,body:post?JSON.stringify(identity):undefined,credentials:'same-origin',redirect:'error',cache:'no-store',signal});
  if((response.status===422||response.status===404)&&post&&identity.quality==='original'){void response.body?.cancel().catch(()=>{});return qualified.request(identity,signal);}
  if(response.status===422||response.status===404)return {status:'unavailable',message:'This recording is not prepared yet. You can continue without it.'};
  const value=validatePreparationStatus(await boundedJSON(response,signal),identity,post?undefined:path.split('/').at(-1));
  if(value.state==='blocked')return {status:'unavailable',message:'This recording is awaiting preparation or review. You can continue without it.'};
  return {status:value.state==='ready'?'ready':'preparing',id:value.jobId,value};
 });
 return {
  request:(identity,signal)=>request('/v1/preparations',identity,signal,true),
  status:(id,identity,signal)=>{if(typeof id==='string'&&id.startsWith('unit:'))return qualified.status(id,identity,signal);if(!hash(id))throw Error('Invalid preparation identity.');return request(`/v1/preparations/${id}`,identity,signal);},
  verify:(result,identity)=>result.kind==='qualified-unit'?qualified.verify(result,identity):verifyPreparedRecording(result.value,identity),
  async play(descriptor,signal){
   if(descriptor.kind==='qualified-unit')return qualified.play(descriptor,signal);
   // Re-observe server authority before reading media, including warm reuse.
   const current=await request(`/v1/preparations/${descriptor.jobId}`,descriptor.identity,signal);
   if(current.status!=='ready')throw Error('This recording is no longer ready. Press Play to check again.');
   const fresh=await verifyPreparedRecording(current.value,descriptor.identity);
   if(fresh.resultSha256!==descriptor.resultSha256)throw Error('The prepared recording changed. Press Play to check again.');
   return withPreparationTimeout(signal,async signal=>{const file={...fresh.delivery,group:'audio'},response=await fetcher(file.url,{cache:'no-store',credentials:file.quality==='original'?'same-origin':'omit',redirect:'error',signal});
    const bytes=await readVerifiedMedia(response,file,{signal});return {bytes,mime:file.mime,playbackRange:fresh.playbackRange};});
  },
 };
}
