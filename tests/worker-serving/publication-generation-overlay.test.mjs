import test from 'node:test';import assert from 'node:assert/strict';
import {sha256} from '../../server/fia/preparation/contract.mjs';
import {createExecutableOverlay} from '../../server/fia/publication/executable-overlay.mjs';
import {createReadOperations} from '../../server/fia/publication/read-operations.mjs';

// F7a1 OFFLINE L96 cases that need a controlled overlay (PR295 review B2), in process: a concurrent
// pointer change between capture and commit, revocation of a shared source, and reuse of an identical
// generation only after it verifies (review N2). The Worker-level cases are in executable-transition.
const h=c=>c.repeat(64),packId='eng.MRK-1-14-20';
async function harness(){
 const values=new Map(),blobs=new Map();let hook=null,live=true;
 const storage={transaction:async fn=>fn({get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v)),delete:async k=>values.delete(k)})};
 const artifacts={async write(bytes){const d=await sha256(bytes);blobs.set(d,new Uint8Array(bytes));return {reference:'r/'+d,sha256:d};},async read({sha256:d}){return blobs.get(d);}};
 const original={id:packId,activities:[{id:'S02-U008'}],assets:{c4:{id:'c4'}}},content=JSON.stringify(original),baseRevision=await sha256(new TextEncoder().encode(content));
 const base={readCatalog:async(id,revision)=>id===packId&&(!revision||revision===baseRevision)?{status:'ready',packId,revision:baseRevision}:null,findArtifact:async d=>d===baseRevision?{content}:null};
 let shell='a';
 const manifest=()=>new TextEncoder().encode(JSON.stringify({schema:1,packId,presentationRevision:baseRevision,revision:shell,files:[{path:'/index.html',bytes:1,sha256:h(shell==='a'?'1':'2'),group:'core'}]}));
 const baseManifests={read:async()=>{await hook?.();const bytes=manifest();return {bytes,sha256:await sha256(bytes)};}};
 const overlay=createExecutableOverlay({storage,artifacts,base,eligible:async()=>live,validate:async()=>true,baseManifests});
 const binding={packId,baseRevision,sourceRevision:'f'.repeat(40),capability:'executable-presentation'};
 const publish=extra=>overlay.publish({binding,presentation:{...original,execution:{schema:'fia-executable-presentation@1'}},boundArtifacts:[],provenance:{jobId:h('0')},...extra});
 return {overlay,values,blobs,publish,setShell:s=>shell=s,setHook:f=>hook=f,revoke:()=>live=false};
}

test('a pointer change between capture and commit refuses adoption typed; the newer publication stays current',async()=>{
 const t=await harness();const a=await t.publish({});const gA=a.execution.publication.generation;
 t.setShell('b');
 // While B is being built, another publication (B') is adopted; B's commit must refuse.
 t.setHook(async()=>{t.setHook(null);t.values.set(`executable-current:${packId}`,'executable-record:'+packId+'@'+h('9'));});
 await assert.rejects(t.publish({expectedPublicationGeneration:gA}),/publication-generation-stale/);
 assert.equal(t.values.get(`executable-current:${packId}`),'executable-record:'+packId+'@'+h('9'),'no failed candidate moves or clears the pointer');
 assert.equal((await t.overlay.readCatalog(packId,a.revision,gA)).execution.publication.generation,gA,'A stays exactly readable');
});

test('revocation of the shared source denies every generation that depends on it',async()=>{
 const t=await harness();const a=await t.publish({});t.setShell('b');const b=await t.publish({expectedPublicationGeneration:a.execution.publication.generation});
 t.revoke();
 for(const g of [a,b].map(r=>r.execution.publication.generation))assert.deepEqual(await t.overlay.readCatalog(packId,a.revision,g),{status:'unavailable',reason:'publication-generation-invalid'});
 assert.equal((await t.overlay.readCatalog(packId))?.execution,undefined,'the current read falls through to the base catalog');
});

