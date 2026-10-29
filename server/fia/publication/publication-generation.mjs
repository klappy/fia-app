// F7a1 (cross-pericope PLAN §7; OFFLINE-EXECUTION "Publication generations retain their own verified base
// manifest"). Pure, deterministic pieces of a generation-aware executable publication:
// - the retained base manifest: the exact build-pinned UTF-8 bytes of the passage's offline manifest;
// - the bound mediaManifest: the base manifest's files plus its identity fields, and the native files of the
//   bound narration audio (F7a2); F7a3 adds the native visual entries;
// - the publication generation: SHA-256 of the closed canonical preimage.
// No I/O and no authority here: the overlay retains bytes and checks current eligibility.
import {canonicalJSONString,sha256} from '../preparation/contract.mjs';

export const PUBLICATION_PIN_SCHEMA='fia-executable-publication-pin@1';
export const GENERATION_SCHEMA='fia-executable-publication-generation@1';
const MAX=1048576,hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const need=(ok,reason)=>{if(!ok)throw Error(reason);};
const decode=bytes=>{try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('base-manifest-invalid');}};

// The descriptor of a retained JSON artifact (OFFLINE L9/L23): closed, at most 1 MiB, application/json.
export function jsonDescriptor(id,bytes,digest){return {id,sha256:digest,bytes:bytes.length,mime:'application/json'};}
export function validDescriptor(d,idPattern=null){return object(d)&&Object.keys(d).sort().join()==='bytes,id,mime,sha256'&&typeof d.id==='string'&&d.id.length>0&&d.id.length<=1024&&(!idPattern||idPattern.test(d.id))&&hash(d.sha256)&&Number.isSafeInteger(d.bytes)&&d.bytes>0&&d.bytes<=MAX&&d.mime==='application/json';}

// Verify the retained base manifest's own identity before retention or reuse: numeric schema 1, this pack,
// this base presentation revision, a present deliveryRevision being a SHA-256, and a well-formed file list.
export function validateBaseManifest(bytes,{packId,baseRevision}){
 need(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=MAX,'base-manifest-invalid');
 const m=decode(bytes);
 need(object(m)&&m.schema===1&&m.packId===packId&&m.presentationRevision===baseRevision&&typeof m.revision==='string'&&m.revision.length>0&&Array.isArray(m.files)&&m.files.length>0&&m.files.length<=4096,'base-manifest-invalid');
 need(!Object.hasOwn(m,'deliveryRevision')||hash(m.deliveryRevision),'base-manifest-invalid');
 // OFFLINE L15/L97: a present deliveryRevision names the delivery sidecar the base lists; absence is valid only
 // when no file or variant depends on delivery metadata; a dependent value always equals the manifest's.
 const dependents=m.files.flatMap(f=>[f,...(object(f.variants)?Object.values(f.variants):[])]).filter(f=>object(f)&&(Object.hasOwn(f,'deliveryURL')||Object.hasOwn(f,'deliveryRevision')));
 if(Object.hasOwn(m,'deliveryRevision'))need(m.files.some(f=>f.group==='core'&&f.path===`/content/delivery/${packId}/${m.deliveryRevision}.json`)&&dependents.every(f=>f.deliveryRevision===m.deliveryRevision),'base-manifest-invalid');
 else need(dependents.length===0,'base-manifest-invalid');
 const paths=new Set();
 for(const f of m.files){need(object(f)&&typeof f.path==='string'&&f.path.startsWith('/')&&!f.path.startsWith('//')&&!paths.has(f.path)&&hash(f.sha256)&&Number.isSafeInteger(f.bytes)&&f.bytes>0&&typeof f.group==='string','base-manifest-invalid');paths.add(f.path);}
 return m;
}

// The bound manifest (OFFLINE L13-L17): the existing offline shape, with deliveryRevision mirrored exactly
// (present only when the verified base has it), plus id, executionRevision, mediaIdentity and mediaAssetsSha256.
// Its revision is the SHA-256 of its canonical content without `id` and `revision`; its id names that revision.
export async function buildBoundManifest(base,{packId,executionRevision,baseRevision,mediaAssetsSha256},native=[]){
 need(base?.packId===packId&&base.presentationRevision===baseRevision&&hash(executionRevision)&&hash(mediaAssetsSha256),'bound-manifest-identity');
 // Native files follow the base files; a path the base already lists must be byte-identical, never replaced.
 const files=structuredClone(base.files),byPath=new Map(files.map(f=>[f.path,f]));
 // A native path never overlaps a base path (review N4): the base files are mirrored, never shared or replaced.
 for(const f of native){need(!byPath.has(f.path),'bound-manifest-conflict');files.push(structuredClone(f));byPath.set(f.path,f);}
 const content={schema:1,packId,presentationRevision:baseRevision,...(Object.hasOwn(base,'deliveryRevision')?{deliveryRevision:base.deliveryRevision}:{}),executionRevision,mediaIdentity:{packId,revision:baseRevision},mediaAssetsSha256,files};
 const revision=await sha256(new TextEncoder().encode(canonicalJSONString(content)));
 const manifest={...content,id:`bound-offline:${revision}`,revision};
 const bytes=new TextEncoder().encode(canonicalJSONString(manifest));
 need(bytes.length<=MAX,'bound-manifest-size');
 return {manifest,bytes,descriptor:jsonDescriptor(manifest.id,bytes,await sha256(bytes))};
}

