import {canonicalJSONString,sha256} from './contract.mjs';
import {eligibleRows,operationId,json} from './service.mjs';
import {createFreshSourceObservations} from './executor/fresh-source-observation.mjs';
import {createReviewedOriginalStore} from './reviewed-original-store.mjs';
import {readSource,storeSource,verifySourceReference} from './source-store.mjs';
import {originalResponse} from './original.mjs';
const same=(a,b)=>canonicalJSONString(a??null)===canonicalJSONString(b??null);
const normalized=row=>{const {coordinatorCurrent,...admission}=structuredClone(row);return admission;};
export const isReviewedOriginal=row=>Boolean(row.accepted&&row.selection.quality==='original');
export async function stableOriginalIdentity(row){
 const selection=structuredClone(row.selection);delete selection.presentationRevision;
 const match=/^[a-z]{3}\.([A-Z0-9]{3})-(\d+-\d+(?:-\d+)?)$/.exec(selection.packId);
 if(!match||typeof selection.resource!=='string'||!selection.resource)throw Error('stable-selection');
 const logicalId=canonicalJSONString({schema:'fia-stable-original-selection@1',...selection,book:match[1],passage:match[2]});
 return {logicalId,name:`stable-original-v1:${await sha256(logicalId)}`};
}
export async function stableOriginalRequest(env,row,action,request=null){
 const {name}=await stableOriginalIdentity(row),id=await operationId(row);
 return env.FIA_PREPARATION_JOBS.get(env.FIA_PREPARATION_JOBS.idFromName(name)).fetch(new Request(`https://preparation.internal/_stable-original/${id}/${action}`,{method:action==='demand'?'POST':request?.method??'GET',headers:request?.headers}));
}
export async function serveStableOriginal(request,ctx,env,catalog){
 const parts=new URL(request.url).pathname.split('/');if(parts[1]!=='_stable-original')return null;
 const id=parts[2],action=parts[3];if(parts.length!==4||!['demand','read','audio'].includes(action)||request.method!==(action==='demand'?'POST':request.method==='HEAD'&&action==='audio'?'HEAD':'GET'))return json(404,{state:'unavailable'});
 const rows=catalog.entries.filter(isReviewedOriginal),indexed=await Promise.all(rows.map(async raw=>({raw,row:normalized(raw),id:await operationId(raw),identity:await stableOriginalIdentity(raw),hash:await sha256(canonicalJSONString(normalized(raw)))})));
 const target=indexed.find(e=>e.id===id);if(!target||target.raw.eligibility!=='eligible')return json(404,{state:'unavailable'});
 if(ctx.id.toString()!==env.FIA_PREPARATION_JOBS.idFromName(target.identity.name).toString())return json(403,{state:'unavailable',reason:'stable-object-identity'});
 const group=indexed.filter(e=>e.identity.name===target.identity.name),current=()=>{const live=group.filter(e=>catalog.entries.includes(e.raw)&&e.raw.eligibility==='eligible'&&same(normalized(e.raw),e.row));const marked=live.filter(e=>e.raw.coordinatorCurrent===true);return live.length===1?live[0]:marked.length===1?marked[0]:null;};
 const eligible=row=>group.some(e=>same(e.row,row)&&catalog.entries.includes(e.raw)&&e.raw.eligibility==='eligible'&&same(normalized(e.raw),e.row));
 const storage=ctx.storage,bucket=env.FIA_ORIGINALS,logicalId=target.identity.logicalId,freshKey=`fresh-head:${await sha256(logicalId)}`;
 const snapshotLogical=canonicalJSONString(Object.fromEntries(Object.entries(target.row.selection).filter(([key])=>key!=='presentationRevision'))),snapshotKey=`reviewed-original:head:${await sha256(snapshotLogical)}`;
 const controlKey='stable-original:control',ticketKey=`stable-original:admission:${target.hash}`;
 function checked(value){
  if(value==null)return null;
  const keys=['schema','admissionSha256','desiredSequence','attemptId','expiresAt','expectedServed','source','ticket','observation'];
  const entry=group.find(e=>e.hash===value.admissionSha256),hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
  if(!hex(value.admissionSha256)||Object.keys(value).sort().join()!==keys.sort().join()||value.schema!=='fia-stable-original-attempt@1'||!Number.isSafeInteger(value.desiredSequence)||value.desiredSequence<1||typeof value.attemptId!=='string'||!/^[-a-f0-9]{36}$/.test(value.attemptId)||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<1||value.source?.logicalId!==logicalId||value.source.sourceVersionKind!=='discovery-snapshot'||value.source.publisherVersion!==null||typeof value.source.url!=='string'||typeof value.source.sourceVersion!=='string'||entry&&!same(value.source,{logicalId,url:entry.row.source.url,sourceVersionKind:'discovery-snapshot',sourceVersion:entry.row.selection.presentationRevision,publisherVersion:null})||value.ticket?.checkId!==value.admissionSha256)throw Error('stable-control-corrupt');
  if(value.expectedServed!==null&&(!value.expectedServed||Object.keys(value.expectedServed).sort().join()!=='admissionSha256,snapshotSha256'||!hex(value.expectedServed.admissionSha256)||!hex(value.expectedServed.snapshotSha256)))throw Error('stable-control-corrupt');
  return value;
 }

 await storage.transaction(async tx=>{const marker=await tx.get('stable-original:identity');if(marker&&!same(marker,target.identity))throw Error('stable-identity-corrupt');if(!marker)await tx.put('stable-original:identity',target.identity);});
 async function original(row){if(!eligible(row))throw Error('stable-ineligible');await verifySourceReference(bucket,row.source,row.identity.sourceVersion);const bytes=await readSource(bucket,row.source);if(!bytes||!eligible(row))throw Error('stable-source-missing');return bytes;}
 if(action==='audio'){try{return originalResponse(request,target.row.source,await original(target.row));}catch{return json(409,{state:'unavailable',reason:'source-not-verified'});}}
 const policy={revision:'fia-stable-original-fresh-check@1',maxBytes:2097152,totalMs:30000,progressMs:15000};
 function observer(reservation){return createFreshSourceObservations({storage,bucket,source:reservation.source,policy,admissions:[reservation.ticket],eligibility:({phase,source,admission})=>{
  const admitted=group.find(e=>e.hash===(phase==='read'?admission.checkId:reservation.admissionSha256)&&e.row.source.url===source.url&&e.row.selection.presentationRevision===source.sourceVersion&&eligible(e.row));
  return Boolean(admitted&&(phase==='read'||current()?.hash===admitted.hash));
 }});}
 let reservation=checked(await storage.get(ticketKey)),owned=false;
 if(action==='demand'&&current()?.hash===target.hash){
  const claim=await storage.transaction(async tx=>{
   const existing=checked(await tx.get(ticketKey));if(existing)return {reservation:existing,owned:false};if(current()?.hash!==target.hash)throw Error('stable-not-current');
   const prior=checked(await tx.get(controlKey)),head=await tx.get(freshKey),snapshot=await tx.get(snapshotKey),sequence=Math.max(prior?.ticket.sequence??0,head?.sequence??0)+1,desiredSequence=(prior?.desiredSequence??0)+1;
   const next={schema:'fia-stable-original-attempt@1',admissionSha256:target.hash,desiredSequence,attemptId:crypto.randomUUID(),expiresAt:Date.now()+60000,expectedServed:snapshot?.served??null,source:{logicalId,url:target.row.source.url,sourceVersionKind:'discovery-snapshot',sourceVersion:target.row.selection.presentationRevision,publisherVersion:null},ticket:{checkId:target.hash,sequence,expectedPreviousObservationSha256:head?.observationSha256??null,previousSourceSha256:head?.sourceSha256??null},observation:null};
   await tx.put(ticketKey,next);await tx.put(controlKey,next);return {reservation:next,owned:true};
  });reservation=claim.reservation;owned=claim.owned;
 }
 async function readOutcome(){
  const control=checked(await storage.get(controlKey));if(!control)return {state:'unavailable',reason:'stable-not-requested',result:null};
  const observed=await observer(control).read();if(observed.state!=='observed')return {state:'unavailable',reason:'stable-unobserved',result:null};
  const token=await storage.get(freshKey);if(token?.observationSha256!==observed.observationSha256)throw Error('stable-fresh-changed');
  return (await store(control,token,false)).read(target.row.accepted.expected.resultSha256);
 }
 async function store(attempt,token,promote){return createReviewedOriginalStore({storage,bucket,admissions:group.map(e=>e.row),fetchAsset:path=>env.ASSETS.fetch(new Request(new URL(path,env.FIA_API_ORIGIN),{redirect:'manual'})),readOriginal:original,eligibility:eligible,guard:async(tx,row,phase)=>{
  const control=await tx.get(controlKey),fresh=await tx.get(freshKey);if(!same(fresh,token)||!same(control,attempt)||!eligible(row))return false;
  if(phase==='read')return true;
  const head=await tx.get(snapshotKey);
  return promote&&current()?.hash===target.hash&&control.admissionSha256===target.hash&&Date.now()<control.expiresAt&&same(head?.served??null,control.expectedServed)&&token.sourceSha256===target.row.source.sha256&&token.bytes===target.row.source.bytes;
 }});}
 if(owned){try{
  const outcome=await observer(reservation).observe(reservation.ticket.checkId);
  if(outcome.state!=='completed'||!outcome.promoted)throw Error('stable-observation-unavailable');
  const observed=await observer(reservation).read(),token=await storage.get(freshKey);
  if(token?.observationSha256!==observed.observationSha256||token.sourceSha256!==target.row.source.sha256||token.bytes!==target.row.source.bytes)throw Error('stable-source-changed');
  const bytes=await readSource(bucket,target.row.source);if(!bytes)throw Error('stable-source-missing');await storeSource(bucket,target.row.source,bytes,target.row.identity.sourceVersion);
  const attempt={...reservation,observation:token};
  await storage.transaction(async tx=>{if(!same(await tx.get(controlKey),reservation)||!same(await tx.get(freshKey),token)||current()?.hash!==target.hash||Date.now()>=reservation.expiresAt)throw Error('stable-stale-attempt');await tx.put(controlKey,attempt);await tx.put(ticketKey,attempt);});
  await (await store(attempt,token,true)).demand(target.row.accepted.expected.resultSha256);
 }catch{/* Durable ticket remains consumed. No automatic retry or fabricated freshness. */}}
 try{return json(200,await readOutcome());}catch{return json(200,{state:'unavailable',reason:'stable-evidence-unavailable',result:null});}
}
