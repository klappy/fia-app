export function eligible(activity) {
  const a = activity.audio;
  return a?.status === 'available' && a.applicability === 'accepted' &&
    a.activityId === activity.id && a.textSha256 === activity.textSha256 &&
    typeof a.src === 'string' && /^[a-f0-9]{64}$/.test(a.fileSha256 || '');
}
export function restore(bundle, saved) {
  const index = saved?.bundleId === bundle.id && saved?.revision === bundle.revision
    ? bundle.activities.findIndex(a => a.id === saved.activityId) : 0;
  return {index: Math.max(0,index), automatic: saved?.automatic === true, playing:false, token:0, notice:saved && (saved.bundleId!==bundle.id || saved.revision!==bundle.revision) ? 'This is a new text bundle. Your previous position remains saved separately.' : ''};
}
export function snapshot(bundle, state) {
  return {bundleId:bundle.id,revision:bundle.revision,activityId:bundle.activities[state.index].id,automatic:state.automatic};
}
export function transition(bundle, state, action) {
  const current=bundle.activities[state.index];
  if (action.type==='open-view' || action.type==='close-view') return {...state,view:action.type==='close-view' ? null : action.view,playing:false,token:state.token+1};
  if (action.type==='language') return {...state,notice: action.language==='en' ? 'English is active.' : 'Spanish is unavailable in this bundled preview. English remains active.'};
  if (action.type==='automatic') return {...state,automatic:action.value};
  if (action.type==='play') return eligible(current) ? {...state,playing:true,token:state.token+1,notice:''} : {...state,notice:current.audio?.reason || 'Audio unavailable.'};
  if (action.type==='pause') return {...state,playing:false,token:state.token+1};
  if (action.type==='ended' || action.type==='failed') {
    if (action.token!==state.token || !state.playing) return state;
    return {...state,playing:false,token:state.token+1,notice:action.type==='failed' ? 'Audio could not play. Read the text or try Play again.' : (current.kind==='discussion' ? 'Take your time. Continue when your group is ready.' : '')};
  }
  if (action.type==='next' && state.index===bundle.activities.length-1) return {...state,reachedEnd:true,playing:false,token:state.token+1,notice:'You have reached the end of the bundled text sequence.'};
  if (action.type==='next' || action.type==='back' || action.type==='jump') {
    const page=pageIndices(bundle,state.index);
    const index=action.type==='jump' ? action.index : action.type==='next' ? Math.max(...page)+1 : Math.min(...page)-1;
    if (!Number.isInteger(index) || index<0 || index>=bundle.activities.length) return state;
    return {...state,index,reachedEnd:false,playing:action.type==='next' && state.automatic && eligible(bundle.activities[index]),token:state.token+1,notice:''};
  }
  return state;
}

export function pageIndices(bundle,index) {
 const id=bundle.activities[index]?.id;
 const list=bundle.lists?.find(l=>l.layout==='together' && [l.introId,...l.itemIds].includes(id));
 return list ? [list.introId,...list.itemIds].map(id=>bundle.activities.findIndex(a=>a.id===id)) : [index];
}
export function positionKey(bundle) {return `fia-v3-bundled-position:${bundle.id}:${bundle.revision}`;}
export function readPosition(bundle,storage) {
 try {return {saved:JSON.parse(storage.getItem(positionKey(bundle)) || storage.getItem('fia-v3-bundled-position') || 'null'),notice:''};}
 catch {return {saved:null,notice:'Saved position is unavailable. Starting silently.'};}
}
export function savePosition(bundle,state,storage) {
 try {storage.setItem(positionKey(bundle),JSON.stringify(snapshot(bundle,state)));return '';}
 catch {return 'Position is kept only for this visit because browser storage is unavailable.';}
}