// F7a2 (OFFLINE L51-L53): each bound play-bound-audio artifact maps its verified delivery to one native
// descriptor {path,group:'audio',sha256,bytes,mime}, at its exact same-origin path. Identical descriptors are
// deduplicated (several ranges may share one recording); conflicting descriptors at one path fail.
// The approved route is the only bound audio path (review N3): /v1/approved-audio/<binding>/<media>.(ogg|mp3),
// the extension matching the MIME and the media segment equal to its SHA-256. The binding never produces WAV.
const AUDIO_EXT={'audio/ogg':'ogg','audio/mpeg':'mp3'},APPROVED_PATH=/^\/v1\/approved-audio\/[a-f0-9]{64}\/([a-f0-9]{64})\.(ogg|mp3)$/;
export function nativeAudioFiles(boundArtifacts){
 const files=new Map();
 for(const a of boundArtifacts){
  need(a?.bytes instanceof Uint8Array,'bound-artifact-invalid');
  let v;try{v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(a.bytes));}catch{throw Error('bound-artifact-invalid');}
  if(v?.schema!=='fia-bound-narration-audio@1')continue;
  const d=v.delivery,url=d?.url;
  const m=typeof url==='string'&&APPROVED_PATH.exec(url);
  need(m&&hash(d.sha256)&&m[1]===d.sha256&&Number.isSafeInteger(d.bytes)&&d.bytes>0&&AUDIO_EXT[d.mime]===m[2],'bound-audio-delivery-invalid');
  const file={path:url,group:'audio',sha256:d.sha256,bytes:d.bytes,mime:d.mime},prior=files.get(url);
  need(!prior||canonicalJSONString(prior)===canonicalJSONString(file),'bound-manifest-conflict');files.set(url,file);
 }
 return [...files.values()];
}

// F7a3 (SOURCE-TO-APP L101; OFFLINE native visual descriptors): a published original's native manifest entry
// is exactly {path,group:'image',assetId,kind,sha256,bytes,mime,width,height}; its path is the server-chosen
// /v1/original-visuals/<sourceIdentity>/<consumer>/<original> whose last segment is the original's SHA-256.
const VISUAL_PATH=/^\/v1\/original-visuals\/[a-f0-9]{64}\/[a-f0-9]{64}\/([a-f0-9]{64})$/;
export function validVisualEntry(e){
 if(!object(e)||Object.keys(e).sort().join()!=='assetId,bytes,group,height,kind,mime,path,sha256,width')return false;
 const m=typeof e.path==='string'&&VISUAL_PATH.exec(e.path);
 return !!m&&m[1]===e.sha256&&e.group==='image'&&typeof e.assetId==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(e.assetId)&&['image','map'].includes(e.kind)&&hash(e.sha256)&&Number.isSafeInteger(e.bytes)&&e.bytes>0&&['image/jpeg','image/png'].includes(e.mime)&&Number.isSafeInteger(e.width)&&e.width>0&&Number.isSafeInteger(e.height)&&e.height>0;
}
export function nativeVisualFiles(visuals){
 need(Array.isArray(visuals)&&visuals.length<=1024,'bound-visual-invalid');
 const assets=new Set(),paths=new Set();
 for(const e of visuals){need(validVisualEntry(e)&&!assets.has(e.assetId)&&!paths.has(e.path),'bound-visual-invalid');assets.add(e.assetId);paths.add(e.path);}
 return structuredClone(visuals);
}

