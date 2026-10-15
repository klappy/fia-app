// One verified video payload owner. Native presentation retains its mounted URL externally.
// The service worker re-chooses the file on every play; the page's request may come from an older snapshot.
// Playback follows the served identity and reports the change through onchange; it never blocks on it.
export function createVideoDelivery({fetch,create,revoke,publish,onchange=()=>{}}){
 let generation=0,pending=null,entry=null,error=null;
 const emit=()=>publish({entry,loading:!!pending,error});
 function cancel(){generation++;pending?.abort();pending=null;emit();}
 function clear(){cancel();const old=entry;entry=null;error=null;emit();if(old)revoke(old.url);}
 const keyOf=(r,id)=>JSON.stringify([r.pack.id,r.pack.revision,r.revision,r.path,r.identity,id.sha256,id.bytes]);
 async function load(request){
  if(!Number.isSafeInteger(request.file?.bytes)||request.file.bytes<=0||request.file.bytes>16777216)throw Error('Video exceeds the16 MiB app limit.');
  const key=keyOf(request,request.file);
  if(entry?.keys.includes(key))return entry.url;
  clear();const owner=++generation,controller=new AbortController();pending=controller;emit();
  try{const result=await fetch(request,controller.signal);if(owner!==generation||controller.signal.aborted)return null;
   const size=result.bytes?.byteLength;
   if(result.mime!=='video/mp4'||!Number.isSafeInteger(size)||size<=0||size>16777216||result.file&&result.file.path!==request.path)throw Error('This video can’t play right now. Try again or continue without it.');
   if(result.file&&result.file.bytes!==size)throw Error('This video didn’t finish loading. Try again.');
   const served=result.file||{sha256:request.file.sha256,bytes:size},notes=result.notes||[];
   const changed=served.sha256!==request.file.sha256||served.bytes!==request.file.bytes;
   const url=create(result);entry={keys:[key,keyOf(request,served)],path:request.path,url};pending=null;emit();
   if(changed||notes.length)try{onchange({path:request.path,requested:{sha256:request.file.sha256,bytes:request.file.bytes},served:{sha256:served.sha256,bytes:served.bytes},notes});}catch{}
   return url;
  }catch(e){if(owner!==generation||controller.signal.aborted)return null;pending=null;error=e.message;emit();throw e;}
 }
 return {load,cancel,clear};
}
