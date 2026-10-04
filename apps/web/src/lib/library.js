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
 const approved=descriptor.id===bundledPack.id&&pack.id==='fia-mark-authentic@1';
 if(!pack||!approved&&pack.id!==descriptor.id||!pack.assets||!Array.isArray(pack.activities)||!pack.activities.length||!Array.isArray(pack.sections)||!Array.isArray(pack.listContracts)||!pack.assets[descriptor.defaultScriptureId]||pack.assets[descriptor.defaultScriptureId].kind!=='scripture')throw new Error('The passage presentation is not compatible.');
 const ids=new Set(),sections=new Set(pack.sections.map(s=>s.id));
 for(const a of pack.activities){if(!a.id||ids.has(a.id)||!sections.has(a.sectionId)||a.assetId&&!pack.assets[a.assetId]||!['auto','confirm','media'].includes(a.completion))throw new Error('The passage has an invalid activity.');ids.add(a.id);}
 for(const g of pack.listContracts)if(!ids.has(g.introId)||!Array.isArray(g.itemIds)||g.itemIds.some(id=>!ids.has(id)))throw new Error('The passage grouping is incomplete.');
 return pack;
}
let catalogPromise;
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
export const libraryAdapter={
 async languages(){const c=await fetchCatalog();return [{id:'eng',name:'English',nativeName:'English'},{id:'spa',name:'Spanish',nativeName:'Español'}].map(l=>({...l,ready:c.packs.filter(p=>p.language===l.id).length}));},
 async passages(language){return (await fetchCatalog()).packs.filter(p=>p.language===language);},
 async select(id){const descriptor=(await fetchCatalog()).packs.find(p=>p.id===id);if(!descriptor)throw new Error('This passage is not available.');return {descriptor,presentation:await loadPresentation(descriptor)};},
 async downloadStatus(pack=bundledPack){return workerRequest('DOWNLOAD_STATUS',{packId:pack.id});},
 async download(selection,onprogress,pack=bundledPack){return workerRequest('DOWNLOAD_START',{selection,packId:pack.id},onprogress);},
 async pauseDownload(pack=bundledPack){return workerRequest('DOWNLOAD_PAUSE',{packId:pack.id});},
 async removeDownload(pack=bundledPack){return workerRequest('DOWNLOAD_REMOVE',{packId:pack.id});},
 async activate(pack){return workerRequest('PACK_SELECT',{packId:pack.id,revision:pack.revision});},
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
  channel.port1.onmessage=({data:result})=>{arm();if(result.progress){onprogress?.(result.progress);return;}close();result.ok?resolve(result):reject(new Error(result.error||'Download could not finish. Retry to keep verified files.'));};
  arm();registration.active.postMessage({type,...data},[channel.port2]);
 });
}