test('an identical generation is reused only after the stored row verifies; a corrupt stored row is refused',async()=>{
 const t=await harness();const a=await t.publish({});const g=a.execution.publication.generation;
 const again=await t.publish({expectedPublicationGeneration:g});assert.equal(again.execution.publication.generation,g);
 const key=`executable-generation:${packId}@${g}`,row=t.values.get(key);t.values.set(key,{...row,mediaManifest:{...row.mediaManifest,bytes:row.mediaManifest.bytes+1}});
 await assert.rejects(t.publish({expectedPublicationGeneration:g}),/publication-pin-invalid/);
});

// PR295/PR296 review N1 (OFFLINE L43: a newer build alone is not revocation): each row records the
// bound-manifest builder that published it, and verification rebuilds with exactly that version. An
// unknown or missing version is never guessed. (F7a2 adds the previous-builder regression once @2 exists.)
test('a publication row records its bound-manifest builder; verification uses it and never guesses one',async()=>{
 const {BOUND_MANIFEST_BUILDERS,CURRENT_BOUND_MANIFEST_BUILDER}=await import('../../server/fia/publication/publication-generation.mjs');
 assert.ok(Object.isFrozen(BOUND_MANIFEST_BUILDERS)&&Object.hasOwn(BOUND_MANIFEST_BUILDERS,'fia-bound-manifest@1'));
 const t=await harness();const a=await t.publish({});const g=a.execution.publication.generation,key=`executable-generation:${packId}@${g}`;
 assert.equal(t.values.get(key).manifestBuilder,CURRENT_BOUND_MANIFEST_BUILDER);
 for(const manifestBuilder of ['fia-bound-manifest@0',undefined]){const row=t.values.get(key);t.values.set(key,{...row,manifestBuilder});assert.equal((await t.overlay.readCatalog(packId,a.revision,g)).status,'unavailable',String(manifestBuilder));t.values.set(key,row);}
 assert.equal((await t.overlay.readCatalog(packId,a.revision,g)).status,'ready');
});

