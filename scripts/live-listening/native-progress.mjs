// Observes native snapshots; never writes a media clock or substitutes synthetic playback.
export async function observeNativeProgress({snapshot,range,onSample=()=>{},timeoutMs=10000,intervalMs=100,now=Date.now,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(![range?.startSeconds,range?.endSeconds].every(Number.isFinite)||range.endSeconds<=range.startSeconds)throw Error('Invalid canonical range');
 const deadline=now()+timeoutMs;let before=null,owner=-1;
 while(now()<deadline){const after=await snapshot();onSample({at:now(),media:after});const active=after.map((a,i)=>({a,i})).filter(x=>!x.a.paused);if(active.length>1)throw Error('Multiple native owners');
  if(before&&active.length===1&&(active[0].i!==owner||active[0].a.src!==before[owner].src))throw Error('Native owner/source changed');
  const current=active[0];if(current&&current.a.readyState>=2&&current.a.playing===true&&!current.a.seeking&&current.a.src&&Number.isFinite(current.a.time)){
   if(current.a.time>range.endSeconds)throw Error('Native clock beyond canonical range');
   if(current.a.time>=range.startSeconds){if(!before){before=after;owner=current.i;}else if(current.a.time-before[owner].time>=0.25)return {before,after,owner};}
  }
  await wait(intervalMs);
 }
 throw Error('Native clock did not advance 0.25 seconds within canonical range before deadline');
}
