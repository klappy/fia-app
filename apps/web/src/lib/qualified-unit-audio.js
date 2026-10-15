// Qualified, same-origin whole-file delivery is a separate contract from source excerpts.
import {canonicalPreparationJSON as canonical,preparationHash,boundedJSON,withPreparationTimeout} from './prepared-audio.js';
import {readVerifiedMedia} from './media-delivery.js';
const H=/^[a-f0-9]{64}$/;
const PREFIX='/v1/guide-unit-preparations';
const CONTROLLER='7d5fd19603a72f1d3d481652b20212656e23806e4a9e71bf535f3fd56d34da32';
const fields='packId,presentationRevision,language,edition,sourceUnitId,sourceTextSha256';
const need=(ok)=>{if(!ok)throw Error('This recording is not qualified for this instruction and browser.');};
const exact=(v,k)=>need(v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join()===k.split(',').sort().join());
const same=(a,b)=>canonical(a)===canonical(b);
const consumer=i=>Object.fromEntries(fields.split(',').map(k=>[k,i[k]]));
const ids=id=>{const m=/^unit:([a-f0-9]{64}):([a-f0-9]{64})$/.exec(id);need(m);return [m[1],m[2]];};
export function createQualifiedUnitTransport({fetch:fetcher,origin,browserProfile}){
 const status=async(id,identity,signal,post=false)=>{identity=structuredClone(identity);return withPreparationTimeout(signal,async signal=>{
  need(new URL(origin()).protocol==='https:'&&identity.quality==='original');
  const parts=post?null:ids(id),path=post?PREFIX:`${PREFIX}/${parts.join('/')}`;
  const response=await fetcher(path,{method:post?'POST':'GET',headers:post?{'Content-Type':'application/json'}:undefined,body:post?JSON.stringify(consumer(identity)):undefined,credentials:'same-origin',redirect:'error',cache:'no-store',signal});
  if([404,409,422].includes(response.status)){void response.body?.cancel().catch(()=>{});return {status:'unavailable',message:'This recording is not available for playback. You can continue.'};}
  const v=await boundedJSON(response,signal);
  exact(v,'schema,jobId,sourceJobId,consumer,state,reason,statusUrl,candidateProjection,result,resultSha256,acceptedPlaybackRanges');
  need(v.schema==='fia-guide-unit-preparation-status@1'&&H.test(v.jobId)&&H.test(v.sourceJobId)&&same(v.consumer,consumer(identity))&&v.statusUrl===`${PREFIX}/${v.sourceJobId}/${v.jobId}`&&Array.isArray(v.acceptedPlaybackRanges)&&v.acceptedPlaybackRanges.length===0);
  if(parts)need(v.sourceJobId===parts[0]&&v.jobId===parts[1]);
  need(['queued','preparing','candidate','blocked','uncertain','ready'].includes(v.state));
  if(v.state!=='ready'){need(v.result===null&&v.resultSha256===null);return {status:['queued','preparing'].includes(v.state)?'preparing':'unavailable',kind:'qualified-unit',id:`unit:${v.sourceJobId}:${v.jobId}`,value:v,message:'This recording is awaiting qualification. You can continue.'};}
  need(H.test(v.resultSha256)&&v.result);return {status:'ready',kind:'qualified-unit',id:`unit:${v.sourceJobId}:${v.jobId}`,value:v};
 });};
 const verify=async(result,identity)=>{
  identity=structuredClone(identity);need(result.status==='ready'&&identity.quality==='original');const v=structuredClone(result.value),r=v.result;
  need(v.state==='ready'&&H.test(v.sourceJobId)&&H.test(v.jobId)&&H.test(v.resultSha256)&&v.statusUrl===`${PREFIX}/${v.sourceJobId}/${v.jobId}`);
  const profile=structuredClone(browserProfile());
  exact(r,'schema,consumer,delivery,browserProfile,controllerSha256,qualificationSha256,bridgeSha256,bridge,nativeDacTimingQualified');
  exact(r.consumer,fields);need(r.schema==='fia-qualified-unit-derivative@1'&&same(r.consumer,consumer(identity))&&same(r.consumer,v.consumer)&&r.controllerSha256===CONTROLLER&&r.nativeDacTimingQualified===false);
  exact(r.browserProfile,'userAgent,platform');need(same(r.browserProfile,profile));
  const d=r.delivery;exact(d,'quality,mime,sha256,bytes,durationSeconds,url,playback,rate,verseHighlight,wordHighlight');
  need(d.quality==='original'&&d.mime==='audio/wav'&&H.test(d.sha256)&&Number.isSafeInteger(d.bytes)&&d.bytes>0&&d.bytes<=16*1024*1024&&Number.isFinite(d.durationSeconds)&&d.durationSeconds>0&&d.durationSeconds<=120&&d.playback==='whole-file-native-ended'&&d.rate===1&&d.verseHighlight===false&&d.wordHighlight===false);
  need(H.test(r.qualificationSha256)&&H.test(r.bridgeSha256)&&d.url===`${PREFIX}/${v.sourceJobId}/${v.jobId}/audio/${r.qualificationSha256}.wav`);
  const b=r.bridge;exact(b,'schema,consumer,qualificationSha256,recipeSha256,manifestSha256,browserReceiptSha256,historicalProvenanceSha256,currentProvenanceSha256,historicalCanonicalSha256,currentCanonicalSha256,currentPins,deliverySha256,pcmSha256,sourceSampleRange,qualificationScope');
  need(b.schema==='fia-unit-derivative-byte-equivalence@1'&&same(b.consumer,r.consumer)&&b.qualificationSha256===r.qualificationSha256&&b.deliverySha256===d.sha256&&b.qualificationScope==='exact-delivery-bytes-native-eof-1x');
  for(const k of ['qualificationSha256','recipeSha256','manifestSha256','browserReceiptSha256','historicalProvenanceSha256','currentProvenanceSha256','historicalCanonicalSha256','currentCanonicalSha256','deliverySha256','pcmSha256'])need(H.test(b[k]));
  exact(b.currentPins,'sourceSha256,pcmSha256,canonicalSha256,correspondenceSha256,measurementSha256,planSha256,windowSha256,rawSha256');need(Object.values(b.currentPins).every(x=>H.test(x))&&b.currentPins.canonicalSha256===b.currentCanonicalSha256);
  exact(b.sourceSampleRange,'startSample,endSampleExclusive,sampleRate');const range=b.sourceSampleRange;need(range.sampleRate===16000&&Number.isSafeInteger(range.startSample)&&range.startSample>=0&&Number.isSafeInteger(range.endSampleExclusive)&&range.endSampleExclusive>range.startSample&&(range.endSampleExclusive-range.startSample)/range.sampleRate===d.durationSeconds);
  need(await preparationHash(canonical(b))===r.bridgeSha256&&await preparationHash(canonical(r))===v.resultSha256);
  return Object.freeze({kind:'qualified-unit',id:`unit:${v.sourceJobId}:${v.jobId}`,identity:structuredClone(identity),resultSha256:v.resultSha256,delivery:structuredClone(d)});
 };
 return {request:(i,s)=>status(null,i,s,true),status,verify,async play(descriptor,signal){
  const fresh=await verify(await status(descriptor.id,descriptor.identity,signal),descriptor.identity);need(fresh.resultSha256===descriptor.resultSha256);
  return withPreparationTimeout(signal,async signal=>{const response=await fetcher(fresh.delivery.url,{credentials:'same-origin',redirect:'error',cache:'no-store',signal});const bytes=await readVerifiedMedia(response,{...fresh.delivery,group:'audio'},{signal});return {bytes,mime:'audio/wav',playback:'whole-file-native-ended'};});
 }};
}
