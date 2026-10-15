import {canonicalJSONString,sha256} from '../contract.mjs';
import {verifyWindowGuideRecognition} from './window-guide-adapter.mjs';
import {correspondWindowUnits} from './window-unit-correspondence.mjs';
import {measureQuietBoundary} from './quiet-unit-derivative.mjs';
import {createUnitDerivativeJobs} from './unit-derivative-jobs.mjs';
const encode=x=>new TextEncoder().encode(canonicalJSONString(x));
const same=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const need=x=>{if(!x)throw Error('unit-derivative-preparation-binding');};
const POLICY={windowSamples:160,thresholdDbfsExclusive:-45,minimumQuietSamples:960,selection:'single-qualifying-run-only-midpoint'};
const identity=input=>Object.fromEntries(['packId','book','language','edition','passage','resource','policyRevision'].map(k=>[k,input[k]]));
function capture(bytes,max){need(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=max);return new Uint8Array(bytes);}

/** Computes a requested unit's measurements from actual pinned PCM, not labels. */
export async function measureRequestedUnit({sourceUnitId,pcmBytes,correspondenceInput,maxPcmSeconds=1800}){
 need(Number.isSafeInteger(maxPcmSeconds)&&maxPcmSeconds>0&&maxPcmSeconds<=1800);
 const pcm=capture(pcmBytes,maxPcmSeconds*64000),ci=structuredClone(correspondenceInput);
 const correspondence=await correspondWindowUnits(ci),pi=correspondence.plan.identity;
 need(pi.sampleRate===16000&&pcm.length===pi.totalSamples*4&&await sha256(pcm)===pi.pcmSha256);
 const units=correspondence.units.filter(u=>u.sourceUnitId===sourceUnitId);need(units.length===1);
 const unit=units[0];need(unit.status==='exact-unique'&&unit.alternatives.length===1);
 const a=unit.alternatives[0],raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(ci.records.find(r=>r.windowSha256===a.windowSha256).rawBytes));
 const first=a.words[0].trace.wordIndex,last=a.words.at(-1).trace.wordIndex+1;need(first>0&&last<raw.words.length);
 const env=a.observedWordEnvelope,view=new DataView(pcm.buffer,pcm.byteOffset,pcm.byteLength);
 for(let i=0;i<pcm.length;i+=4)need(Number.isFinite(view.getFloat32(i,true)));
 const left=measureQuietBoundary(view,(raw.window.startSample+raw.words[first-1].endSampleExclusive)/16000,env.startSample/16000);
 const right=measureQuietBoundary(view,env.endSampleExclusive/16000,(raw.window.startSample+raw.words[last].startSample)/16000);
 const edge=x=>({state:'measured',reason:null,...x,cutSeconds:x.cutSample/16000,quietRuns:[structuredClone(x.selectedQuietRun)]});
 const correspondenceBytes=encode(correspondence),correspondenceSha256=await sha256(correspondenceBytes);
 const measurement={schema:'fia-window-signal-boundary-measurements@1',status:'measured-not-accepted',sourceSha256:pi.sourceSha256,correspondenceSha256,canonicalSha256:correspondence.canonicalSha256,plan:correspondence.plan,pcm:{sha256:pi.pcmSha256,samples:pi.totalSamples,sampleRate:16000},policy:structuredClone(POLICY),units:[{sourceUnitId,activityId:unit.activityId,sourceTextSha256:unit.sourceTextSha256,status:'exact-unique',state:'measured',reason:null,windowSha256:a.windowSha256,rawSha256:a.rawSha256,wordSpan:{first,lastExclusive:last},adjacentWords:{before:raw.words[first-1],after:raw.words[last]},envelope:{startSeconds:env.startSample/16000,endSeconds:env.endSampleExclusive/16000},left:edge(left),right:edge(right)}],acceptedPlaybackRanges:[]};
 const measurementBytes=encode(measurement);return{correspondenceBytes,correspondenceSha256,measurementBytes,measurementSha256:await sha256(measurementBytes)};
}

/** Trusted optional factory port. PCM acquisition is delegated to the fenced
 * verified store; returned candidates never imply publication or acceptance. */