// The bound-manifest builder is versioned inside each publication row (PR295/PR296 review N1; OFFLINE L43: a
// newer build alone is not revocation). A row is re-validated and rebuilt with exactly the frozen rules of the
// version that published it: each version owns its own base-manifest validator and builder (review N-a, N-b),
// so a later edit to the shared current functions can never silently change an earlier version.
// fia-bound-manifest@1 (F7a1), frozen verbatim: base validation without the delivery-sidecar parity rule,
// and the base files plus the identity fields.
function validateBaseManifestV1(bytes,{packId,baseRevision}){
 need(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=MAX,'base-manifest-invalid');
 const m=decode(bytes);
 need(object(m)&&m.schema===1&&m.packId===packId&&m.presentationRevision===baseRevision&&typeof m.revision==='string'&&m.revision.length>0&&Array.isArray(m.files)&&m.files.length>0&&m.files.length<=4096,'base-manifest-invalid');
 need(!Object.hasOwn(m,'deliveryRevision')||hash(m.deliveryRevision),'base-manifest-invalid');
 const paths=new Set();
 for(const f of m.files){need(object(f)&&typeof f.path==='string'&&f.path.startsWith('/')&&!f.path.startsWith('//')&&!paths.has(f.path)&&hash(f.sha256)&&Number.isSafeInteger(f.bytes)&&f.bytes>0&&typeof f.group==='string','base-manifest-invalid');paths.add(f.path);}
 return m;
}
async function buildBoundManifestV1(base,{packId,executionRevision,baseRevision,mediaAssetsSha256}){
 need(base?.packId===packId&&base.presentationRevision===baseRevision&&hash(executionRevision)&&hash(mediaAssetsSha256),'bound-manifest-identity');
 const content={schema:1,packId,presentationRevision:baseRevision,...(Object.hasOwn(base,'deliveryRevision')?{deliveryRevision:base.deliveryRevision}:{}),executionRevision,mediaIdentity:{packId,revision:baseRevision},mediaAssetsSha256,files:structuredClone(base.files)};
 const revision=await sha256(new TextEncoder().encode(canonicalJSONString(content)));
 const manifest={...content,id:`bound-offline:${revision}`,revision};
 const bytes=new TextEncoder().encode(canonicalJSONString(manifest));
 need(bytes.length<=MAX,'bound-manifest-size');
 return {manifest,bytes,descriptor:jsonDescriptor(manifest.id,bytes,await sha256(bytes))};
}
// Each version: validate(bytes,{packId,baseRevision}) -> base; build(base,identity,{boundArtifacts,visuals}).
export const BOUND_MANIFEST_BUILDERS=Object.freeze({
 'fia-bound-manifest@1':Object.freeze({validate:validateBaseManifestV1,build:(base,identity)=>buildBoundManifestV1(base,identity)}),
 // fia-bound-manifest@2 (F7a2): delivery-sidecar parity (OFFLINE L15/L97) and one native audio file per bound
 // approved recording (OFFLINE L51-L53).
 'fia-bound-manifest@2':Object.freeze({validate:validateBaseManifest,build:(base,identity,{boundArtifacts=[]}={})=>buildBoundManifest(base,identity,nativeAudioFiles(boundArtifacts))}),
 // fia-bound-manifest@3 (F7a3): @2 plus the published native visual entries, in declaration order.
 'fia-bound-manifest@3':Object.freeze({validate:validateBaseManifest,build:(base,identity,{boundArtifacts=[],visuals=[]}={})=>buildBoundManifest(base,identity,[...nativeAudioFiles(boundArtifacts),...nativeVisualFiles(visuals)])}),
});
export const CURRENT_BOUND_MANIFEST_BUILDER='fia-bound-manifest@3';
const builderFor=version=>{need(Object.hasOwn(BOUND_MANIFEST_BUILDERS,version),'bound-manifest-builder-unknown');return BOUND_MANIFEST_BUILDERS[version];};
// Validate the retained base bytes and build the bound manifest, both under one version's rules.
export async function boundManifestFor(version,baseBytes,ctx,identity,inputs={}){
 const v=builderFor(version),base=v.validate(baseBytes,ctx);
 return {base,...await v.build(base,identity,inputs)};
}

// generation = SHA256(UTF8(canonicalJSONString(preimage))) over the closed preimage (OFFLINE L25-L31).
export async function publicationGeneration({packId,executionRevision,baseRevision,sourceRevision,baseManifest,mediaManifest,artifacts}){
 need(validDescriptor(baseManifest,/^base-offline:[a-f0-9]{64}$/)&&baseManifest.id===`base-offline:${baseManifest.sha256}`&&validDescriptor(mediaManifest)&&Array.isArray(artifacts)&&artifacts.length<=1024&&artifacts.every(a=>validDescriptor(a)),'generation-preimage-invalid');
 const preimage={schema:GENERATION_SCHEMA,packId,executionRevision,baseRevision,sourceRevision,baseManifest,mediaManifest,artifacts};
 return {preimage,generation:await sha256(new TextEncoder().encode(canonicalJSONString(preimage)))};
}
