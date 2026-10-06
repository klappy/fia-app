import {canonicalJSONString,sha256} from '../contract.mjs';
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const same=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b);
const copy=v=>structuredClone(v);
const need=(v,why='sidecar-invalid')=>{if(!v)throw Error(why);};
const encode=v=>new TextEncoder().encode(canonicalJSONString(v));
const exact=(v,keys)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join()===keys.toSorted().join();
// Projection only: all preparation, model calls, dedupe and recovery belong to
// the supplied existing durable shared job. project/validate are pure checks.
export function createRequestSidecars({storage,artifacts,resolve,shared,project,validate,eligible}){
 need(typeof storage?.transaction==='function'&&typeof artifacts?.read==='function'&&typeof artifacts?.write==='function'&&typeof resolve==='function'&&typeof shared?.request==='function'&&typeof project==='function'&&typeof validate==='function'&&typeof eligible==='function','sidecar-ports');
 const tx=storage.transaction.bind(storage),readArtifact=artifacts.read.bind(artifacts),writeArtifact=artifacts.write.bind(artifacts);
 async function context(request){
  const binding=copy(await resolve(copy(request)));
  need(exact(binding,['consumer','sharedRequest','dependencies','capability','contractSha256']));
  need(typeof binding.capability==='string'&&binding.capability.length>0&&binding.capability.length<=128&&digest(binding.contractSha256));
  need(binding.consumer&&typeof binding.consumer==='object'&&binding.dependencies&&Object.getPrototypeOf(binding.dependencies)===Object.prototype&&Object.keys(binding.dependencies).length>0&&Object.keys(binding.dependencies).length<=64&&Object.values(binding.dependencies).every(digest));
  const identity={schema:'fia-request-sidecar-identity@1',...binding};
  const identitySha256=await sha256(encode(identity));
  return {binding,identity,identitySha256,key:'request-sidecar:'+identitySha256};
 }
 async function allowed(c){return await eligible(copy(c.binding))===true;}
 function descriptor(d){need(exact(d,['reference','sha256'])&&digest(d.sha256)&&typeof d.reference==='string'&&d.reference.length>0&&d.reference.length<=2048);return d;}
 function document(v,c){
  need(exact(v,['schema','identity','decision'])&&v.schema==='fia-request-sidecar@1'&&same(v.identity,c.identity));
  const d=v.decision;need(exact(d,['outcome','reason','capability','evidence','result']));
  need(['accept','abstain','reject'].includes(d.outcome)&&typeof d.reason==='string'&&d.reason.length>0&&d.reason.length<=256&&Array.isArray(d.evidence)&&d.evidence.length<=64);
  d.evidence.forEach(descriptor);
  need(d.outcome==='accept'?(d.capability===c.binding.capability&&d.result!==null&&d.evidence.length>0):(d.capability===null&&d.result===null));
  return v;
 }
 async function verified(v,c){document(v,c);need(await allowed(c),'sidecar-revoked');need(await validate(copy(v),{binding:copy(c.binding)})===true,'sidecar-evidence-refused');need(await allowed(c),'sidecar-revoked');return v;}
 async function load(c){
  const record=await tx(t=>t.get(c.key));if(!record)return null;
  need(exact(record,['schema','identitySha256','artifact'])&&record.schema==='fia-request-sidecar-pointer@1'&&record.identitySha256===c.identitySha256);descriptor(record.artifact);
  const bytes=await readArtifact(copy(record.artifact));need(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=1048576&&await sha256(bytes)===record.artifact.sha256,'sidecar-retained-corrupt');
  return verified(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),c);
 }
 const response=(c,state,extra={})=>({state,identitySha256:c.identitySha256,automaticReplay:false,...extra});
 function subscriber(id){need(typeof id==='string'&&id.length>0&&id.length<=256,'sidecar-subscriber');return id;}
 async function subscription(c,id,attach=false){
  const key='request-sidecar-subscriber:'+await sha256(encode({consumer:c.binding.consumer,subscriberId:subscriber(id)}));
  const row=await tx(async t=>{const old=await t.get(key);if(!attach)return old??null;const next={identitySha256:c.identitySha256,token:crypto.randomUUID(),attached:true};await t.put(key,next);return next;});
  return {key,row};
 }
 async function active(c,s){const row=await tx(t=>t.get(s.key));return !!row&&row.attached===true&&row.identitySha256===c.identitySha256&&row.token===s.row?.token;}
 async function result(c,value,s){if(s&&!await active(c,s))return response(c,'detached');if(!await allowed(c))return response(c,'blocked',{reason:'authority-refused'});return response(c,value.decision.outcome==='accept'?'ready':'blocked',{sidecar:copy(value),reason:value.decision.reason});}
 async function read(request,{subscriberId}={}){
  const c=await context(request);if(!await allowed(c))return response(c,'blocked',{reason:'authority-refused'});
  const s=subscriberId===undefined?null:await subscription(c,subscriberId);
  if(s&&!await active(c,s))return response(c,'detached');
  const value=await load(c);return value?result(c,value,s):response(c,'missing');
 }
 async function request(raw,{subscriberId}={}){
  const c=await context(raw);need(subscriberId!==undefined,'sidecar-subscriber');if(!await allowed(c))return response(c,'blocked',{reason:'authority-refused'});
  const s=await subscription(c,subscriberId,true),existing=await load(c);
  if(existing)return result(c,existing,s);
  // This port owns atomic source/dependency dedupe and interrupted-work handling.
  // Multiple consumers may call it; no in-memory lock is a durability claim.
  const preparation=copy(await shared.request(copy(c.binding.sharedRequest)));
  if(!await active(c,s))return response(c,'detached');
  if(!await allowed(c))return response(c,'blocked',{reason:'authority-refused'});
  const decision=copy(await project({binding:copy(c.binding),preparation}));
  if(decision===null){const state=['preparing','uncertain','blocked','unavailable','failed','retryable'].includes(preparation?.state)?preparation.state:'blocked';return response(c,state,{reason:preparation?.reason??'capability-evidence-unavailable'});}
  const value=await verified({schema:'fia-request-sidecar@1',identity:c.identity,decision},c);
  const bytes=encode(value);need(bytes.length<=1048576);const hash=await sha256(bytes);
  const artifact=descriptor(copy(await writeArtifact(bytes,{kind:'request-sidecar'})));need(artifact.sha256===hash,'sidecar-write-identity');
  const retained=await readArtifact(copy(artifact));need(retained instanceof Uint8Array&&await sha256(retained)===hash,'sidecar-write-readback');
  await verified(value,c);
  await tx(async t=>{const current=await t.get(s.key);need(current?.attached&&current.token===s.row.token&&current.identitySha256===c.identitySha256,'sidecar-subscriber-fence');const old=await t.get(c.key);const next={schema:'fia-request-sidecar-pointer@1',identitySha256:c.identitySha256,artifact};need(!old||same(old,next),'sidecar-immutable-conflict');await t.put(c.key,next);});
  return result(c,value,s);
 }
 async function detach(raw,{subscriberId}){const c=await context(raw),s=await subscription(c,subscriberId);await tx(async t=>{const row=await t.get(s.key);if(row?.identitySha256===c.identitySha256)await t.put(s.key,{...row,attached:false,token:crypto.randomUUID()});});return response(c,'detached');}
 return Object.freeze({request,read,detach});
}
