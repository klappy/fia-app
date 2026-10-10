// Generic consumption of the reviewed fia-executable-presentation@1 port.
// Source meaning, ownership graphs and bound-reference resolution belong to server.
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const text=value=>typeof value==='string'&&value.length>0;
const need=ok=>{if(!ok)throw Error('The executable presentation is invalid.');};
const exact=(value,fields)=>need(value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).sort().join()===fields.split(',').sort().join());
function bound(value){exact(value,'id,sha256');need(text(value.id)&&hash(value.sha256));}
function activityExecution(value){
 exact(value,'narration,focalAssetId,completion');need(value.focalAssetId===null||typeof value.focalAssetId==='string');
 exact(value.completion,'action');need(['manual-continue','advance-after-narration'].includes(value.completion.action));
 const n=value.narration;
 switch(n?.action){
  case 'none':exact(n,'action');break;
  case 'play-bound-audio':exact(n,'action,artifact');bound(n.artifact);break;
  case 'prepare-original':exact(n,'action,demand');bound(n.demand);break;
  case 'blocked':exact(n,'action,status,reason');need(['unsupported','unavailable','invalid'].includes(n.status)&&text(n.reason));break;
  default:need(false);
 }
 return value;
}
export function validateExecutablePresentation(presentation){
 need(presentation&&typeof presentation==='object');
 if(!Object.hasOwn(presentation,'execution')){
  need(!presentation.activities?.some(activity=>Object.hasOwn(activity,'execution')));
  return null;
 }
 const value=presentation.execution;exact(value,'schema,sourceRevision,decisionEvidenceSha256,recipeRevision');
 need(value.schema==='fia-executable-presentation@1'&&text(value.sourceRevision)&&hash(value.decisionEvidenceSha256)&&text(value.recipeRevision));
 need(Array.isArray(presentation.activities)&&presentation.activities.length>0);
 const ids=new Set();for(const activity of presentation.activities){need(text(activity?.id)&&!ids.has(activity.id));ids.add(activity.id);activityExecution(activity.execution);}
 return value;
}
export function executionFor(presentation,activityId){
 if(!validateExecutablePresentation(presentation))return null;
 const activity=presentation.activities.find(activity=>activity.id===activityId);need(activity);return activity.execution;
}
export function createExecutableNarration({playBoundAudio,prepareOriginal}={}){
 let generation=0,controller=null;
 function cancel(){generation++;controller?.abort();controller=null;}
 async function run(presentation,activityId,{explicit=false,signal,automatic=false}={}){
  if(!explicit)throw Error('Narration requires explicit playback consent.');
  cancel();const execution=executionFor(presentation,activityId);need(execution);
  const owner=generation;const local=new AbortController();controller=local;
  const abort=()=>local.abort();if(signal?.aborted)local.abort();else signal?.addEventListener('abort',abort,{once:true});
  try{
   if(local.signal.aborted)return null;
   const narration=structuredClone(execution.narration);
   if(narration.action==='none')return {status:'none'};
   if(narration.action==='blocked')return {status:'blocked',availability:narration.status,reason:narration.reason};
   const port=narration.action==='play-bound-audio'?playBoundAudio:prepareOriginal;
   if(typeof port!=='function')throw Error('This narration capability is unavailable.');
   const reference=Object.freeze(narration.artifact||narration.demand);
   const context=Object.freeze({presentationExecution:Object.freeze(structuredClone(presentation.execution)),activityId,automatic,signal:local.signal});
   const result=await port(reference,context);
   return owner===generation&&!local.signal.aborted?result:null;
  }finally{signal?.removeEventListener('abort',abort);if(owner===generation)controller=null;}
 }
 return {run,cancel};
}

// Lower explicit actions to the existing generic session engine representation.
// Legacy display/provenance stays on the original object; no source inference.
export function executablePresentationView(presentation){
 if(!validateExecutablePresentation(presentation))return presentation;
 return {...presentation,activities:presentation.activities.map(activity=>({...activity,
  assetId:activity.execution.focalAssetId,
  completion:activity.execution.completion.action==='advance-after-narration'?'auto':'confirm',
  audioSrc:null,readingGroupId:undefined,
 }))};
}
