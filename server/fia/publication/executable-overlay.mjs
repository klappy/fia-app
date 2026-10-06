import {canonicalJSONString,sha256} from '../preparation/contract.mjs';
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const copy=x=>structuredClone(x),encode=x=>new TextEncoder().encode(canonicalJSONString(x));
const need=(x,reason='executable-publication-invalid')=>{if(!x)throw Error(reason);};
const same=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b);
const absent=reason=>({status:'unavailable',reason});
const MAX=1048576;

/** Domain validation is supplied by the existing presentation compiler. This is
 * only immutable publication and a transactional catalog overlay, shared by both
 * HTTP and MCP. No model/preparation work is reachable from a read. */
export function createExecutableOverlay({storage,artifacts,base,eligible,validate}){
 need(typeof storage?.transaction==='function'&&typeof artifacts?.read==='function'&&typeof artifacts?.write==='function'&&typeof base?.readCatalog==='function'&&typeof base?.findArtifact==='function'&&typeof eligible==='function'&&typeof validate==='function');
 const tx=storage.transaction.bind(storage);
 async function bytesFor(d){
  need(hash(d?.sha256)&&typeof d.reference==='string'&&Number.isSafeInteger(d.bytes)&&d.bytes>0&&d.bytes<=MAX);
  const b=await artifacts.read({reference:d.reference,sha256:d.sha256});
  need(b instanceof Uint8Array&&b.length===d.bytes&&await sha256(b)===d.sha256,'executable-artifact-corrupt');
  return new Uint8Array(b);
 }
 async function retain(bytes){
  need(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=MAX);
  const digest=await sha256(bytes),d=await artifacts.write(new Uint8Array(bytes),{kind:'executable-presentation'});
  need(d?.sha256===digest&&typeof d.reference==='string');
  const out={reference:d.reference,sha256:digest,bytes:bytes.length,mime:'application/json'};
  await bytesFor(out);return out;
 }
 async function verified(row){
  need(row?.schema==='fia-executable-publication@1'&&hash(row.revision)&&row.artifact.sha256===row.revision&&Array.isArray(row.bound)&&row.bound.length<=1024);
  need(await eligible(copy(row.binding))===true,'executable-publication-revoked');
  const pinnedBase=await base.readCatalog(row.binding.packId,row.binding.baseRevision);need(pinnedBase?.status==='ready'&&pinnedBase.revision===row.binding.baseRevision,'executable-base-unavailable');
  const bytes=await bytesFor(row.artifact),presentation=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  const boundArtifacts=[];
  for(const d of row.bound)boundArtifacts.push({id:d.id,sha256:d.sha256,bytes:await bytesFor(d)});
  need(await validate({presentation,boundArtifacts,provenance:copy(row.provenance),binding:copy(row.binding)})===true,'executable-publication-refused');
  need(await eligible(copy(row.binding))===true,'executable-publication-revoked');
  return {bytes,boundArtifacts};
 }
 function record(row){return {...copy(row.baseRecord),status:'ready',packId:row.binding.packId,revision:row.revision,artifact:{sha256:row.artifact.sha256,bytes:row.artifact.bytes,mime:row.artifact.mime},execution:{schema:'fia-executable-catalog@1',baseRevision:row.binding.baseRevision,sourceRevision:row.binding.sourceRevision,provenance:copy(row.provenance)}};}
 async function publish({binding,presentation,boundArtifacts=[],provenance}){
  need(binding&&typeof binding.packId==='string'&&hash(binding.baseRevision)&&typeof binding.sourceRevision==='string'&&binding.sourceRevision.length<=128&&boundArtifacts.length<=1024);
  const baseRecord=await base.readCatalog(binding.packId,binding.baseRevision);need(baseRecord?.status==='ready'&&baseRecord.revision===binding.baseRevision,'executable-base-unavailable');
  const baseCurrent=await base.readCatalog(binding.packId);need(baseCurrent?.status==='ready'&&baseCurrent.revision===binding.baseRevision,'executable-base-stale');
  const priorPointer=await tx(t=>t.get('executable-current:'+binding.packId));
  need(await eligible(copy(binding))===true,'executable-publication-revoked');
  need(await validate({binding:copy(binding),presentation:copy(presentation),boundArtifacts:copy(boundArtifacts),provenance:copy(provenance)})===true,'executable-publication-refused');
  const seen=new Set(),bound=[];
  for(const b of boundArtifacts){need(typeof b.id==='string'&&b.id.length>0&&!seen.has(b.id)&&hash(b.sha256)&&b.bytes instanceof Uint8Array&&await sha256(b.bytes)===b.sha256);seen.add(b.id);bound.push({id:b.id,...await retain(b.bytes)});}
  const artifact=await retain(encode(presentation)),row={schema:'fia-executable-publication@1',binding:copy(binding),revision:artifact.sha256,artifact,bound,provenance:copy(provenance),baseRecord:copy(baseRecord)};
  await verified(row);
  await tx(async t=>{
   const key='executable-record:'+binding.packId+'@'+row.revision,old=await t.get(key);
   const current=await t.get('executable-current:'+binding.packId);
   need(current===priorPointer||current===key,'executable-pointer-conflict');
   need(await eligible(copy(binding))===true,'executable-publication-revoked');
   const currentBase=await base.readCatalog(binding.packId);need(currentBase?.status==='ready'&&currentBase.revision===binding.baseRevision,'executable-base-stale');
   need(!old||same(old,row),'executable-publication-conflict');
   await t.put(key,row);
   for(const d of [artifact,...bound]){
    const k='executable-artifact:'+d.sha256,owners=await t.get(k)||[];
    if(!owners.includes(key)){need(owners.length<1024);await t.put(k,[...owners,key]);}
   }
   await t.put('executable-current:'+binding.packId,key);
  });
  return readCatalog(binding.packId,row.revision);
 }
 async function readCatalog(packId,revision){
  const found=await tx(async t=>{const key=revision?'executable-record:'+packId+'@'+revision:await t.get('executable-current:'+packId);return {key,row:key?await t.get(key):null};}),row=found.row;
  if(!row&&found.key&&!revision)return absent('executable-pointer-dangling');
  if(!row)return base.readCatalog(packId,revision);
  try{need(row.binding.packId===packId&&(!revision||row.revision===revision)&&found.key===`executable-record:${packId}@${row.revision}`,'executable-pointer-binding');await verified(row);return record(row);}catch(error){return absent(error.message);}
 }
 async function findArtifact(digest){
  const owners=await tx(t=>t.get('executable-artifact:'+digest));
  if(!owners)return base.findArtifact(digest);
  for(const key of owners){
   try{const row=await tx(t=>t.get(key));need(key===`executable-record:${row?.binding?.packId}@${row?.revision}`,'executable-owner-binding');const v=await verified(row);const d=[row.artifact,...row.bound].find(x=>x.sha256===digest);need(d);const b=digest===row.revision?v.bytes:v.boundArtifacts.find(x=>x.sha256===digest)?.bytes;need(b);return {artifact:{sha256:d.sha256,bytes:d.bytes,mime:d.mime},content:new TextDecoder('utf-8',{fatal:true}).decode(b)};}catch{}
  }
  return absent('executable-artifact-unavailable');
 }
 return Object.freeze({publish,readCatalog,findArtifact});
}
