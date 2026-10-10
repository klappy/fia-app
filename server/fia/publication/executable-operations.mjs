const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,keys)=>object(x)&&Object.keys(x).sort().join()===keys.toSorted().join();
const refused=()=>({status:'refused',code:'invalid-request'});
// A named domain refusal (a kebab-case code thrown by a check) is an expected
// conflict and answers typed with its code; an unnamed fault still propagates.
const code=error=>typeof error?.message==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(error.message)&&error.message.length<=80?error.message:null;
async function typed(run,denied){try{return await run();}catch(error){const reason=code(error);if(reason===null)throw error;return denied(reason);}}
export function validPresentationDemand(x){return exact(x,['packId','baseRevision','sourceRevision','capability'])&&typeof x.packId==='string'&&/^(eng|spa)\.MRK-[0-9-]+$/.test(x.packId)&&x.packId.length<=80&&hash(x.baseRevision)&&typeof x.sourceRevision==='string'&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(x.sourceRevision)&&x.capability==='executable-presentation';}
export function createExecutableOperations({reads,service,publication,storage}){
 const tx=storage.transaction.bind(storage);
 const envelope=(status,jobId,reason=null,record=null)=>({schema:'fia-presentation-preparation@1',status,jobId,reason,record});
 async function preparePresentation(args){
  if(!validPresentationDemand(args))return refused();
  if(!service)return envelope('unavailable',null,'presentation-preparation-unavailable');
  const result=await typed(()=>service.request(structuredClone(args),{subscriberId:crypto.randomUUID()}),reason=>({status:'blocked',reason}));
  if(!hash(result?.jobId))return envelope(['blocked','unavailable'].includes(result?.status)?result.status:'blocked',null,result?.reason??'preparation-identity-invalid');
  const key='executable-demand:'+result.jobId;
  const conflict=await typed(()=>tx(async t=>{const old=await t.get(key);if(old&&Object.keys(args).some(k=>old.args[k]!==args[k]))throw Error('presentation-job-conflict');await t.put(key,{args:structuredClone(args),revision:old?.revision??null});}),reason=>envelope('blocked',result.jobId,reason));
  if(conflict)return conflict;
  if(result.status!=='ready')return envelope(['preparing','unavailable','blocked'].includes(result.status)?result.status:'blocked',result.jobId,result.reason??'presentation-not-ready');
  // Publication conflicts (identical identity, pointer race, stale base, revocation,
  // refused validation) are expected immutable outcomes, never an HTTP 500.
  const record=await typed(()=>publication.publish({binding:args,presentation:result.presentation,boundArtifacts:result.boundArtifacts,provenance:{...result.provenance,jobId:result.jobId}}),reason=>({status:'unavailable',reason}));
  if(record.status!=='ready')return envelope('blocked',result.jobId,record.reason??'publication-refused');
  await tx(async t=>{const row=await t.get(key);await t.put(key,{...row,revision:record.revision});});
  return envelope('ready',result.jobId,null,record);
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
