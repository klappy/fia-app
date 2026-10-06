import {canonicalJSONString,sha256} from '../contract.mjs';
import {createGuideDiscoveryAdapter} from './discovery.mjs';
import {createPresentationGuideUnitsResolver} from './presentation-guide-units.mjs';
import {createCompleteGuideUnitsResolver} from './complete-guide-units.mjs';
import {P1_CANONICAL_LEDGER_PINS} from './canonical-unit-ledger.mjs';
import {createPipeline} from './pipeline.mjs';
import {createAlignmentAdapter} from './alignment.mjs';
import {createAcceptanceAdapter} from './acceptance.mjs';
import {WINDOW_GUIDE_SCHEMA,verifyWindowGuideRecognition,windowGuideCorrespondence,windowGuideReview} from './window-guide-adapter.mjs';
import {validateRecognitionIdentity} from './recognition-identity.mjs';
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),same=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b);
const copyBytes=(value,max)=>{if(!(value instanceof Uint8Array)||!value.length||value.length>max)throw Error('guide-executor-artifact-size');return new Uint8Array(value);};
function port(value,method,paid=false){if(value==null)return null;const captured={dependencySha256:value.dependencySha256,[method]:value[method],...(paid?{paid:value.paid}:{})};if(!hash(captured.dependencySha256)||typeof captured[method]!=='function'||paid&&captured.paid!==false)throw Error('guide-executor-capability');captured[method]=captured[method].bind(value);return Object.freeze(captured);}
async function bounded(fn,ms,onTimeout=()=>{}){let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>{onTimeout();reject(Error('guide-executor-deadline'));},ms);})]);}finally{clearTimeout(timer);}}
// Private free-execution composition only. No public route, acceptance policy or publisher is installed.
export async function createGuideExecutor({metadataBytes,metadataSha256,registryBytes,registrySha256,presentationAliases=[],canonicalP1=null,readPresentation,storage,bucket,modelRecipe,policyRevision,admission=null,acquisition=null,recognition=null,artifacts,stepMs=30000}){
 const canonical=canonicalP1?Object.fromEntries(Object.entries(canonicalP1).map(([key,value])=>[key,copyBytes(value,33554432)])):null;
 const metadata=copyBytes(metadataBytes,2097152),registry=copyBytes(registryBytes,2097152),aliases=structuredClone(presentationAliases),recipe=structuredClone(modelRecipe),read=readPresentation;
 const resultSchema=recognition?.resultSchema;if(resultSchema!==undefined&&resultSchema!==WINDOW_GUIDE_SCHEMA)throw Error('guide-executor-recognition-schema');const windowed=resultSchema===WINDOW_GUIDE_SCHEMA;
 const authorize=port(admission,'check'),acquire=port(acquisition,'run',true),recognize=port(recognition,'run',true),artifactRead=port(artifacts,'read'),artifactWrite=port(artifacts,'write'),sourceVerify=typeof artifacts?.verifySource==='function'?port(artifacts,'verifySource'):null;
 if(!artifactRead||!artifactWrite||!storage?.transaction||!bucket||typeof read!=='function'||!Number.isSafeInteger(stepMs)||stepMs<1||stepMs>30000||typeof policyRevision!=='string'||!policyRevision.trim()||policyRevision.length>4096||!recipe||Object.keys(recipe).sort().join()!=='configSha256,modelId,modelRevision'||typeof recipe.modelId!=='string'||!recipe.modelId||!hash(recipe.modelRevision)||!hash(recipe.configSha256))throw Error('guide-executor-configuration');
 const durable=Object.freeze({transaction:storage.transaction.bind(storage)});if(typeof bucket.get!=='function'||typeof bucket.put!=='function')throw Error('guide-executor-storage');const retainedBucket=Object.freeze({get:bucket.get.bind(bucket),put:bucket.put.bind(bucket)});
 const guide=await createGuideDiscoveryAdapter({metadataBytes:metadata,metadataSha256,bucket:retainedBucket}),resolveUnits=await (canonical?createCompleteGuideUnitsResolver:createPresentationGuideUnitsResolver)({canonicalP1:canonical,metadataBytes:metadata,metadataSha256,registryBytes:registry,registrySha256,presentationAliases:aliases,readPresentation:read,totalMs:stepMs});
 const rows=JSON.parse(new TextDecoder().decode(metadata)).rows;
 const dependency={schema:'fia-guide-executor-composition@1',metadataSha256,registrySha256,presentationAliases:aliases,modelRecipe:recipe,policyRevision,recognitionPolicy:windowed?'fia-window-guide-recognition@1/verified-projection@1':'fia-local-raw-recognition@1/validateRecognitionIdentity@1',acceptancePolicy:'review-required-only@1',...(canonical?{canonicalDispositionPolicy:{policy:'diagnostic-disposition-projection@1',pins:P1_CANONICAL_LEDGER_PINS}}:{}),ports:{admission:authorize?.dependencySha256??null,acquisition:acquire?.dependencySha256??null,recognition:recognize?.dependencySha256??null,artifacts:{read:artifactRead.dependencySha256,write:artifactWrite.dependencySha256,...(sourceVerify?{sourceVerification:{policy:'typed-source-stream@1',dependencySha256:sourceVerify.dependencySha256}}:{})}}};
 const dependencySha256=await sha256(canonicalJSONString(dependency));
 async function resolve(request){const captured=structuredClone(request),resolved=await guide.resolveRequest(captured);return {...resolved,input:{...resolved.input,modelRecipe:structuredClone(recipe),policyRevision}};}
 function allowed(context,phase){if(!authorize)return false;try{const value=authorize.check({...structuredClone(context),phase});if(value&&typeof value.then==='function')Promise.resolve(value).catch(()=>{});return value===true;}catch{return false;}}
 async function request(rawRequest){
  const context=await resolve(rawRequest),{input,consumer}=context;
  const blocked=reason=>({state:'blocked',reason,consumer,acceptedPlaybackRanges:[]});
  if(!allowed(context,'request'))return blocked(authorize?'execution-admission-refused':'execution-admission-unavailable');
  if(!recognize)return blocked('recognition-capability-unavailable');if(!acquire)return blocked('acquisition-capability-unavailable');
  // Preflight every request, including warm runs: current retained presentation joins cannot be skipped by cached nodes.
  let script,disposition=null;try{script=await resolveUnits(input);if(canonical){const complete=script;disposition={schema:'fia-diagnostic-disposition-projection@1',manifestSha256:complete.manifestSha256,identity:complete.identity,canonicalUnits:complete.canonicalUnits,excluded:complete.canonicalUnits.filter(u=>['not-spoken-production-note','associated-pause-no-independent-range'].includes(u.narrationRole)).map(u=>({sourceUnitId:u.sourceUnitId,associatedActivityId:u.associatedActivityId,reason:u.narrationRole==='not-spoken-production-note'?'nonspoken-production-note':'associated-pause-correspondence-unresolved'}))};disposition.projectionSha256=await sha256(canonicalJSONString(disposition));script=complete.alignmentInput??{scriptSha256:input.scriptSha256,guideContentSha256:input.scriptSha256,sectionManifestSha256:complete.manifestSha256,units:complete.canonicalUnits.filter(u=>u.narrationRole==='not-assessed').map(u=>({activityId:u.sourceUnitId,sourceUnitId:u.sourceUnitId,sourceTextSha256:u.sourceTextSha256,text:u.text}))};}}catch{return blocked('guide-units-unavailable');}
  const outputs={},selected=rows.find(row=>row.packId===input.packId&&row.presentationRevision===input.source.version&&row.stepId===input.resource);
  async function retained(descriptor,limit=4194304){
   const d=structuredClone(descriptor);if(!hash(d?.sha256)||typeof d.reference!=='string'||!d.reference||d.reference.length>4096)throw Error('guide-executor-artifact-identity');
   const content=copyBytes(await bounded(()=>artifactRead.read(d),stepMs),limit);if(await sha256(content)!==d.sha256)throw Error('guide-executor-artifact-hash');return content;
  }
  async function store(value){const content=copyBytes(value,4194304),digest=await sha256(content),result=structuredClone(await bounded(()=>artifactWrite.write(new Uint8Array(content)),stepMs));if(result?.sha256!==digest)throw Error('guide-executor-store');await retained(result);return result;}
  function wrap(adapter){return {paid:false,dependencySha256,async run(args){if(!allowed(context,'dispatch'))throw Error('guide-executor-admission');const controller=windowed&&adapter===recognize?new AbortController():null;let output;try{output=await bounded(()=>adapter.run({...structuredClone(args),...(controller?{signal:controller.signal}:{})}),stepMs,()=>controller?.abort());}finally{controller?.abort();}if(!allowed(context,'completion'))throw Error('guide-executor-admission');return output;}};}
  function withDisposition(adapter){if(!disposition)return adapter;return {paid:false,async run(args){const descriptor=await adapter.run(args),document=JSON.parse(new TextDecoder().decode(await retained(descriptor)));document.canonicalDisposition=structuredClone(disposition);return store(new TextEncoder().encode(canonicalJSONString(document)));}};}
  const correspondence=()=>windowGuideCorrespondence({input,script,recognition:outputs.windowRecognition,rawSha256:outputs.transcribe.sha256});
  const review=()=>windowGuideReview({correspondence:correspondence(),alignmentSha256:outputs.align.sha256});
  const alignment=withDisposition(windowed?{async run(){return store(new TextEncoder().encode(canonicalJSONString(correspondence())));}}:createAlignmentAdapter({resolveArtifact:retained,resolveUnits:async()=>structuredClone(script),storeArtifact:store}));
  const acceptance=withDisposition(windowed?{async run(){return store(new TextEncoder().encode(canonicalJSONString(review())));}}:createAcceptanceAdapter({resolveArtifact:retained,storeArtifact:store}));
  const pipeline=createPipeline({storage:durable,policyId:dependencySha256,allowPaid:false,...(sourceVerify?{verifySource:async descriptor=>{if(!allowed(context,'verification'))throw Error('guide-executor-admission');const verified=await bounded(()=>sourceVerify.verifySource(descriptor),stepMs);if(!allowed(context,'verification'))throw Error('guide-executor-admission');outputs.acquire={...descriptor,bytes:verified?.bytes};return verified;}}:{}),adapters:{discover:wrap(guide.adapter),acquire:wrap(acquire),transcribe:wrap(recognize),align:wrap(alignment),accept:wrap(acceptance)},verifyArtifact:async(descriptor,{node})=>{
   if(!allowed(context,'verification'))throw Error('guide-executor-admission');
   const content=await retained(descriptor,node==='acquire'?8388608:4194304);
   if(node==='acquire'){if(descriptor.reference!==`originals/sha256/${descriptor.sha256}.mp3`)throw Error('guide-executor-source-reference');outputs.acquire={...descriptor,bytes:content.length};}
   else {const document=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(content));
    if(node==='discover'){if(descriptor.reference!==`preparation/discovery/${descriptor.sha256}.json`||await guide.validatePublisherURL(selected.sourceURL,{input,discovery:document})!==true)throw Error('guide-executor-discovery');}
    if(node==='transcribe'){if(windowed){outputs.windowRecognition=await verifyWindowGuideRecognition(document,{input,source:outputs.acquire,resolveArtifact:retained});}else if(document.schema!=='fia-local-raw-recognition@1'||document.status!=='candidate'||document.source?.sha256!==outputs.acquire?.sha256||document.source?.bytes!==outputs.acquire?.bytes||!Number.isFinite(document.durationSeconds)||document.durationSeconds<=0||document.durationSeconds>600||await validateRecognitionIdentity(document,input)!==true)throw Error('guide-executor-recognition');outputs.transcribe=descriptor;}
    if(node==='align'||node==='accept'){
     if(disposition&&!same(document.canonicalDisposition,disposition))throw Error('guide-executor-disposition-binding');
     const pins=script.units.map(({text,...unit})=>unit),actual=(node==='align'?document.mappings:document.units)?.map(unit=>Object.fromEntries(['activityId','sourceUnitId','sourceTextSha256'].map(k=>[k,unit[k]])));
     const identity=Object.fromEntries(['packId','book','language','edition','passage','resource','policyRevision'].map(k=>[k,input[k]]));
     if(!same(actual,pins)||!same(document.identity,identity)||document.sourceSha256!==outputs.acquire.sha256||document.scriptSha256!==input.scriptSha256||document.rawRecognitionSha256!==outputs.transcribe.sha256||!Array.isArray(document.acceptedPlaybackRanges)||document.acceptedPlaybackRanges.length)throw Error('guide-executor-evidence');
     if(windowed){const expected=node==='align'?correspondence():review();if(disposition)expected.canonicalDisposition=structuredClone(disposition);if(!same(document,expected))throw Error('guide-executor-window-evidence');if(node==='align')outputs.align=descriptor;}
     else if(node==='align'){if(document.schema!=='fia-exact-word-alignment@1'||document.status!=='candidate')throw Error('guide-executor-alignment');outputs.align=descriptor;}
     else if(document.schema!=='fia-preparation-acceptance@1'||document.status!=='review-required'||document.alignmentSha256!==outputs.align.sha256||document.units.some(unit=>unit.status!=='review-required'))throw Error('guide-executor-acceptance');
    }
   }
   if(!allowed(context,'verified'))throw Error('guide-executor-admission');return new Uint8Array(content);
  }});
  const result=await pipeline.run(input);if(!allowed(context,'result'))return blocked('execution-admission-refused');
  return {...result,consumer,compositionSha256:dependencySha256,guideContentSha256:script.guideContentSha256,sectionManifestSha256:script.sectionManifestSha256,acceptedPlaybackRanges:[]};
 }
 return Object.freeze({resolve,request,dependencySha256});
}
