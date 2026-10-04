/** Prototype adapter. This catalog describes local availability, not server readiness.
 * Production must implement this interface with validated compiled v3 packs. */
export const bundledPack = Object.freeze({id:'fia-mark-authentic',revision:'1',language:'eng',title:'Mark 1:1–13',status:'ready',source:'bundled',description:'Complete six-stage passage · English'});
export const libraryAdapter = {
 async languages(){return [{id:'eng',name:'English',nativeName:'English',ready:1},{id:'spa',name:'Spanish',nativeName:'Español',ready:0}];},
 async passages(language){return language==='eng'?[bundledPack]:[];},
 async select(id){if(id!==bundledPack.id)throw new Error('This passage is not available in this prototype.');return bundledPack;},
 async downloadStatus(){return workerRequest('DOWNLOAD_STATUS');},
 async download(selection,onprogress){return workerRequest('DOWNLOAD_START',{selection},onprogress);},
 async pauseDownload(){return workerRequest('DOWNLOAD_PAUSE');},
 async removeDownload(){return workerRequest('DOWNLOAD_REMOVE');},
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
