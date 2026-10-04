import {createSession} from './engine.js';
export const LEGACY_STORE='fia-v3-session@2';
const key=pack=>`fia-v3-progress@1:${pack.id}`;
const DEVICE='fia-v3-preferences@1';
export function saveProgress(storage,pack,activities,value){
 const {session,...device}=value;
 storage.setItem(key(pack),JSON.stringify({total:activities.length,revision:pack.revision,activityId:activities[session.index]?.id,session,transitionSection:value.transitionSection,termDefinition:value.termDefinition}));
 storage.setItem(DEVICE,JSON.stringify({...device,preferences:session.preferences}));
 // Compatibility receipt for existing prototype tooling; never used across packs.
 if(['fia-mark-authentic','eng.MRK-1-1-13'].includes(pack.id))storage.setItem(LEGACY_STORE,JSON.stringify(value));
}
export function restoreProgress(storage,pack,activities,assets=null){
 const legacy=['fia-mark-authentic','eng.MRK-1-1-13'].includes(pack.id)?JSON.parse(storage.getItem(LEGACY_STORE)||'null'):null;
 const stored=JSON.parse(storage.getItem(key(pack))||(pack.id==='eng.MRK-1-1-13'?storage.getItem(key({id:'fia-mark-authentic'})):null)||'null');
 const device=JSON.parse(storage.getItem(DEVICE)||'null');
 const value=stored?{...device,...stored}:legacy;
 if(!value?.session)return device?{...device,session:{...createSession(activities),preferences:{...createSession(activities).preferences,...device.preferences}}}:null;
 const index=stored?activities.findIndex(a=>a.id===stored.activityId):value.session.index;
 if(!Number.isInteger(index)||index<0||index>=activities.length)return {resetRequired:true};
 const fresh=createSession(activities),validIds=new Set(activities.map(a=>a.id));
 const resource=id=>id&&(!assets||Object.hasOwn(assets,id))?id:null;
 const references={detour:resource(value.session.detour),pinned:resource(value.session.pinned),queued:resource(value.session.queued),history:(value.session.history||[]).filter(id=>resource(id))};
 if(!references.detour)references.detourReturnStatus=null;
 return {...value,session:{...fresh,...value.session,...references,index,status:value.session.status==='playing'?'paused':value.session.status,completed:(value.session.completed||[]).filter(id=>validIds.has(id)),preferences:{...fresh.preferences,...(device?.preferences||value.session.preferences)}}};
}

export function progressSummary(storage,pack){try{const stored=JSON.parse(storage.getItem(key(pack))||'null');return {completed:stored?.session?.completed?.length||0,total:stored?.total||0};}catch{return {completed:0};}}
export function resetProgress(storage,pack){const raw=storage.getItem(key(pack));if(raw)storage.setItem(`${key(pack)}:before-reset`,raw);storage.removeItem(key(pack));if(pack.id==='eng.MRK-1-1-13'){storage.removeItem(key({id:'fia-mark-authentic'}));storage.removeItem(LEGACY_STORE);}}
