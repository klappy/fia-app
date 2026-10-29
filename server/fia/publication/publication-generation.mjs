// F7a1 (cross-pericope PLAN §7; OFFLINE-EXECUTION "Publication generations retain their own verified base
// manifest"). Pure, deterministic pieces of a generation-aware executable publication:
// - the retained base manifest: the exact build-pinned UTF-8 bytes of the passage's offline manifest;
// - the bound mediaManifest: in this slice the base manifest's files plus its identity fields (F7a2 adds the
//   bound narration entries, F7a3 the native visual entries);
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
 const paths=new Set();
 for(const f of m.files){need(object(f)&&typeof f.path==='string'&&f.path.startsWith('/')&&!f.path.startsWith('//')&&!paths.has(f.path)&&hash(f.sha256)&&Number.isSafeInteger(f.bytes)&&f.bytes>0&&typeof f.group==='string','base-manifest-invalid');paths.add(f.path);}
 return m;
}

// The bound manifest (OFFLINE L13-L17): the existing offline shape, with deliveryRevision mirrored exactly
// (present only when the verified base has it), plus id, executionRevision, mediaIdentity and mediaAssetsSha256.
// Its revision is the SHA-256 of its canonical content without `id` and `revision`; its id names that revision.
export async function buildBoundManifest(base,{packId,executionRevision,baseRevision,mediaAssetsSha256}){
 need(base?.packId===packId&&base.presentationRevision===baseRevision&&hash(executionRevision)&&hash(mediaAssetsSha256),'bound-manifest-identity');
 const content={schema:1,packId,presentationRevision:baseRevision,...(Object.hasOwn(base,'deliveryRevision')?{deliveryRevision:base.deliveryRevision}:{}),executionRevision,mediaIdentity:{packId,revision:baseRevision},mediaAssetsSha256,files:structuredClone(base.files)};
 const revision=await sha256(new TextEncoder().encode(canonicalJSONString(content)));
 const manifest={...content,id:`bound-offline:${revision}`,revision};
 const bytes=new TextEncoder().encode(canonicalJSONString(manifest));
 need(bytes.length<=MAX,'bound-manifest-size');
 return {manifest,bytes,descriptor:jsonDescriptor(manifest.id,bytes,await sha256(bytes))};
}

// The bound-manifest builder is versioned inside each publication row (PR295 review N1; OFFLINE L43: a
// newer build alone is not revocation). A row is rebuilt for verification with exactly the rules of the
// builder version that published it; every earlier version stays here as a pure function.
export const BOUND_MANIFEST_BUILDERS=Object.freeze({
 // fia-bound-manifest@1 (F7a1): the base files and the identity fields, no native files.
 'fia-bound-manifest@1':(base,identity)=>buildBoundManifest(base,identity),
});
export const CURRENT_BOUND_MANIFEST_BUILDER='fia-bound-manifest@1';
export function boundManifestFor(version,base,identity,inputs={}){
 const build=Object.hasOwn(BOUND_MANIFEST_BUILDERS,version)?BOUND_MANIFEST_BUILDERS[version]:null;
 need(build,'bound-manifest-builder-unknown');
 return build(base,identity,inputs);
}

// generation = SHA256(UTF8(canonicalJSONString(preimage))) over the closed preimage (OFFLINE L25-L31).
export async function publicationGeneration({packId,executionRevision,baseRevision,sourceRevision,baseManifest,mediaManifest,artifacts}){
 need(validDescriptor(baseManifest,/^base-offline:[a-f0-9]{64}$/)&&baseManifest.id===`base-offline:${baseManifest.sha256}`&&validDescriptor(mediaManifest)&&Array.isArray(artifacts)&&artifacts.length<=1024&&artifacts.every(a=>validDescriptor(a)),'generation-preimage-invalid');
 const preimage={schema:GENERATION_SCHEMA,packId,executionRevision,baseRevision,sourceRevision,baseManifest,mediaManifest,artifacts};
 return {preimage,generation:await sha256(new TextEncoder().encode(canonicalJSONString(preimage)))};
}
