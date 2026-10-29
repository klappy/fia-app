// Verified visual ownership is independent of the audio playback owner.
// F9: the same owner also carries a server-declared visual (SOURCE-TO-APP L87-L99). A request with
// `prepare` first asks the server once (one POST per deliberate action), which answers the ready path
// and sha; the bytes are then read and verified exactly like any other visual. `preparing` names that
// first step, `loading` the byte read, and an `unavailable` answer is final for this view.
export function createVisualDelivery({fetch,create,revoke,publish}){
 let generation=0,pending=null,entries=new Map(),error=null;
 const emit=()=>publish({entries:new Map(entries),loading:pending?.path||null,preparing:pending?.preparing?pending.path:null,error});
 function cancel(){generation++;pending?.controller.abort();pending=null;error=null;emit();}
 function retain(paths){const keep=new Set(paths);if(pending&&!keep.has(pending.path))cancel();for(const [path,entry] of entries)if(!keep.has(path)){entries.delete(path);revoke(entry.url);}emit();}
 async function load(request){
  const key=`${request.pack.id}:${request.pack.revision}:${request.revision}:${request.path}`;
  if(entries.get(request.path)?.key===key)return;
  if(error?.key===key&&error.identity===request.identity)return;
  if(pending?.key===key&&pending.identity===request.identity)return;
  cancel();const owner=++generation,controller=new AbortController();pending={key,path:request.path,identity:request.identity,controller,preparing:typeof request.prepare==='function'};emit();
  try{
   let read=request;
   if(typeof request.prepare==='function'){
    const ready=await request.prepare(controller.signal);if(owner!==generation||controller.signal.aborted)return;
    if(ready?.status==='unavailable'){pending=null;error={key,identity:request.identity,path:request.path,unavailable:true,message:ready.message||null};emit();return;}
    if(typeof ready?.path!=='string'||!/^[a-f0-9]{64}$/.test(ready.sha256??''))throw Error(request.failure||'This visual could not load.');
    read={...request,source:ready.path,sha256:ready.sha256};pending={...pending,preparing:false};emit();
   }
   const result=await fetch(read,controller.signal);if(owner!==generation||controller.signal.aborted)return;
   if(!result.mime?.startsWith('image/'))throw Error('This visual has an invalid media type.');
   const url=create(result);const previous=entries.get(request.path);entries.set(request.path,{key,url});pending=null;emit();if(previous)revoke(previous.url);
  }catch(e){if(owner===generation&&!controller.signal.aborted){pending=null;error={key,identity:request.identity,path:request.path,message:request.failure||e.message};emit();}}
 }
 function clear(){cancel();for(const entry of entries.values())revoke(entry.url);entries.clear();emit();}
 return {load,cancel,retain,clear,retry(){error=null;emit();}};
}
