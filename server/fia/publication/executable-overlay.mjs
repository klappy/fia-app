import {canonicalJSONString,sha256} from '../preparation/contract.mjs';
import {PUBLICATION_PIN_SCHEMA,validateBaseManifest,buildBoundManifest,publicationGeneration,jsonDescriptor,validDescriptor,nativeAudioFiles,nativeVisualFiles} from './publication-generation.mjs';
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const copy=x=>structuredClone(x),encode=x=>new TextEncoder().encode(canonicalJSONString(x));
const need=(x,reason='executable-publication-invalid')=>{if(!x)throw Error(reason);};
const same=(a,b)=>canonicalJSONString(a)===canonicalJSONString(b);
const MAX=1048576;
// A named domain code (kebab-case, thrown by a check) is a verification miss; an
// unnamed fault (storage/R2 exception, TypeError) or a timeout is transient.
const named=e=>typeof e?.message==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(e.message)&&e.message.length<=80;
const kindOf=e=>named(e)&&!/-timeout$/.test(e.message)?'verification':'transient';
// F7a1: a generation-aware publication is stored by (packId, generation); a legacy one by (packId, revision).
const keyFor=row=>row?.publication?`executable-generation:${row?.binding?.packId}@${row.publication.generation}`:`executable-record:${row?.binding?.packId}@${row?.revision}`;
const describe=d=>({id:d.id,sha256:d.sha256,bytes:d.bytes,mime:d.mime});

/** Domain validation is supplied by the existing presentation compiler. This is
 * a content-keyed cache over the base catalog, shared by both HTTP and MCP; it is
 * never an identity or trust ledger (cookbook package-luke RULING.md § DEV
 * publication conflict). A publish whose record key exists replaces the row and
 * advances the pointer. A stored row that fails byte, hash, length or binding
 * verification is a cache miss: reads fall through to the base catalog, and the
 * failure is reported only to the optional `diagnose` hook, tagged `kind`
 * `verification` or `transient` (a storage/R2 fault: the same read may succeed on
 * retry). No model/preparation work is reachable from a read. */
