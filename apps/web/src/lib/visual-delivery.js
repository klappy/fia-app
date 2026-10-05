// Verified visual ownership is independent of the audio playback owner.
export function createVisualDelivery({fetch,create,revoke,publish}){
 let generation=0,pending=null,entries=new Map(),error=null;
 const emit=()=>publish({entries:new Map(entries),loading:pending?.path||null,error});
 function cancel(){generation++;pending?.controller.abort();pending=null;error=null;emit();}
 function retain(paths){const keep=new Set(paths);if(pending&&!keep.has(pending.path))cancel();for(const [path,entry] of entries)if(!keep.has(path)){entries.delete(path);revoke(entry.url);}emit();}
 async function load(request){
  const key=`${request.pack.id}:${request.pack.revision}:${request.revision}:${request.path}`;
  if(entries.get(request.path)?.key===key)return;
  if(pending?.key===key&&pending.identity===request.identity)return;
  cancel();const owner=++generation,controller=new AbortController();pending={key,path:request.path,identity:request.identity,controller};emit();
  try{const result=await fetch(request,controller.signal);if(owner!==generation||controller.signal.aborted)return;
   if(!result.mime?.startsWith('image/'))throw Error('This visual has an invalid media type.');
   const url=create(result);const previous=entries.get(request.path);entries.set(request.path,{key,url});pending=null;emit();if(previous)revoke(previous.url);
  }catch(e){if(owner===generation&&!controller.signal.aborted){pending=null;error={path:request.path,message:e.message};emit();}}
 }
 function clear(){cancel();for(const entry of entries.values())revoke(entry.url);entries.clear();emit();}
 return {load,cancel,retain,clear};
}
