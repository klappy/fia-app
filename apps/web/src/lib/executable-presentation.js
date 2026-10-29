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
// Optional server-declared fields (SOURCE-TO-APP visual resources; OFFLINE bound
// manifest and publication pin). This build accepts them absent or present and checks
// their closed shapes; it never acts on them, and no server emits them to it unasked
// (pack reads opt in with ?execution=2). Readiness, bytes and authority stay server-side.
const EXECUTION_EXTENSIONS=['visualResources','mediaManifest','publication'];
const VISUAL_REASONS=['decoder-unavailable','visual-ineligible','visual-unsupported','retained-evidence-unavailable','execution-admission-refused','execution-uncertain','interrupted'];
const assetId=value=>typeof value==='string'&&value.length>0&&value.length<=256&&/^[A-Za-z0-9_-]+$/.test(value);
const plain=value=>value!==null&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype;
export function validateJSONDescriptor(value,idPattern=null){
 exact(value,'id,sha256,bytes,mime');
 need(typeof value.id==='string'&&value.id.length>0&&value.id.length<=1024&&(!idPattern||idPattern.test(value.id))&&hash(value.sha256)&&Number.isSafeInteger(value.bytes)&&value.bytes>0&&value.bytes<=1048576&&value.mime==='application/json');
 return value;
}
export function validatePublicationPin(value){
 exact(value,'schema,generation,baseManifest');
 need(value.schema==='fia-executable-publication-pin@1'&&hash(value.generation));
 validateJSONDescriptor(value.baseManifest,/^base-offline:[a-f0-9]{64}$/);need(value.baseManifest.id===`base-offline:${value.baseManifest.sha256}`);
 return value;
}
function visualDemand(value,entry){
 need(plain(value));
 const keys=['packId','baseRevision','sourceRevision','capability','visualDemand','expectedExecutionRevision',...(Object.hasOwn(value,'expectedPublicationGeneration')?['expectedPublicationGeneration']:[])];
 exact(value,keys.join());
 need(text(value.packId)&&value.packId.length<=256&&hash(value.baseRevision)&&text(value.sourceRevision)&&value.sourceRevision.length<=256&&value.capability==='executable-presentation'&&hash(value.expectedExecutionRevision));
 need(!Object.hasOwn(value,'expectedPublicationGeneration')||value.expectedPublicationGeneration===null||hash(value.expectedPublicationGeneration));
 exact(value.visualDemand,'assetId,kind');need(value.visualDemand.assetId===entry.assetId&&value.visualDemand.kind===entry.kind);
}
export function validateVisualResources(value){
 need(Array.isArray(value)&&value.length<=1024);
 const ids=new Set();
 for(const entry of value){
  need(plain(entry)&&assetId(entry.assetId)&&['image','map'].includes(entry.kind)&&!ids.has(entry.assetId));ids.add(entry.assetId);
  switch(entry.status){
   case 'preparable':exact(entry,'assetId,kind,status,preparationDemand');visualDemand(entry.preparationDemand,entry);break;
   case 'ready':exact(entry,'assetId,kind,status,ready');exact(entry.ready,'path,sha256');need(typeof entry.ready.path==='string'&&/^\/v1\/original-visuals\/[a-f0-9]{64}\/[a-f0-9]{64}\/[a-f0-9]{64}$/.test(entry.ready.path)&&hash(entry.ready.sha256));break;
   case 'unavailable':exact(entry,'assetId,kind,status,reason');need(VISUAL_REASONS.includes(entry.reason));break;
   default:need(false);
  }
 }
 return value;
}
export function validateExecutablePresentation(presentation){
 need(presentation&&typeof presentation==='object');
 if(!Object.hasOwn(presentation,'execution')){
  need(!presentation.activities?.some(activity=>Object.hasOwn(activity,'execution')));
  return null;
 }
 const value=presentation.execution;need(value&&Object.getPrototypeOf(value)===Object.prototype);
 const optional=EXECUTION_EXTENSIONS.filter(key=>Object.hasOwn(value,key));
 exact(value,['schema','sourceRevision','decisionEvidenceSha256','recipeRevision',...optional].join());
 need(value.schema==='fia-executable-presentation@1'&&text(value.sourceRevision)&&hash(value.decisionEvidenceSha256)&&text(value.recipeRevision));
 if(Object.hasOwn(value,'visualResources'))validateVisualResources(value.visualResources);
 if(Object.hasOwn(value,'mediaManifest'))validateJSONDescriptor(value.mediaManifest);
 if(Object.hasOwn(value,'publication'))validatePublicationPin(value.publication);
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
