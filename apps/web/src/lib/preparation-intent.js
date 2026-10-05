// Local preparation intent ownership. Transport and descriptor verification are
// injected so durable server jobs never become owned by a browser's abort signal.
export function preparationIdentity(pack,activity,quality='original'){
 const sha=/^[a-f0-9]{64}$/;
 if(!pack?.id||!sha.test(pack.revision)||!pack.language||!activity?.id||!activity.sourceUnitId||!sha.test(activity.sourceSha256)||!['original','small','medium','large'].includes(quality))throw Error('This instruction has no preparation identity.');
 return Object.freeze({packId:pack.id,presentationRevision:pack.revision,language:pack.language,edition:'fia-guide',activityId:activity.id,sourceUnitId:activity.sourceUnitId,sourceTextSha256:activity.sourceSha256,quality});
}
export function preparationKey(identity){return JSON.stringify(['packId','presentationRevision','language','edition','activityId','sourceUnitId','sourceTextSha256','quality'].map(k=>identity[k]));}
export function createPreparationIntent({request,status,verify,publish,wait=(ms,signal)=>new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(Error('Preparation observation canceled.'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});}),intervalMs=1500,maxPolls=20}){
 let generation=0,controller=null,current=null,pending=null;
 const emit=value=>{current=value;publish(value);};
 function cancel(){generation++;controller?.abort();controller=null;pending=null;if(current?.status==='preparing')emit({...current,status:'idle',message:'Preparation may continue. Press Play to check again.'});}
 function clear(){cancel();emit(null);}
 function start(identity,{explicit=false}={}){
  if(!explicit)return Promise.reject(Error('Preparation requires explicit Play.'));
  const key=preparationKey(identity);
  if(pending&&current?.key===key)return pending;
  cancel();const owner=generation;controller=new AbortController();const signal=controller.signal;
  emit({key,identity,status:'preparing',message:'Preparing this recording. You can continue without waiting.'});
  const own=()=>owner===generation&&!signal.aborted;
  pending=(async()=>{
   try{
    let result=await request(identity,signal),immediate=true;
    for(let poll=0;;poll++){
     if(!own())return null;
     if(result.status==='ready'){
      const descriptor=await verify(result,identity,signal);if(!own())return null;
      emit({key,identity,status:'ready',descriptor,message:'Recording ready. Press Play to listen.'});
      return {descriptor,immediate};
     }
     if(result.status==='unavailable'){emit({key,identity,status:'unavailable',message:result.message||'This recording is unavailable. You can continue.'});return null;}
     if(result.status==='failed'){emit({key,identity,status:'failed',message:result.message||'Preparation failed. Press Play to retry, or continue.'});return null;}
     if(result.status!=='preparing'||typeof result.id!=='string'||!result.id)throw Error('Invalid preparation status.');
     if(poll>=maxPolls){emit({key,identity,status:'idle',message:'Still preparing. Press Play to check again, or continue.'});return null;}
     await wait(intervalMs,signal);if(!own())return null;result=await status(result.id,identity,signal);immediate=false;
    }
   }catch(error){if(own())emit({key,identity,status:'failed',message:error.message||'Preparation could not be checked. Press Play to retry.'});return null;}
   finally{if(own()){controller=null;pending=null;}}
  })();
  return pending;
 }
 return {start,cancel,clear,get current(){return current;}};
}