export function createUnitDerivativePreparation({storage,artifacts,pcmStore,readPCM,eligibility,dependencySha256,maxPcmSeconds=1800,maxUnitSeconds=120,stepMs=30000}){
 need(typeof storage?.transaction==='function'&&typeof artifacts?.read==='function'&&typeof artifacts?.write==='function'&&typeof pcmStore?.request==='function'&&typeof pcmStore?.read==='function'&&typeof readPCM==='function'&&typeof eligibility==='function'&&hash(dependencySha256));
 need(Number.isSafeInteger(maxPcmSeconds)&&maxPcmSeconds>0&&maxPcmSeconds<=1800&&Number.isSafeInteger(maxUnitSeconds)&&maxUnitSeconds>0&&maxUnitSeconds<=120&&Number.isSafeInteger(stepMs)&&stepMs>0&&stepMs<=120000);
 const transaction=storage.transaction.bind(storage),get=artifacts.read.bind(artifacts),put=artifacts.write.bind(artifacts),getPCM=readPCM,pcmRequest=pcmStore.request.bind(pcmStore),pcmRead=pcmStore.read.bind(pcmStore),eligible=eligibility;
 async function bounded(fn,signal){const controller=new AbortController();let timer,abort;try{return await Promise.race([Promise.resolve().then(()=>{need(!signal?.aborted);return fn(controller.signal);}),new Promise((_,reject)=>{abort=()=>{controller.abort();reject(Error('derivative-preparation-aborted'));};signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>{controller.abort();reject(Error('derivative-preparation-timeout'));},stepMs);if(signal?.aborted)abort();})]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();}}
 async function retained(d,max=4194304,signal){need(hash(d?.sha256)&&typeof d.reference==='string');const b=capture(await bounded(s=>get(structuredClone(d),{signal:s}),signal),max);need(await sha256(b)===d.sha256);return b;}
 async function store(b,signal){const copied=capture(b,4194304),digest=await sha256(copied),d=structuredClone(await bounded(s=>put(copied,{kind:'receipt',signal:s}),signal));need(d.sha256===digest);await retained(d,4194304,signal);return d;}
 async function execute(rawContext,{signal,recoverOnly=false}={}){
  const operation=new AbortController();
  signal=signal?AbortSignal.any([signal,operation.signal]):operation.signal;
  const context=structuredClone(rawContext),{input,consumer,script,source,recognition,correspondence}=context;
  const allowed=phase=>{try{if(signal?.aborted)return false;const value=eligible(structuredClone(context),phase);if(value&&typeof value.then==='function')Promise.resolve(value).catch(()=>{});return value===true;}catch{return false;}};
  need((recoverOnly||allowed('request'))&&script.scriptSha256===input.scriptSha256);
  await verifyWindowGuideRecognition(recognition,{input,source,resolveArtifact:d=>retained(d,4194304,signal)});
  const canonicalBytes=encode({schema:'fia-canonical-correspondence-units@1',identity:identity(input),scriptSha256:input.scriptSha256,units:script.units}),records=[];
  for(const a of recognition.artifacts)records.push({state:'completed',windowSha256:a.windowSha256,rawSha256:a.sha256,rawBytes:await retained(a,4194304,signal)});
  const correspondenceInput={canonicalBytes,canonicalSha256:await sha256(canonicalBytes),plan:recognition.plan,records},verified=await correspondWindowUnits(correspondenceInput);
  need(same(verified,correspondence.correspondence));const selected=verified.units.find(u=>u.sourceUnitId===consumer.sourceUnitId);
  need(selected&&selected.sourceTextSha256===consumer.sourceTextSha256);
  if(selected.status!=='exact-unique')return{state:'blocked',reason:'unit-correspondence-unresolved',sourceUnitId:selected.sourceUnitId,projection:verified.units.map(u=>({sourceUnitId:u.sourceUnitId,status:u.status,candidate:null,qualifiedForPlayback:false})),acceptedPlaybackRanges:[]};
  const pi=recognition.plan.identity,pcmDemand={source,pcm:{sha256:pi.pcmSha256,samples:pi.totalSamples,sampleRate:pi.sampleRate,decoderSha256:pi.decoderSha256}};
  const prepIdentity={schema:'fia-unit-derivative-input-demand@1',dependencySha256,maxPcmSeconds,maxUnitSeconds,sourceUnitId:selected.sourceUnitId,sourceTextSha256:selected.sourceTextSha256,canonicalSha256:verified.canonicalSha256,planSha256:recognition.plan.planSha256,correspondenceSha256:await sha256(encode(verified)),pcmDemand};
  const key='unit-derivative-input:'+await sha256(encode(prepIdentity));
  const validate=row=>{need(row&&Object.keys(row).sort().join()==='artifact,attemptId,identity,revision,schema,state'&&row.schema==='fia-unit-derivative-input-job@1'&&same(row.identity,prepIdentity)&&['preparing','uncertain','completed'].includes(row.state)&&typeof row.attemptId==='string'&&/^[a-f0-9-]{36}$/.test(row.attemptId)&&Number.isSafeInteger(row.revision)&&row.revision>0&&row.revision<Number.MAX_SAFE_INTEGER);if(row.state==='completed')need(row.artifact&&Object.keys(row.artifact).sort().join()==='reference,sha256'&&hash(row.artifact.sha256)&&typeof row.artifact.reference==='string'&&row.artifact.reference.length>0&&row.artifact.reference.length<=2048);else need(row.artifact===null);return row;};
  if(recoverOnly){const recovery=await transaction(async tx=>{const old=await tx.get(key);if(!old)return{state:'missing',acceptedPlaybackRanges:[]};const row=validate(old);if(row.state==='preparing'){await tx.put(key,{...row,state:'uncertain',revision:row.revision+1});return{state:'uncertain',reason:'interrupted',acceptedPlaybackRanges:[]};}return{state:row.state,acceptedPlaybackRanges:[]};});if(recovery.state!=='completed')return recovery;}
  // A shared PCM dependency may be pending for another unit. Do not claim this
  // unit until PCM is available, so an ordinary dependency wait cannot poison it.
  const existing=await transaction(async tx=>{const row=await tx.get(key);return row?validate(row):null;});
  if(existing&&existing.state!=='completed')return{state:existing.state,reason:'derivative-input-preparation-incomplete',acceptedPlaybackRanges:[]};
  const readyPCM=await bounded(()=>existing?pcmRead(pcmDemand):pcmRequest(pcmDemand),signal);
  if(readyPCM.state!=='candidate')return{state:readyPCM.state==='preparing'?'preparing':readyPCM.state==='uncertain'?'uncertain':'unavailable',reason:'pcm-dependency-'+readyPCM.state,acceptedPlaybackRanges:[]};
  const claim=await transaction(async tx=>{need(allowed('claim'));const old=await tx.get(key);if(old)return{owner:false,row:validate(old)};const row={schema:'fia-unit-derivative-input-job@1',identity:prepIdentity,state:'preparing',attemptId:crypto.randomUUID(),revision:1,artifact:null};await tx.put(key,row);return{owner:true,row};});
  const fence=()=>transaction(async tx=>{const row=validate(await tx.get(key));need(row.state==='preparing'&&row.attemptId===claim.row.attemptId&&row.revision===claim.row.revision&&allowed('dispatch'));});
  let receipt,pcmBytes;
  try{
   if(claim.owner){
    await fence();const pcm=readyPCM;
    pcmBytes=capture(await bounded(s=>getPCM(pcm.descriptor,{signal:s,maxBytes:maxPcmSeconds*64000}),signal),maxPcmSeconds*64000);need(await sha256(pcmBytes)===pi.pcmSha256);
    const measured=await measureRequestedUnit({sourceUnitId:selected.sourceUnitId,pcmBytes,correspondenceInput,maxPcmSeconds});await fence();
    const corr=await store(measured.correspondenceBytes,signal);await fence();const measurement=await store(measured.measurementBytes,signal);await fence();
    receipt={schema:'fia-unit-derivative-inputs@1',identity:prepIdentity,pcm:pcm.descriptor,correspondence:corr,measurement};const artifact=await store(encode(receipt),signal);
    await transaction(async tx=>{const row=validate(await tx.get(key));need(row.state==='preparing'&&row.attemptId===claim.row.attemptId&&row.revision===claim.row.revision&&allowed('commit'));await tx.put(key,{...row,state:'completed',revision:row.revision+1,artifact});});
   }else{
    if(claim.row.state!=='completed')return{state:claim.row.state,reason:'derivative-input-preparation-incomplete',acceptedPlaybackRanges:[]};
    receipt=JSON.parse(new TextDecoder().decode(await retained(claim.row.artifact,4194304,signal)));need(receipt.schema==='fia-unit-derivative-inputs@1'&&same(receipt.identity,prepIdentity));
    need(same(readyPCM.descriptor,receipt.pcm));
   }
   const cb=await retained(receipt.correspondence,4194304,signal),mb=await retained(receipt.measurement,4194304,signal);need(await sha256(cb)===prepIdentity.correspondenceSha256&&same(JSON.parse(new TextDecoder().decode(cb)),verified)&&allowed('prepared'));
   const alternative=selected.alternatives[0],demand={sourceUnitId:selected.sourceUnitId,sourceTextSha256:selected.sourceTextSha256,pins:{sourceSha256:source.sha256,pcmSha256:pi.pcmSha256,canonicalSha256:verified.canonicalSha256,correspondenceSha256:receipt.correspondence.sha256,measurementSha256:receipt.measurement.sha256,planSha256:recognition.plan.planSha256,windowSha256:alternative.windowSha256,rawSha256:alternative.rawSha256}};
   const jobs=createUnitDerivativeJobs({storage:{transaction},artifacts:{read:get,write:put},dependencySha256,maxPcmSeconds,maxUnitSeconds,eligibility:(_,phase)=>allowed('unit-'+phase),resolveInputs:async()=>({sourceUnitId:selected.sourceUnitId,pcmBytes:pcmBytes??capture(await bounded(s=>getPCM(receipt.pcm,{signal:s,maxBytes:maxPcmSeconds*64000}),signal),maxPcmSeconds*64000),correspondenceInput,correspondenceBytes:cb,correspondenceSha256:receipt.correspondence.sha256,measurementBytes:mb,measurementSha256:receipt.measurement.sha256})});
   let result;try{result=await bounded(()=>recoverOnly?jobs.recoverInterrupted(demand):jobs.request(demand),signal);}catch(error){operation.abort();throw error;}need(allowed('result'));return{...result,preparation:receipt};
  }catch(error){if(claim.owner)await transaction(async tx=>{const row=validate(await tx.get(key));if(row.state==='preparing'&&row.attemptId===claim.row.attemptId&&row.revision===claim.row.revision)await tx.put(key,{...row,state:'uncertain',revision:row.revision+1});});return{state:'uncertain',reason:'derivative-input-preparation-unavailable',acceptedPlaybackRanges:[]};}
 }
 return Object.freeze({paid:false,dependencySha256,request:(context,{signal}={})=>execute(context,{signal}),recoverInterrupted:context=>execute(context,{recoverOnly:true})});
}
