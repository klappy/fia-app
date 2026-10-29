const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>object(x)&&Object.keys(x).sort().join()===keys.toSorted().join();
const refused=()=>({status:'refused',code:'invalid-request'});
// A named domain refusal (a kebab-case code thrown by a check) is an expected
// conflict and answers typed with its code; unnamed faults still propagate.
const code=error=>typeof error?.message==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(error.message)&&error.message.length<=80?error.message:null;
async function typed(run,denied,publicationTimeout=false){try{return await run();}catch(error){const reason=code(error);if(reason===null||(publicationTimeout&&/-timeout$/.test(reason)))throw error;return denied(reason);}}
// F5a: a visual demand is the four-field demand plus visualDemand and expectedExecutionRevision
// (SOURCE-TO-APP L95, presentation-decision-demand schema). decisionDemand is not admitted here.
const generationExpectation=x=>!object(x)||!Object.hasOwn(x,'expectedPublicationGeneration')||x.expectedPublicationGeneration===null||hash(x.expectedPublicationGeneration);
export function validVisualDemand(x){const {visualDemand,expectedExecutionRevision,expectedPublicationGeneration,...rest}=object(x)?x:{};return exact(x,['packId','baseRevision','sourceRevision','capability','visualDemand','expectedExecutionRevision',...(object(x)&&Object.hasOwn(x,'expectedPublicationGeneration')?['expectedPublicationGeneration']:[])])&&generationExpectation(x)&&validPresentationDemand(rest)&&exact(visualDemand,['assetId','kind'])&&typeof visualDemand.assetId==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(visualDemand.assetId)&&['image','map'].includes(visualDemand.kind)&&hash(expectedExecutionRevision);}
const VISUAL_REASONS=new Set(['decoder-unavailable','visual-ineligible','visual-unsupported','retained-evidence-unavailable','execution-admission-refused','execution-uncertain','interrupted']);
const canonical=v=>Array.isArray(v)?v.map(canonical):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v,sameJSON=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function validPresentationDemand(x){return exact(x,['packId','baseRevision','sourceRevision','capability'])&&typeof x.packId==='string'&&/^(eng|spa)\.(?:MRK|LUK)-[0-9-]+$/.test(x.packId)&&x.packId.length<=80&&hash(x.baseRevision)&&typeof x.sourceRevision==='string'&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(x.sourceRevision)&&x.capability==='executable-presentation';}
// visuals: optional visual-original@1 routing port {demand(request)} supplied by the Durable Object owner.
export function createExecutableOperations({reads,service,publication,storage,visuals=null}){
 const tx=storage.transaction.bind(storage);
 const envelope=(status,jobId,reason=null,record=null)=>({schema:'fia-presentation-preparation@1',status,jobId,reason,record});
 async function preparePresentation(args){
  if(object(args)&&Object.hasOwn(args,'visualDemand'))return prepareVisual(args);
  // expectedPublicationGeneration (F7a1, OFFLINE): optional, a SHA-256 or explicit null; it binds the
  // intended prior publication and is checked by the publication, not by the presentation job.
  const expectation=object(args)&&Object.hasOwn(args,'expectedPublicationGeneration')?{expectedPublicationGeneration:args.expectedPublicationGeneration}:{};
  if(!generationExpectation(args))return refused();
  if(Object.hasOwn(expectation,'expectedPublicationGeneration')){const {expectedPublicationGeneration,...rest}=args;args=rest;}
  if(!validPresentationDemand(args))return refused();
  if(!service)return envelope('unavailable',null,'presentation-preparation-unavailable');
  const result=await typed(()=>service.request(structuredClone(args),{subscriberId:crypto.randomUUID()}),reason=>({status:'blocked',reason}));
  if(!hash(result?.jobId))return envelope(['blocked','unavailable'].includes(result?.status)?result.status:'blocked',null,result?.reason??'preparation-identity-invalid');
  const key='executable-demand:'+result.jobId;
  const conflict=await typed(()=>tx(async t=>{const old=await t.get(key);if(old&&Object.keys(args).some(k=>old.args[k]!==args[k]))throw Error('presentation-job-conflict');await t.put(key,{args:structuredClone(args),revision:old?.revision??null});}),reason=>envelope('blocked',result.jobId,reason));
  if(conflict)return conflict;
  if(result.status!=='ready')return envelope(['preparing','unavailable','blocked'].includes(result.status)?result.status:'blocked',result.jobId,result.reason??'presentation-not-ready');
  // Publication refusals (pointer race, stale base, revocation,
  // refused validation) are expected immutable outcomes, never an HTTP 500.
  const record=await typed(()=>publication.publish({binding:args,presentation:result.presentation,boundArtifacts:result.boundArtifacts,provenance:{...result.provenance,jobId:result.jobId},...expectation}),reason=>({status:'unavailable',reason}),true);
  if(record.status!=='ready')return envelope('blocked',result.jobId,record.reason??'publication-refused');
  await tx(async t=>{const row=await t.get(key);await t.put(key,{...row,revision:record.revision});});
  return envelope('ready',result.jobId,null,record);
 }
 // F5a admission. The demand must equal, field for field, the preparable descriptor this server
 // declares for the current executable publication (the expectedExecutionRevision compare-and-swap
 // fence). Every outcome is a typed envelope, never an exception: stale, refused, unavailable or not
 // yet published. Nothing is published here; display readiness waits for F7a/F7b.
 async function currentVisual(args){
  const record=await reads.readPack({packId:args.packId,execution:'2'});
  if(record?.status!=='ready'||record.execution?.schema!=='fia-executable-catalog@1')return {refusal:envelope('blocked',null,'execution-admission-refused')};
  if(record.revision!==args.expectedExecutionRevision)return {refusal:envelope('blocked',null,'execution-revision-stale')};
  if(Object.hasOwn(args,'expectedPublicationGeneration')&&(record.execution.publication?.generation??null)!==args.expectedPublicationGeneration)return {refusal:envelope('blocked',null,'publication-generation-stale')};
  const entry=(record.execution.visualResources??[]).find(e=>e.assetId===args.visualDemand.assetId&&e.kind===args.visualDemand.kind);
  if(!entry)return {refusal:envelope('blocked',null,'execution-admission-refused')};
  if(entry.status==='unavailable')return {refusal:envelope('unavailable',null,entry.reason)};
  if(entry.status!=='preparable'||!sameJSON(args,entry.preparationDemand))return {refusal:envelope('blocked',null,'execution-admission-refused')};
  return {record,entry};
 }
 async function prepareVisual(raw){
  if(!validVisualDemand(raw))return refused();
  const args=structuredClone(raw);
  try{
   const admitted=await currentVisual(args);if(admitted.refusal)return admitted.refusal;
   if(!visuals||typeof visuals.demand!=='function')return envelope('unavailable',null,'visual-routing-unavailable');
   let outcome;
   try{outcome=await visuals.demand({packId:args.packId,baseRevision:args.baseRevision,sourceRevision:args.sourceRevision,executionRevision:admitted.record.revision,assetId:args.visualDemand.assetId,kind:args.visualDemand.kind,retry:false});}
   catch(error){return envelope('unavailable',null,code(error)&&VISUAL_REASONS.has(code(error))?code(error):'interrupted');}
   // The fence again: a newer execution may have been adopted while custody ran. Its source
   // evidence stays reusable by the job; this demand cannot speak for the newer execution.
   const after=await currentVisual(args);if(after.refusal)return after.refusal.reason==='execution-revision-stale'?after.refusal:envelope('blocked',null,'execution-revision-stale');
   if(outcome?.state==='unavailable'&&VISUAL_REASONS.has(outcome.reason))return envelope('unavailable',null,outcome.reason);
   if(outcome?.state==='ready')return envelope('blocked',null,'visual-publication-unavailable');
   return envelope('unavailable',null,'interrupted');
  }catch(error){if(code(error))return envelope('blocked',null,code(error));throw error;}
 }
 async function readPresentationPreparation(args){
  if(!exact(args,['jobId'])||!hash(args.jobId))return refused();
  const row=await tx(t=>t.get('executable-demand:'+args.jobId));
  if(!row)return envelope('unavailable',args.jobId,'not-requested');
  if(row.revision){const record=await reads.readPack({packId:row.args.packId,revision:row.revision});return record.status==='ready'?envelope('ready',args.jobId,null,record):envelope('blocked',args.jobId,record.reason??'publication-unavailable');}
  // A job under a superseded policy, or any named integrity refusal, stays denied typed.
  const result=await typed(()=>service.read({jobId:args.jobId}),reason=>({status:'blocked',reason}));
  // A read never repairs publication, starts interpretation or adopts a pointer.
  return envelope(result.status==='preparing'?'preparing':result.status==='unavailable'?'unavailable':'blocked',args.jobId,result.status==='ready'?'publication-not-committed':result.reason??'presentation-not-ready');
 }
 return Object.freeze({...reads,preparePresentation,readPresentationPreparation});
}
