// One verified video payload owner. Native presentation retains its mounted URL externally.
export function createVideoDelivery({fetch,create,revoke,publish}){
 let generation=0,pending=null,entry=null,error=null;
 const emit=()=>publish({entry,loading:!!pending,error});
 function cancel(){generation++;pending?.abort();pending=null;emit();}
 function clear(){cancel();const old=entry;entry=null;error=null;emit();if(old)revoke(old.url);}
 async function load(request){
  if(!Number.isSafeInteger(request.file?.bytes)||request.file.bytes<=0||request.file.bytes>16777216)throw Error('Video exceeds the16 MiB app limit.');
  const key=JSON.stringify([request.pack.id,request.pack.revision,request.revision,request.path,request.identity]);
  if(entry?.key===key)return entry.url;
  clear();const owner=++generation,controller=new AbortController();pending=controller;emit();
  try{const result=await fetch(request,controller.signal);if(owner!==generation||controller.signal.aborted)return null;
   if(result.mime!=='video/mp4'||result.bytes.byteLength!==request.file.bytes)throw Error('Verified video identity mismatch.');
   const url=create(result);entry={key,path:request.path,url};pending=null;emit();return url;
  }catch(e){if(owner!==generation||controller.signal.aborted)return null;pending=null;error=e.message;emit();throw e;}
 }
 return {load,cancel,clear};
}
