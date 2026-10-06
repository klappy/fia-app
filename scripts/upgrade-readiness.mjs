// Serialized into the upgrade fixture page; no production/runtime imports.
export async function replacementWorkerReady(){
 const registration=await navigator.serviceWorker.getRegistration();
 const active=registration?.active;
 const settled=()=>active?.state==='activated'&&!registration.installing&&!registration.waiting&&registration.active===active&&navigator.serviceWorker.controller===active;
 if(!settled())return false;
 // The pinned old worker rejects DOWNLOAD_STATUS with Unknown offline request;
 // only the replacement supports this protocol. Recheck identity after reply.
 return new Promise(resolve=>{
  const channel=new MessageChannel();let timer;
  const finish=value=>{clearTimeout(timer);channel.port1.close();channel.port2.close();resolve(value);};
  channel.port1.onmessage=event=>finish(event.data?.available===true&&settled());
  timer=setTimeout(()=>finish(false),3000);
  try{active.postMessage({type:'DOWNLOAD_STATUS'},[channel.port2]);}catch{finish(false);}
 });
}
