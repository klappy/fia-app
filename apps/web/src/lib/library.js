import {titleMarker} from './spanish-coverage.js';
import {createPreparationIntent} from './preparation-intent.js';
import {createExecutionTransport,passageUnreachable} from './execution-transport.js';
import {validateExecutablePresentation} from './executable-presentation.js';
import {createPreparationTransport} from './prepared-audio.js';
import {bundledPresentation} from './content.js';
const empty={status:'unavailable',count:0};
export const bundledPack=Object.freeze({id:'eng.MRK-1-1-13',revision:'ccd72f23c23f932651b500b730b285f32fabd37e50037b5af91d8881f1403975',language:'eng',pericopeId:'MRK-1-1-13',title:'Mark 1:1–13',defaultScriptureId:'scripture-BereanStandardBible',source:'bundled',capabilities:{text:{available:true},guideNarration:{status:'packaged',count:111},scriptureAudio:{status:'packaged',count:3},resourceAudio:{status:'packaged',count:29},generatedAudio:{status:'packaged',count:143},images:{status:'packaged',count:8},video:{status:'packaged',count:3}}});
const validId=id=>/^(eng|spa)\.(?:MRK|LUK)-\d+(?:-\d+)+$/.test(id);
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
// The server's own answer, in the facilitator's words. The code lets the sheet and
// a launch-time restore tell a refusal from a missing connection.
function notOpened(record){
 const [message,code]=record?.status==='unavailable'?['This passage is not available yet.','passage-unavailable']:record?.status==='refused'?['This passage cannot be opened.','passage-refused']:record?.status==='preparing'?['This passage is still being prepared. Try again shortly.','passage-transient']:['This passage could not be loaded.','passage-invalid'];
 return Object.assign(Error(message+' Your current passage stays open.'),{code});
}
export async function selectServerPresentation(id,{explicit=false,signal,transport=executionTransport}={}){
 signal?.throwIfAborted();let record=await transport.readPack(id,{signal});signal?.throwIfAborted();
 if(explicit&&record.offlineSnapshot!=='historical-verified'&&record.preparationDemand){
  const demand=record.preparationDemand;
  const normalize=value=>value.status==='ready'?{status:'ready',record:value.record}:value.status==='preparing'?{status:'preparing',id:value.jobId}:{status:'unavailable'};
  // One observer per selection: no audio-key reconstruction or cross-pack join.
  const observer=createPreparationIntent({request:async(_,owned)=>normalize(await transport.preparePresentation(demand,{signal:owned})),status:async(jobId,_,owned)=>normalize(await transport.readPresentationPreparation(jobId,{signal:owned})),verify:result=>result.record,publish:()=>{}});
  const abort=()=>observer.cancel();signal?.addEventListener('abort',abort,{once:true});
  try{signal?.throwIfAborted();const result=await observer.start(demand,{explicit:true});signal?.throwIfAborted();if(!result)throw Object.assign(Error('This passage could not be loaded. Your current passage stays open.'),{code:'passage-preparation-failed'});record=result.descriptor;}finally{signal?.removeEventListener('abort',abort);observer.cancel();}
 }
 if(record.status!=='ready'||record.packId!==id||record.identity?.packId!==id)throw notOpened(record);
 const identity=record.identity;
 const media=record.execution?.mediaIdentity;
 if(media!==undefined&&(Object.keys(media||{}).sort().join(',')!=='packId,revision'||media.packId!==id||!/^([a-f0-9]{64})$/.test(media.revision)||!/^([a-f0-9]{64})$/.test(record.execution.mediaAssetsSha256)))throw Error('The media identity is invalid.');
 const descriptor={id:record.packId,revision:record.revision,language:identity.language,pericopeId:identity.pericopeId,title:identity.title,defaultScriptureId:identity.defaultScriptureId,capabilities:record.capabilities,diagnostics:record.diagnostics||[],...(record.offlineSnapshot==='historical-verified'?{offlineSnapshot:record.offlineSnapshot}:{}),...(media?{mediaIdentity:media,mediaAssetsSha256:record.execution.mediaAssetsSha256}:{}),presentation:{sha256:record.artifact.sha256,bytes:record.artifact.bytes}};
 if(!descriptor.title||!descriptor.language||!descriptor.capabilities?.text?.available)throw Error('The passage catalog is not compatible.');
 const presentation=await transport.readPresentationRecord(record,{signal});signal?.throwIfAborted();
 return {descriptor,presentation:validatePresentation(presentation,descriptor)};
}
// A launch-time restore is bounded where it is made (R1, R5). Past this bound a saved passage that has
// not answered is a missing connection: the restore stops with that answer and R1's fallback says so.
// The passage languages the catalog offers. `id` is the catalog's ISO 639-3 code (pack.language); `tag` is the BCP 47
// tag passage content carries as its `lang` attribute, so a screen reader reads Spanish text with Spanish rules while the
// interface chrome keeps the page's own language (fia-app-cookbook work/active/2026-11-11-fia-content-lang-attribute).
export const passageLanguages=Object.freeze([{id:'eng',name:'English',nativeName:'English',tag:'en'},{id:'spa',name:'Spanish',nativeName:'Español',tag:'es'}]);
export const contentLang=language=>passageLanguages.find(l=>l.id===language)?.tag;
// Interface chrome (labels, the '[ES needed]' marker) is English: menus are not localized, matching <html lang="en">.
export const INTERFACE_LANG='en';
// The language an asset's own text is actually shown in. A title or key term the compiler marked as not yet in the passage
// language shows its fallback (asset.titleProvenance.fallback, a catalog code) beside the English marker, so it carries that
// fallback's tag (the interface language when the fallback is unnamed); otherwise it is in the passage language. Titles
// only: a fallback-titled key term's body text is still in the passage language.
export const assetLang=(asset,passageLang)=>titleMarker(asset)?(contentLang(asset?.titleProvenance?.fallback)||INTERFACE_LANG):passageLang;
export const RESTORE_TIMEOUT_MS=15000;
export const restoreUnreachable=passageUnreachable;
export function mediaSelection(pack){return {packId:pack.id,revision:pack.revision,...(pack.mediaIdentity?{mediaIdentity:{...pack.mediaIdentity},mediaAssetsSha256:pack.mediaAssetsSha256}:{})};}
export const libraryAdapter={
 playBoundAudio:(...args)=>executionTransport.playBoundAudio(...args),
 prepareOriginal:(...args)=>executionTransport.prepareOriginal(...args),
 prepareRecording:preparationTransport.request,
 preparationStatus:preparationTransport.status,
 verifyPreparedRecording:preparationTransport.verify,
 playPreparedRecording:preparationTransport.play,
 async languages(){const c=await fetchCatalog();return passageLanguages.map(l=>({...l,ready:c.packs.filter(p=>p.language===l.id).length}));},
 async passages(language){return (await fetchCatalog()).packs.filter(p=>p.language===language);},
 select:selectServerPresentation,
 async mediaStatus(pack=bundledPack){return workerRequest('MEDIA_STATUS',mediaSelection(pack));},
 async playMedia(pack,path,deliveryRevision,signal,size){const requestId=crypto.randomUUID();const cancel=()=>{workerRequest('MEDIA_CANCEL',{packId:pack.id,requestId}).catch(()=>{});};if(signal.aborted)throw Error('Playback canceled.');signal.addEventListener('abort',cancel,{once:true});try{const result=await workerRequest('MEDIA_PLAY',{...mediaSelection(pack),path,deliveryRevision,requestId,size});if(signal.aborted)throw Error('Playback canceled.');return result;}catch(error){cancel();throw error;}finally{signal.removeEventListener('abort',cancel);}},
 async downloadStatus(pack=bundledPack){return workerRequest('DOWNLOAD_STATUS',{packId:pack.id});},
 async download(selection,onprogress,pack=bundledPack,sizes={}){return workerRequest('DOWNLOAD_START',{selection,...mediaSelection(pack),sizes:sizes&&typeof sizes==='object'&&!Array.isArray(sizes)?{...sizes}:sizes},onprogress);},
 async pauseDownload(pack=bundledPack){return workerRequest('DOWNLOAD_PAUSE',{packId:pack.id});},
 async removeDownload(pack=bundledPack){return workerRequest('DOWNLOAD_REMOVE',{packId:pack.id});},
 activate(pack){const selection=mediaSelection(pack);activationQueue=activationQueue.catch(()=>{}).then(()=>workerRequest('PACK_SELECT',selection));return activationQueue;},
};
export function formatBytes(bytes){return Number.isFinite(bytes)?`${(bytes/1024/1024).toFixed(1)} MB`:'Size unavailable';}
// When the page's own registration shows that no worker is on its way (blocked, rejected, or its
// install failed with none active), waiting requests end now with the not-ready answer instead of
// at the ready timeout, so the easy button's check ends with the truth rather than a long pulse.
const notReady=()=>new Error('Download storage is not ready. Reload the published Site and try again.');
let noWorker;const workerAbsent=new Promise((_,reject)=>noWorker=()=>reject(notReady()));workerAbsent.catch(()=>{});
export async function registerWorker(url){
 const container=navigator.serviceWorker;
 const absentUnlessActive=()=>Promise.resolve().then(()=>container.getRegistration()).then(r=>{if(!r?.active)noWorker();},noWorker);
 let registration;try{registration=await container.register(url);}catch(error){absentUnlessActive();throw error;}
 // A failed worker's 'redundant' statechange can run before registration.installing is cleared, so the
 // failed worker itself counts as gone. No worker is coming only when no other pending worker remains;
 // every pending worker, and a newer one that replaces it, is watched.
 const pendingOthers=worker=>[registration.installing,registration.waiting].filter(next=>next&&next!==worker&&next.state!=='redundant');
 const watch=worker=>worker.addEventListener('statechange',()=>{if(worker.state==='redundant'&&!registration.active&&!pendingOthers(worker).length)noWorker();});
 const pending=[registration?.installing,registration?.waiting].filter(Boolean);
 if(!registration?.active){if(!pending.length)noWorker();else{pending.forEach(watch);registration.addEventListener('updatefound',()=>{if(registration.installing)watch(registration.installing);});}}
 return registration;
}
async function workerRequest(type,data={},onprogress){
 if(!('serviceWorker' in navigator))throw new Error('Downloads are unavailable in this browser.');
 let readyTimer;
 const registration=await Promise.race([navigator.serviceWorker.ready,workerAbsent,new Promise((_,reject)=>{readyTimer=setTimeout(()=>reject(notReady()),10000);})]).finally(()=>clearTimeout(readyTimer));
 if(!registration.active)throw new Error('Download storage is not ready. Reload and try again.');
 // A post that reaches the old worker after its hand-over has begun restarts it and holds the new
 // worker at 'installed' until the next navigation. While a worker is installing or waiting, wait
 // (bounded) for the hand-over and post to the worker that is then active; on timeout, post as before.
 // Cancel commands (CANCEL_TARGETS) are not held: the old worker owns the in-flight job they stop, and a
 // cancel first drops any job it targets that is still held, so the job never starts on the new worker.
 // A newer worker that replaces a watched one (updatefound) is watched too, as registerWorker does.
 const pendingWorkers=()=>[registration.installing,registration.waiting].filter(w=>w&&!['activating','activated','redundant'].includes(w.state));
 if(type in CANCEL_TARGETS)for(const held of heldRequests)if(CANCEL_TARGETS[type].matches(held,data))held.cancel(CANCEL_TARGETS[type].message);
 if(!(type in CANCEL_TARGETS)&&pendingWorkers().length)await new Promise((resolve,reject)=>{
  const container=navigator.serviceWorker,watched=new Set(),held={type,data,cancel:message=>{done();reject(new Error(message));}};let handoverTimer,released=false;heldRequests.add(held);
  const watch=w=>{if(w&&!watched.has(w)){watched.add(w);w.addEventListener?.('statechange',check);}};
  const found=()=>{watch(registration.installing);check();};
  const done=()=>{if(released)return;released=true;heldRequests.delete(held);clearTimeout(handoverTimer);container.removeEventListener?.('controllerchange',check);registration.removeEventListener?.('updatefound',found);watched.forEach(w=>w.removeEventListener?.('statechange',check));};
  const check=()=>{if(!pendingWorkers().length&&!released){done();resolve();}};
  handoverTimer=setTimeout(()=>{done();resolve();},10000);container.addEventListener?.('controllerchange',check);registration.addEventListener?.('updatefound',found);pendingWorkers().forEach(watch);
 });
 const target=registration.active;
 if(!target)throw new Error('Download storage is not ready. Reload and try again.');
 return new Promise((resolve,reject)=>{
  const channel=new MessageChannel();let timer;
  const close=()=>{clearTimeout(timer);channel.port1.close();};
  const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>{close();reject(new Error('Download stopped responding. Reopen Downloads to check and resume.'));},45000);};
  channel.port1.onmessage=({data:result})=>{arm();if(result.progress){onprogress?.(result.progress);return;}close();if(result.ok)resolve(result);else{const error=new Error(result.error||'Download could not finish. Retry to keep verified files.');if(type==='MEDIA_STATUS')error.code=['media-status-transient','media-status-invalid'].includes(result.code)?result.code:'media-status-invalid';reject(error);}};
  arm();try{target.postMessage({type,...data},[channel.port2]);}catch(error){close();channel.port2.close();reject(error);}
 });
}
// Every page→worker cancel command, with the held job type it stops (sw.js DOWNLOAD_PAUSE / MEDIA_CANCEL
// handlers). A new cancel-type message must join this list, or the hand-over hold will delay it.
const CANCEL_TARGETS={
 DOWNLOAD_PAUSE:{matches:(held,cancel)=>held.type==='DOWNLOAD_START'&&held.data.packId===cancel.packId,message:'Download paused. Verified files are kept for Resume.'},
 MEDIA_CANCEL:{matches:(held,cancel)=>held.type==='MEDIA_PLAY'&&held.data.requestId===cancel.requestId,message:'Playback canceled.'},
};
const heldRequests=new Set();

export const hasUnresolvedInstructions=pack=>(pack.diagnostics||[]).some(d=>['conservative-continuation','unresolved-resource-link'].includes(d.code));