// PR296 re-review N-d, PR299 review B1 (OFFLINE L43): a row stored by fia-bound-manifest@1, with @1 mediaManifest
// bytes, is read exactly under the current overlay. One bound approved recording makes the builders differ
// (@1 ignores bound audio; the current builder lists it), so only verification with the row's own recorded
// builder accepts the stored bytes; the same row relabelled with the current builder is refused.
test('a stored fia-bound-manifest@1 row with @1 bytes reads exactly under the current overlay',async()=>{
 const {CURRENT_BOUND_MANIFEST_BUILDER,boundManifestFor,publicationGeneration}=await import('../../server/fia/publication/publication-generation.mjs');
 assert.notEqual(CURRENT_BOUND_MANIFEST_BUILDER,'fia-bound-manifest@1');
 const url=`/v1/approved-audio/${h('1')}/${h('a')}.ogg`,audioBytes=new TextEncoder().encode(JSON.stringify({schema:'fia-bound-narration-audio@1',id:'approved-audio:1',delivery:{url,sha256:h('a'),bytes:9,mime:'audio/ogg'},playbackRange:null}));
 const audio={id:'approved-audio:1',sha256:await sha256(audioBytes),bytes:audioBytes};
 const t=await harness();const a=await t.publish({boundArtifacts:[audio]});const current=t.values.get(`executable-generation:${packId}@${a.execution.publication.generation}`);
 assert.equal(current.bound.length,1);
 const baseBytes=t.blobs.get(current.baseManifestArtifact.sha256),ctx={packId,baseRevision:current.binding.baseRevision},identity={packId,executionRevision:current.revision,baseRevision:current.binding.baseRevision,mediaAssetsSha256:current.mediaAssetsSha256},inputs={boundArtifacts:[{id:audio.id,sha256:audio.sha256,bytes:audioBytes}],visuals:[]};
 const v1=await boundManifestFor('fia-bound-manifest@1',baseBytes,ctx,identity,inputs),cur=await boundManifestFor(CURRENT_BOUND_MANIFEST_BUILDER,baseBytes,ctx,identity,inputs);
 assert.notEqual(v1.descriptor.sha256,cur.descriptor.sha256,'the builders differ for this row');assert.ok(!v1.manifest.files.some(f=>f.group==='audio'));
 const d=await sha256(v1.bytes);t.blobs.set(d,new Uint8Array(v1.bytes));
 const describe=x=>({id:x.id,sha256:x.sha256,bytes:x.bytes,mime:x.mime});
 const {generation}=await publicationGeneration({packId,executionRevision:current.revision,baseRevision:current.binding.baseRevision,sourceRevision:current.binding.sourceRevision,baseManifest:current.publication.baseManifest,mediaManifest:v1.descriptor,artifacts:current.bound.map(describe)});
 assert.notEqual(generation,current.publication.generation);
 const old={...structuredClone(current),manifestBuilder:'fia-bound-manifest@1',mediaManifest:v1.descriptor,mediaManifestArtifact:{reference:'r/'+d,sha256:d,bytes:v1.bytes.length,mime:'application/json'},publication:{...current.publication,generation}};
 const key=`executable-generation:${packId}@${generation}`;t.values.set(key,old);t.values.set('executable-artifact:'+d,[key]);
 const read=await t.overlay.readCatalog(packId,a.revision,generation);
 assert.equal(read.status,'ready');assert.equal(read.execution.publication.generation,generation);assert.deepEqual(read.execution.mediaManifest,v1.descriptor);
 assert.equal((await t.overlay.findArtifact(d)).content,new TextDecoder().decode(v1.bytes),'the @1 bound manifest is served as stored');
 t.values.set(key,{...old,manifestBuilder:CURRENT_BOUND_MANIFEST_BUILDER});
 assert.equal((await t.overlay.readCatalog(packId,a.revision,generation)).status,'unavailable','relabelled with the current builder, the @1 bytes are refused');
 assert.equal((await t.overlay.readCatalog(packId,a.revision,a.execution.publication.generation)).status,'ready','the current row is unaffected');
});

// Terry 0be2e40: the three facts once merged as publication-generation-unavailable are typed apart, so the client can apply the
// law to each. (a) An absent generation row is a selection refusal (OFFLINE L37, L45, L61). (b) A retained row that fails its own
// binding or verification is a denial (L60, L43, L57). (c) The exact read passes the catalog's own refusal through unchanged (L43).
test('an absent generation, an invalid retained row and a catalog refusal reach the reader with distinct typed reasons',async()=>{
 const t=await harness();const a=await t.publish({});const g=a.execution.publication.generation;
 assert.deepEqual(await t.overlay.readCatalog(packId,a.revision,h('0')),{status:'unavailable',reason:'publication-generation-unavailable'},'(a) absent row');
 const key=`executable-generation:${packId}@${g}`,row=t.values.get(key);t.values.set(key,{...row,binding:{...row.binding,packId:'eng.MRK-1-21-28'}});
 assert.deepEqual(await t.overlay.readCatalog(packId,a.revision,g),{status:'unavailable',reason:'publication-generation-invalid'},'(b) row fails its binding');
 const reads=reason=>createReadOperations({readCatalog:async()=>({status:'unavailable',reason}),findArtifact:async()=>null});
 for(const reason of ['execution-not-current','revision-not-found','not-found'])
  assert.deepEqual(await reads(reason).readPack({packId,revision:h('a'),generation:h('b')}),{status:'unavailable',reason},`(c) ${reason} passes through`);
 const other=createReadOperations({readCatalog:async()=>({status:'ready',packId,revision:h('a'),execution:{publication:{generation:h('c')}}}),findArtifact:async()=>null});
 assert.deepEqual(await other.readPack({packId,revision:h('a'),generation:h('b')}),{status:'unavailable',reason:'publication-generation-mismatch'},'(c) a ready record of another generation is typed apart');
});
