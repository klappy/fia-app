import {createPreparationIntent} from './preparation-intent.js';
import {createExecutionTransport} from './execution-transport.js';
import {validateExecutablePresentation} from './executable-presentation.js';
import {createPreparationTransport} from './prepared-audio.js';
import {bundledPresentation} from './content.js';
const empty={status:'unavailable',count:0};
export const bundledPack=Object.freeze({id:'eng.MRK-1-1-13',revision:'ccd72f23c23f932651b500b730b285f32fabd37e50037b5af91d8881f1403975',language:'eng',pericopeId:'MRK-1-1-13',title:'Mark 1:1–13',defaultScriptureId:'scripture-BereanStandardBible',source:'bundled',capabilities:{text:{available:true},guideNarration:{status:'packaged',count:111},scriptureAudio:{status:'packaged',count:3},resourceAudio:{status:'packaged',count:29},generatedAudio:{status:'packaged',count:143},images:{status:'packaged',count:8},video:{status:'packaged',count:3}}});
const validId=id=>/^(eng|spa)\.MRK-\d+(?:-\d+)+$/.test(id);
export function validateRegistry(value){
 if(value?.schemaVersion!==1||!Array.isArray(value.packs)||!value.packs.length)throw new Error('The passage catalog is not compatible.');
 const seen=new Set();for(const p of value.packs){
  if(!validId(p.id)||seen.has(p.id)||p.language!==p.id.slice(0,3)||!p.title||!p.defaultScriptureId||!/^([a-f0-9]{64})$/.test(p.revision)||p.presentation?.sha256!==p.revision||p.presentation.url!==`/content/packs/${p.id}/${p.revision}.json`||!Number.isSafeInteger(p.presentation.bytes)||p.presentation.bytes<=0||p.capabilities?.text?.available!==true)throw new Error('The passage catalog contains an invalid entry.');
  for(const key of ['guideNarration','scriptureAudio','resourceAudio','generatedAudio','images','video']){const c=p.capabilities[key];if(!c||!['unavailable','source-referenced','packaged'].includes(c.status)||!Number.isSafeInteger(c.count)||c.count<0||c.status==='unavailable'&&c.count!==0)throw new Error('The passage capabilities are invalid.');}
  seen.add(p.id);
 }return value;
}
export function validatePresentation(pack,descriptor){
 validateExecutablePresentation(pack);
 const approved=descriptor.id===bundledPack.id&&pack.id==='fia-mark-authentic@1';
 if(!pack||!approved&&pack.id!==descriptor.id||!pack.assets||!Array.isArray(pack.activities)||!pack.activities.length||!Array.isArray(pack.sections)||!Array.isArray(pack.listContracts)||!pack.assets[descriptor.defaultScriptureId]||pack.assets[descriptor.defaultScriptureId].kind!=='scripture')throw new Error('The passage presentation is not compatible.');
 const ids=new Set(),sections=new Set(pack.sections.map(s=>s.id));
 for(const a of pack.activities){if(!a.id||ids.has(a.id)||!sections.has(a.sectionId)||a.assetId&&!pack.assets[a.assetId]||!['auto','confirm','media'].includes(a.completion))throw new Error('The passage has an invalid activity.');ids.add(a.id);}
 for(const g of pack.listContracts)if(!ids.has(g.introId)||!Array.isArray(g.itemIds)||g.itemIds.some(id=>!ids.has(id)))throw new Error('The passage grouping is incomplete.');
 return pack;
}
let catalogPromise;
let activationQueue=Promise.resolve();
export async function fetchCatalog(){
 if(!catalogPromise)catalogPromise=fetch('/content/registry.json').then(async r=>{if(!r.ok)throw new Error('The passage catalog is unavailable. Your current passage stays open.');return validateRegistry(await r.json());}).catch(error=>{catalogPromise=null;throw error;});
 return catalogPromise;
}
export async function loadPresentation(descriptor){
 const response=await fetch(descriptor.presentation.url);if(!response.ok)throw new Error('This passage could not be loaded. Your current passage stays open.');
 const bytes=await response.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 if(bytes.byteLength!==descriptor.presentation.bytes||hash!==descriptor.presentation.sha256)throw new Error('This passage could not be verified. Your current passage stays open.');
 return validatePresentation(JSON.parse(new TextDecoder().decode(bytes)),descriptor);
}
const preparationTransport=createPreparationTransport();
const executionTransport=createExecutionTransport({fetch:(...args)=>fetch(...args)});
export async function selectServerPresentation(id,{explicit=false,signal,transport=executionTransport}={}){
 signal?.throwIfAborted();let record=await transport.readPack(id,{signal});signal?.throwIfAborted();
 if(explicit&&record.offlineSnapshot!=='historical-verified'&&record.preparationDemand){
  const demand=record.preparationDemand;
  const normalize=value=>value.status==='ready'?{status:'ready',record:value.record}:value.status==='preparing'?{status:'preparing',id:value.jobId}:{status:'unavailable'};
  // One observer per selection: no audio-key reconstruction or cross-pack join.
  const observer=createPreparationIntent({request:async(_,owned)=>normalize(await transport.preparePresentation(demand,{signal:owned})),status:async(jobId,_,owned)=>normalize(await transport.readPresentationPreparation(jobId,{signal:owned})),verify:result=>result.record,publish:()=>{}});
  const abort=()=>observer.cancel();signal?.addEventListener('abort',abort,{once:true});
  try{signal?.throwIfAborted();const result=await observer.start(demand,{explicit:true});signal?.throwIfAborted();if(!result)throw Error('This passage could not be loaded. Your current passage stays open.');record=result.descriptor;}finally{signal?.removeEventListener('abort',abort);observer.cancel();}
 }
 if(record.status!=='ready'||record.packId!==id||record.identity?.packId!==id)throw Error('This passage could not be loaded. Your current passage stays open.');
 const identity=record.identity;
 const media=record.execution?.mediaIdentity;
 if(media!==undefined&&(Object.keys(media||{}).sort().join(',')!=='packId,revision'||media.packId!==id||!/^([a-f0-9]{64})$/.test(media.revision)||!/^([a-f0-9]{64})$/.test(record.execution.mediaAssetsSha256)))throw Error('The media identity is invalid.');
 const descriptor={id:record.packId,revision:record.revision,language:identity.language,pericopeId:identity.pericopeId,title:identity.title,defaultScriptureId:identity.defaultScriptureId,capabilities:record.capabilities,diagnostics:record.diagnostics||[],...(record.offlineSnapshot==='historical-verified'?{offlineSnapshot:record.offlineSnapshot}:{}),...(media?{mediaIdentity:media,mediaAssetsSha256:record.execution.mediaAssetsSha256}:{}),presentation:{sha256:record.artifact.sha256,bytes:record.artifact.bytes}};
 if(!descriptor.title||!descriptor.language||!descriptor.capabilities?.text?.available)throw Error('The passage catalog is not compatible.');
 const presentation=await transport.readPresentationRecord(record,{signal});signal?.throwIfAborted();
 return {descriptor,presentation:validatePresentation(presentation,descriptor)};
}
export function mediaSelection(pack){return {packId:pack.id,revision:pack.revision,...(pack.mediaIdentity?{mediaIdentity:pack.mediaIdentity,mediaAssetsSha256:pack.mediaAssetsSha256}:{})};}
export const libraryAdapter={
 playBoundAudio:(...args)=>executionTransport.playBoundAudio(...args),
 prepareOriginal:(...args)=>executionTransport.prepareOriginal(...args),
 prepareRecording:preparationTransport.request,
 preparationStatus:preparationTransport.status,
 verifyPreparedRecording:preparationTransport.verify,
 playPreparedRecording:preparationTransport.play,
 async languages(){const c=await fetchCatalog();return [{id:'eng',name:'English',nativeName:'English'},{id:'spa',name:'Spanish',nativeName:'Español'}].map(l=>({...l,ready:c.packs.filter(p=>p.language===l.id).length}));},
 async passages(language){return (await fetchCatalog()).packs.filter(p=>p.language===language);},
 select:selectServerPresentation,
 async mediaStatus(pack=bundledPack){return workerRequest('MEDIA_STATUS',mediaSelection(pack));},
 async playMedia(pack,path,deliveryRevision,signal,size){const requestId=crypto.randomUUID();const cancel=()=>{workerRequest('MEDIA_CANCEL',{packId:pack.id,requestId}).catch(()=>{});};if(signal.aborted)throw Error('Playback canceled.');signal.addEventListener('abort',cancel,{once:true});try{const result=await workerRequest('MEDIA_PLAY',{...mediaSelection(pack),path,deliveryRevision,requestId,size});if(signal.aborted)throw Error('Playback canceled.');return result;}catch(error){cancel();throw error;}finally{signal.removeEventListener('abort',cancel);}},
 async downloadStatus(pack=bundledPack){return workerRequest('DOWNLOAD_STATUS',{packId:pack.id});},
 async download(selection,onprogress,pack=bundledPack,sizes={}){return workerRequest('DOWNLOAD_START',{selection,...mediaSelection(pack),sizes},onprogress);},
 async pauseDownload(pack=bundledPack){return workerRequest('DOWNLOAD_PAUSE',{packId:pack.id});},
 async removeDownload(pack=bundledPack){return workerRequest('DOWNLOAD_REMOVE',{packId:pack.id});},
 activate(pack){const selection=mediaSelection(pack);activationQueue=activationQueue.catch(()=>{}).then(()=>workerRequest('PACK_SELECT',selection));return activationQueue;},
};
export function formatBytes(bytes){return Number.isFinite(bytes)?`${(bytes/1024/1024).toFixed(1)} MB`:'Size unavailable';}
async function workerRequest(type,data={},onprogress){
 if(!('serviceWorker' in navigator))throw new Error('Downloads are unavailable in this browser.');
 let readyTimer;
 const registration=await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{readyTimer=setTimeout(()=>reject(new Error('Download storage is not ready. Reload the published Site and try again.')),10000);})]).finally(()=>clearTimeout(readyTimer));
 if(!registration.active)throw new Error('Download storage is not ready. Reload and try again.');
 return new Promise((resolve,reject)=>{
  const channel=new MessageChannel();let timer;
  const close=()=>{clearTimeout(timer);channel.port1.close();};
  const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>{close();reject(new Error('Download stopped responding. Reopen Downloads to check and resume.'));},45000);};
  channel.port1.onmessage=({data:result})=>{arm();if(result.progress){onprogress?.(result.progress);return;}close();if(result.ok)resolve(result);else{const error=new Error(result.error||'Download could not finish. Retry to keep verified files.');if(type==='MEDIA_STATUS')error.code=['media-status-transient','media-status-invalid'].includes(result.code)?result.code:'media-status-invalid';reject(error);}};
  arm();registration.active.postMessage({type,...data},[channel.port2]);
 });
}

export const hasUnresolvedInstructions=pack=>(pack.diagnostics||[]).some(d=>['conservative-continuation','unresolved-resource-link'].includes(d.code));