// baseManifests (F7a1, optional): {read(packId)} returning the build-pinned, hash-verified UTF-8 bytes of the
// passage's offline manifest ({bytes,sha256}). With it, a publication of a presentation with assets becomes
// generation-aware: it retains that base manifest, builds and retains the bound mediaManifest, computes its
// generation, and is stored by generation (OFFLINE-EXECUTION "Publication generations").
// visualAuthority (F7a3, optional): async ({binding,executionRevision,entry}) => true while that native visual
// entry is still a current publication of this execution (Otto's pure published() read). A row carrying a
// visual without it is a cache miss, never served.
export function createExecutableOverlay({storage,artifacts,base,eligible,validate,diagnose=()=>{},baseManifests=null,visualAuthority=null}){
 need(typeof storage?.transaction==='function'&&typeof artifacts?.read==='function'&&typeof artifacts?.write==='function'&&typeof base?.readCatalog==='function'&&typeof base?.findArtifact==='function'&&typeof eligible==='function'&&typeof validate==='function');
 const tx=storage.transaction.bind(storage);
 // Diagnostics only: integrity pins feed bookkeeping, never a usage gate.
 // A throwing or rejecting hook is contained; it never changes the read's answer.
 const miss=(where,detail)=>{try{const r=diagnose({event:'executable-cache-miss',where,...detail});if(typeof r?.then==='function')Promise.resolve(r).catch(()=>{});}catch{}};
 const fault=(where,detail,error)=>miss(where,{...detail,kind:kindOf(error),reason:error?.message});
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
 async function verified(row,check=validate){
  need(row?.schema==='fia-executable-publication@1'&&hash(row.revision)&&object(row.artifact)&&row.artifact.sha256===row.revision&&object(row.binding)&&typeof row.binding.packId==='string'&&hash(row.binding.baseRevision)&&typeof row.binding.sourceRevision==='string'&&row.binding.sourceRevision.length<=128&&Array.isArray(row.bound)&&row.bound.length<=1024&&row.bound.every(d=>object(d)&&typeof d.id==='string')&&object(row.provenance)&&object(row.baseRecord));
  need(await eligible(copy(row.binding))===true,'executable-publication-revoked');
  const pinnedBase=await base.readCatalog(row.binding.packId,row.binding.baseRevision);need(pinnedBase?.status==='ready'&&pinnedBase.revision===row.binding.baseRevision,'executable-base-unavailable');
  const bytes=await bytesFor(row.artifact);let presentation;
  try{presentation=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('executable-artifact-corrupt');}
  need(object(presentation),'executable-artifact-corrupt');
  if(presentation.assets){
   need(same(row.mediaIdentity,{packId:row.binding.packId,revision:row.binding.baseRevision})&&row.mediaAssetsSha256===await sha256(encode(presentation.assets)),'executable-media-binding');
   const original=await base.findArtifact(row.binding.baseRevision);need(original?.content&&await sha256(new TextEncoder().encode(original.content))===row.binding.baseRevision&&same(JSON.parse(original.content).assets,presentation.assets),'executable-media-base-unavailable');
  }else need(row.mediaIdentity===null&&row.mediaAssetsSha256===null,'executable-media-binding');
  const boundArtifacts=[];
  for(const d of row.bound)boundArtifacts.push({id:d.id,sha256:d.sha256,bytes:await bytesFor(d)});
  // Historical validation: the closure is rebuilt from this row's own retained base-manifest bytes, never
  // from today's build pin, so a newer shell alone is not revocation (OFFLINE "Historical eligibility").
  let manifests=null;
  if(row.publication!==undefined){
   const pin=row.publication;
   need(object(pin)&&Object.keys(pin).sort().join()==='baseManifest,generation,schema'&&pin.schema===PUBLICATION_PIN_SCHEMA&&hash(pin.generation)&&validDescriptor(pin.baseManifest,/^base-offline:[a-f0-9]{64}$/)&&pin.baseManifest.id===`base-offline:${pin.baseManifest.sha256}`&&validDescriptor(row.mediaManifest)&&hash(row.mediaAssetsSha256),'publication-pin-invalid');
   need(row.baseManifestArtifact?.sha256===pin.baseManifest.sha256&&row.baseManifestArtifact.bytes===pin.baseManifest.bytes&&row.mediaManifestArtifact?.sha256===row.mediaManifest.sha256&&row.mediaManifestArtifact.bytes===row.mediaManifest.bytes,'publication-pin-invalid');
   const baseBytes=await bytesFor(row.baseManifestArtifact),mediaBytes=await bytesFor(row.mediaManifestArtifact);
   const bound=await buildBoundManifest(validateBaseManifest(baseBytes,{packId:row.binding.packId,baseRevision:row.binding.baseRevision}),{packId:row.binding.packId,executionRevision:row.revision,baseRevision:row.binding.baseRevision,mediaAssetsSha256:row.mediaAssetsSha256},[...nativeAudioFiles(boundArtifacts),...nativeVisualFiles(row.visuals??[])]);
   need(same(bound.descriptor,row.mediaManifest)&&same(Array.from(bound.bytes),Array.from(mediaBytes)),'publication-manifest-mismatch');
   const {generation}=await publicationGeneration({packId:row.binding.packId,executionRevision:row.revision,baseRevision:row.binding.baseRevision,sourceRevision:row.binding.sourceRevision,baseManifest:pin.baseManifest,mediaManifest:row.mediaManifest,artifacts:row.bound.map(describe)});
   need(generation===pin.generation,'publication-generation-mismatch');
   for(const entry of row.visuals??[])need(visualAuthority&&await visualAuthority({binding:copy(row.binding),executionRevision:row.revision,entry:copy(entry)})===true,'visual-publication-stale');
   manifests={base:baseBytes,media:mediaBytes};
  }
  need(await check({presentation,boundArtifacts,provenance:copy(row.provenance),binding:copy(row.binding)})===true,'executable-publication-refused');
  need(await eligible(copy(row.binding))===true,'executable-publication-revoked');
  return {bytes,boundArtifacts,manifests};
 }
 function record(row){return {...copy(row.baseRecord),status:'ready',packId:row.binding.packId,revision:row.revision,artifact:{sha256:row.artifact.sha256,bytes:row.artifact.bytes,mime:row.artifact.mime},execution:{schema:'fia-executable-catalog@1',baseRevision:row.binding.baseRevision,sourceRevision:row.binding.sourceRevision,artifacts:row.bound.map(({id,sha256,bytes,mime})=>({id,sha256,bytes,mime})),mediaIdentity:row.mediaIdentity??null,mediaAssetsSha256:row.mediaAssetsSha256??null,provenance:copy(row.provenance),...(row.publication?{publication:copy(row.publication),mediaManifest:copy(row.mediaManifest)}:{})}};}
 async function generationAt(key){if(!key)return null;const row=await tx(t=>t.get(key));return hash(row?.publication?.generation)?row.publication.generation:null;}
 // The generation the current pointer selects for this pack, or null (OFFLINE expectedPublicationGeneration).
 async function currentGeneration(packId){return generationAt(await tx(t=>t.get('executable-current:'+packId)));}
 async function publish({binding,presentation,boundArtifacts=[],provenance,expectedPublicationGeneration}){
  need(binding&&typeof binding.packId==='string'&&hash(binding.baseRevision)&&typeof binding.sourceRevision==='string'&&binding.sourceRevision.length<=128&&boundArtifacts.length<=1024);
  const baseRecord=await base.readCatalog(binding.packId,binding.baseRevision);need(baseRecord?.status==='ready'&&baseRecord.revision===binding.baseRevision,'executable-base-unavailable');
  const baseCurrent=await base.readCatalog(binding.packId);need(baseCurrent?.status==='ready'&&baseCurrent.revision===binding.baseRevision,'executable-base-stale');
  const priorPointer=await tx(t=>t.get('executable-current:'+binding.packId));
  // A supplied expectation binds the intended prior publication before any work; mismatch is typed stale.
  if(expectedPublicationGeneration!==undefined){need(expectedPublicationGeneration===null||hash(expectedPublicationGeneration),'executable-publication-invalid');need(expectedPublicationGeneration===await generationAt(priorPointer),'publication-generation-stale');}
  need(await eligible(copy(binding))===true,'executable-publication-revoked');
  need(await validate({binding:copy(binding),presentation:copy(presentation),boundArtifacts:copy(boundArtifacts),provenance:copy(provenance)})===true,'executable-publication-refused');
  let mediaIdentity=null,mediaAssetsSha256=null;
  if(presentation.assets){
   const original=await base.findArtifact(binding.baseRevision);need(original?.content&&await sha256(new TextEncoder().encode(original.content))===binding.baseRevision,'executable-media-base-unavailable');
   const originalPresentation=JSON.parse(original.content);need(same(originalPresentation.assets,presentation.assets),'executable-media-assets-changed');
   mediaIdentity={packId:binding.packId,revision:binding.baseRevision};mediaAssetsSha256=await sha256(encode(presentation.assets));
  }
  const seen=new Set(),bound=[];
  for(const b of boundArtifacts){need(typeof b.id==='string'&&b.id.length>0&&!seen.has(b.id)&&hash(b.sha256)&&b.bytes instanceof Uint8Array&&await sha256(b.bytes)===b.sha256);seen.add(b.id);bound.push({id:b.id,...await retain(b.bytes)});}
  const artifact=await retain(encode(presentation)),row={schema:'fia-executable-publication@1',binding:copy(binding),revision:artifact.sha256,artifact,bound,mediaIdentity,mediaAssetsSha256,provenance:copy(provenance),baseRecord:copy(baseRecord)};
  // Retain the verified base manifest, then build and retain the bound manifest, then compute the generation
  // (OFFLINE L33: presentation first, manifest from it, then the record; no hash cycle).
  if(baseManifests&&mediaAssetsSha256){
   const pinned=await baseManifests.read(binding.packId);
   need(pinned?.bytes instanceof Uint8Array&&hash(pinned.sha256)&&await sha256(pinned.bytes)===pinned.sha256,'base-manifest-unavailable');
   const baseManifest=validateBaseManifest(pinned.bytes,{packId:binding.packId,baseRevision:binding.baseRevision});
   const baseArtifact=await retain(pinned.bytes),baseDescriptor=jsonDescriptor(`base-offline:${pinned.sha256}`,pinned.bytes,pinned.sha256);
   const bound=await buildBoundManifest(baseManifest,{packId:binding.packId,executionRevision:row.revision,baseRevision:binding.baseRevision,mediaAssetsSha256},nativeAudioFiles(boundArtifacts));
   const mediaArtifact=await retain(bound.bytes);
   const {generation}=await publicationGeneration({packId:binding.packId,executionRevision:row.revision,baseRevision:binding.baseRevision,sourceRevision:binding.sourceRevision,baseManifest:baseDescriptor,mediaManifest:bound.descriptor,artifacts:row.bound.map(describe)});
   Object.assign(row,{publication:{schema:PUBLICATION_PIN_SCHEMA,generation,baseManifest:baseDescriptor},mediaManifest:bound.descriptor,baseManifestArtifact:baseArtifact,mediaManifestArtifact:mediaArtifact});
  }
  await verified(row);
  await tx(async t=>{
   const key=keyFor(row);
   const current=await t.get('executable-current:'+binding.packId);
   need(current===priorPointer||current===key,row.publication?'publication-generation-stale':'executable-pointer-conflict');
   need(await eligible(copy(binding))===true,'executable-publication-revoked');
   const currentBase=await base.readCatalog(binding.packId);need(currentBase?.status==='ready'&&currentBase.revision===binding.baseRevision,'executable-base-stale');
   // Content-keyed cache: an existing row under this key is replaced, never a conflict.
   // Owner-index entries for artifacts the replaced row bound and this one does not are
   // pruned, so they neither count toward the 1024 cap nor cost findArtifact a pass.
   const replaced=await t.get(key),own=[artifact,...bound,...(row.publication?[row.baseManifestArtifact,row.mediaManifestArtifact]:[])],keep=new Set(own.map(d=>d.sha256));
   // An identical generation is reused with its original provenance, never overwritten (OFFLINE L31).
   if(row.publication&&replaced){await t.put('executable-current:'+binding.packId,key);return;}
   await t.put(key,row);
   if(row.publication){const k=`executable-generations:${binding.packId}@${row.revision}`,keys=await t.get(k)||[];if(!keys.includes(key)){need(keys.length<1024);await t.put(k,[...keys,key]);}}
   for(const d of [replaced?.artifact,...(Array.isArray(replaced?.bound)?replaced.bound:[])]){
    if(!hash(d?.sha256)||keep.has(d.sha256))continue;
    const k='executable-artifact:'+d.sha256,owners=await t.get(k);if(!Array.isArray(owners)||!owners.includes(key))continue;
    const rest=owners.filter(o=>o!==key);if(!rest.length&&typeof t.delete==='function')await t.delete(k);else await t.put(k,rest);
   }
   for(const d of own){
    const k='executable-artifact:'+d.sha256,owners=await t.get(k)||[];
    if(!owners.includes(key)){need(owners.length<1024);await t.put(k,[...owners,key]);}
   }
   await t.put('executable-current:'+binding.packId,key);
  });
  return readCatalog(binding.packId,row.revision,row.publication?.generation);
 }
 // Selectors (OFFLINE "Exact selection"): none = the current pointer; revision = the single retained
 // publication with that revision (several generations are ambiguous, counted before eligibility);
 // revision and generation = that exact stored record, never a fallback.
 // F7a3: a ready native visual changes the bound manifest, so it is a new generation of the same execution.
 // The current generation row is extended with the published entries (kept in declaration order; one per
 // asset, identical entries reused), its bound manifest rebuilt, and the pointer compared-and-swapped from
 // exactly that generation. The presentation, bound JSON and provenance are unchanged.
 async function publishVisuals({packId,revision,expectedPublicationGeneration,visuals}){
  need(typeof packId==='string'&&hash(revision)&&hash(expectedPublicationGeneration)&&Array.isArray(visuals)&&visuals.length>0,'executable-publication-invalid');
  const pointer=await tx(t=>t.get('executable-current:'+packId)),current=pointer?await tx(t=>t.get(pointer)):null;
  need(current?.publication?.generation===expectedPublicationGeneration&&current.revision===revision&&pointer===keyFor(current),'publication-generation-stale');
  const v=await verified(current),merged=[...(current.visuals??[])];
  for(const entry of nativeVisualFiles(visuals)){const prior=merged.find(e=>e.assetId===entry.assetId);if(prior){need(same(prior,entry),'bound-visual-conflict');continue;}merged.push(entry);}
  if(merged.length===(current.visuals??[]).length)return readCatalog(packId,revision,current.publication.generation);
  const baseManifest=validateBaseManifest(v.manifests.base,{packId,baseRevision:current.binding.baseRevision});
  const bound=await buildBoundManifest(baseManifest,{packId,executionRevision:revision,baseRevision:current.binding.baseRevision,mediaAssetsSha256:current.mediaAssetsSha256},[...nativeAudioFiles(v.boundArtifacts),...nativeVisualFiles(merged)]);
  const mediaArtifact=await retain(bound.bytes);
  const {generation}=await publicationGeneration({packId,executionRevision:revision,baseRevision:current.binding.baseRevision,sourceRevision:current.binding.sourceRevision,baseManifest:current.publication.baseManifest,mediaManifest:bound.descriptor,artifacts:current.bound.map(describe)});
  const row={...copy(current),visuals:merged,publication:{...copy(current.publication),generation},mediaManifest:bound.descriptor,mediaManifestArtifact:mediaArtifact};
  await verified(row);
  await tx(async t=>{
   const key=keyFor(row);need(await t.get('executable-current:'+packId)===pointer,'publication-generation-stale');
   need(await eligible(copy(row.binding))===true,'executable-publication-revoked');
   if(!await t.get(key)){await t.put(key,row);const k=`executable-generations:${packId}@${revision}`,keys=await t.get(k)||[];if(!keys.includes(key)){need(keys.length<1024);await t.put(k,[...keys,key]);}
    for(const d of [row.artifact,...row.bound,row.baseManifestArtifact,row.mediaManifestArtifact]){const k='executable-artifact:'+d.sha256,owners=await t.get(k)||[];if(!owners.includes(key)){need(owners.length<1024);await t.put(k,[...owners,key]);}}}
   await t.put('executable-current:'+packId,key);
  });
  return readCatalog(packId,revision,generation);
 }
 // Historical access for the original-visuals route (F7a / port acceptance condition): ready only when a
 // retained generation of exactly this execution revision verifies now (bytes, eligibility, current visual
 // authority) and lists exactly this native entry. Read-only; a forged or revoked revision is unavailable.
 async function retainedVisual({packId,executionRevision,assetId,sha256:digest}){
  if(typeof packId!=='string'||!hash(executionRevision)||typeof assetId!=='string'||!hash(digest))return {status:'refused',code:'invalid-request'};
  let keys;try{keys=await tx(t=>t.get(`executable-generations:${packId}@${executionRevision}`));}catch(error){fault('retainedVisual',{packId},error);return {status:'unavailable',reason:'retained-evidence-unavailable'};}
  for(const key of Array.isArray(keys)?keys:[]){
   try{const row=await tx(t=>t.get(key));need(key===keyFor(row)&&row.revision===executionRevision&&row.binding.packId===packId,'executable-owner-binding');const entry=(row.visuals??[]).find(e=>e.assetId===assetId&&e.sha256===digest);if(!entry)continue;await verified(row);return {status:'ready',entry:copy(entry)};}
   catch(error){fault('retainedVisual',{packId,key},error);}
  }
  return {status:'unavailable',reason:'execution-not-current'};
 }
 async function readCatalog(packId,revision,generation){
  let found;
  try{found=await tx(async t=>{
   if(generation){const key=`executable-generation:${packId}@${generation}`;return {key,row:await t.get(key),exact:true};}
   if(revision){const keys=await t.get(`executable-generations:${packId}@${revision}`);if(Array.isArray(keys)&&keys.length>1)return {ambiguous:true};const key=Array.isArray(keys)&&keys.length===1?keys[0]:'executable-record:'+packId+'@'+revision;return {key,row:await t.get(key)};}
   const key=await t.get('executable-current:'+packId);return {key,row:key?await t.get(key):null};});}
  // An exact-revision read (including publish()'s post-commit read) cannot be answered
  // by the base, so its storage fault propagates; only the pointer read falls through.
  catch(error){if(revision)throw error;fault('readCatalog',{packId},error);return base.readCatalog(packId);}
  if(found.ambiguous)return {status:'unavailable',reason:'publication-generation-ambiguous'};
  const row=found.row;
  if(found.exact&&!row)return {status:'unavailable',reason:'publication-generation-unavailable'};
  if(!row&&found.key&&!revision)miss('readCatalog',{packId,key:found.key,kind:'verification',reason:'executable-pointer-dangling'});
  if(!row)return base.readCatalog(packId,revision);
  try{need(row.binding?.packId===packId&&(!revision||row.revision===revision)&&(!generation||row.publication?.generation===generation)&&found.key===keyFor(row),'executable-pointer-binding');await verified(row);return record(row);}
  catch(error){fault('readCatalog',{packId,key:found.key},error);if(revision&&kindOf(error)==='transient')throw error;if(found.exact)return {status:'unavailable',reason:'publication-generation-unavailable'};return base.readCatalog(packId,revision);}
 }
 async function findArtifact(digest){
  let owners;
  try{owners=await tx(t=>t.get('executable-artifact:'+digest));}catch(error){fault('findArtifact',{digest},error);return base.findArtifact(digest);}
  if(!Array.isArray(owners))return base.findArtifact(digest);
  for(const key of owners){
   try{const row=await tx(t=>t.get(key));need(key===keyFor(row),'executable-owner-binding');const v=await verified(row);const d=[row.artifact,...row.bound,...(row.publication?[row.baseManifestArtifact,row.mediaManifestArtifact]:[])].find(x=>x?.sha256===digest);need(d);const b=digest===row.revision?v.bytes:v.manifests&&digest===row.baseManifestArtifact?.sha256?v.manifests.base:v.manifests&&digest===row.mediaManifestArtifact?.sha256?v.manifests.media:v.boundArtifacts.find(x=>x.sha256===digest)?.bytes;need(b);return {artifact:{sha256:d.sha256,bytes:d.bytes,mime:d.mime},content:new TextDecoder('utf-8',{fatal:true}).decode(b),cacheControl:'private, no-store'};}catch(error){fault('findArtifact',{digest,key},error);}
  }
  return base.findArtifact(digest);
 }
 return Object.freeze({publish,publishVisuals,readCatalog,findArtifact,currentGeneration,retainedVisual});
}
