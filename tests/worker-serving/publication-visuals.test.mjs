import test from 'node:test';import assert from 'node:assert/strict';
import {canonicalJSONString,sha256} from '../../server/fia/preparation/contract.mjs';
import {createExecutableOverlay} from '../../server/fia/publication/executable-overlay.mjs';
import {validVisualEntry,nativeVisualFiles} from '../../server/fia/publication/publication-generation.mjs';

// F7a3 (SOURCE-TO-APP L99/L101; OFFLINE native visual descriptors), in process: a ready native visual is a new
// generation of the same execution, whose bound manifest lists it; it stays served only while the publication
// authority still returns that exact entry; the older generation stays exactly readable.
const enc=v=>new TextEncoder().encode(canonicalJSONString(v)),h=c=>c.repeat(64),packId='eng.MRK-1-14-20';
const entry=(assetId,kind,c,mime=kind==='map'?'image/png':'image/jpeg')=>({path:`/v1/original-visuals/${h('1')}/${h('2')}/${h(c)}`,group:'image',assetId,kind,sha256:h(c),bytes:5092889,mime,width:3000,height:2000});
const a1400=entry('a1400','image','a'),c4=entry('c4','map','c');

async function harness({authority=()=>true}={}){
 const values=new Map(),blobs=new Map();
 const storage={transaction:async fn=>fn({get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v)),delete:async k=>values.delete(k)})};
 const artifacts={async write(bytes){const d=await sha256(bytes);blobs.set(d,new Uint8Array(bytes));return {reference:'r/'+d,sha256:d};},async read({sha256:d}){return blobs.get(d);}};
 const original={id:packId,activities:[{id:'S02-U008'}],assets:{a1400:{id:'a1400'},c4:{id:'c4'}}},content=JSON.stringify(original),baseRevision=await sha256(new TextEncoder().encode(content));
 const base={readCatalog:async(id,revision)=>id===packId&&(!revision||revision===baseRevision)?{status:'ready',packId,revision:baseRevision}:null,findArtifact:async d=>d===baseRevision?{content}:null};
 const manifest=new TextEncoder().encode(JSON.stringify({schema:1,packId,presentationRevision:baseRevision,revision:'x',files:[{path:'/index.html',bytes:1,sha256:h('9'),group:'core'}]})),manifestSha=await sha256(manifest);
 const calls=[],baseManifests={read:async()=>({bytes:manifest,sha256:manifestSha})};
 // Every port but the authority, so a second overlay can differ from this one in that port alone.
 const ports={storage,artifacts,base,eligible:async()=>true,validate:async()=>true,baseManifests};
 const overlay=createExecutableOverlay({...ports,visualAuthority:async args=>{calls.push(args.entry.assetId);return authority(args);}});
 const presentation={...original,execution:{schema:'fia-executable-presentation@1'}};
 const record=await overlay.publish({binding:{packId,baseRevision,sourceRevision:'f'.repeat(40),capability:'executable-presentation'},presentation,boundArtifacts:[],provenance:{jobId:h('0')}});
 return {overlay,record,blobs,calls,values,ports};
}
const manifestOf=(blobs,record)=>JSON.parse(new TextDecoder().decode(blobs.get(record.execution.mediaManifest.sha256)));

test('a native visual entry has the exact SOURCE-TO-APP shape and path; duplicates refuse',()=>{
 assert.equal(validVisualEntry(a1400),true);
 for(const bad of [{...a1400,group:'audio'},{...a1400,sha256:h('b')},{...a1400,path:'/v1/original-visuals/x'},{...a1400,mime:'image/webp'},{...a1400,width:0},{...a1400,kind:'video'},{...a1400,deliveryURL:'https://x'}])assert.equal(validVisualEntry(bad),false,JSON.stringify(bad));
 assert.throws(()=>nativeVisualFiles([a1400,{...a1400}]),/bound-visual-invalid/);
});

test('publishing a ready visual makes a new generation whose bound manifest lists it, in declaration order',async()=>{
 const {overlay,record,blobs}=await harness();
 const g1=record.execution.publication.generation;assert.deepEqual(manifestOf(blobs,record).files.map(f=>f.path),['/index.html']);
 const r2=await overlay.publishVisuals({packId,revision:record.revision,expectedPublicationGeneration:g1,visuals:[a1400]});
 const g2=r2.execution.publication.generation;assert.notEqual(g2,g1);assert.equal(r2.revision,record.revision);
 assert.deepEqual(manifestOf(blobs,r2).files,[{path:'/index.html',bytes:1,sha256:h('9'),group:'core'},a1400]);
 const r3=await overlay.publishVisuals({packId,revision:record.revision,expectedPublicationGeneration:g2,visuals:[c4,a1400]});
 assert.deepEqual(manifestOf(blobs,r3).files.slice(1),[a1400,c4],'a1400 then c4');
 const again=await overlay.publishVisuals({packId,revision:record.revision,expectedPublicationGeneration:r3.execution.publication.generation,visuals:[c4]});
 assert.equal(again.execution.publication.generation,r3.execution.publication.generation,'nothing new: the same generation');
 assert.equal((await overlay.readCatalog(packId,record.revision,g1)).execution.publication.generation,g1,'the earlier generation stays exactly readable');
 assert.equal((await overlay.readCatalog(packId)).execution.publication.generation,r3.execution.publication.generation);
 assert.deepEqual(await overlay.readCatalog(packId,record.revision),{status:'unavailable',reason:'publication-generation-ambiguous'});
 assert.equal((await overlay.findArtifact(r3.execution.mediaManifest.sha256)).content,new TextDecoder().decode(blobs.get(r3.execution.mediaManifest.sha256)));
});

test('stale expectations, conflicting entries and a withdrawn publication are refused or missed, never served',async()=>{
 const {overlay,record}=await harness();const g1=record.execution.publication.generation;
 await assert.rejects(overlay.publishVisuals({packId,revision:record.revision,expectedPublicationGeneration:h('f'),visuals:[a1400]}),/publication-generation-stale/);
 await assert.rejects(overlay.publishVisuals({packId,revision:h('e'),expectedPublicationGeneration:g1,visuals:[a1400]}),/publication-generation-stale/);
 await assert.rejects(overlay.publishVisuals({packId,revision:record.revision,expectedPublicationGeneration:g1,visuals:[{...a1400,sha256:h('b')}]}),/bound-visual-invalid/);
 const r2=await overlay.publishVisuals({packId,revision:record.revision,expectedPublicationGeneration:g1,visuals:[a1400]});
 await assert.rejects(overlay.publishVisuals({packId,revision:record.revision,expectedPublicationGeneration:r2.execution.publication.generation,visuals:[{...a1400,width:10}]}),/bound-visual-conflict/);
 await assert.rejects(overlay.publishVisuals({packId,revision:record.revision,expectedPublicationGeneration:g1,visuals:[c4]}),/publication-generation-stale/,'the pointer moved on');
 // The authority withdraws a1400: the generation that lists it is a cache miss; nothing serves it.
 let live=true;const t=await harness({authority:()=>live});const g=t.record.execution.publication.generation;
 const listed=await t.overlay.publishVisuals({packId,revision:t.record.revision,expectedPublicationGeneration:g,visuals:[a1400]});
 live=false;
 assert.deepEqual(await t.overlay.readCatalog(packId,t.record.revision,listed.execution.publication.generation),{status:'unavailable',reason:'publication-generation-invalid'});
 assert.notEqual((await t.overlay.readCatalog(packId))?.execution?.publication?.generation,listed.execution.publication.generation,'the current read falls through to the base');
});

// PR299 review B2: the same storage, artifacts, base and base manifests, with no authority port, is the
// only difference; the row that the authorised overlay serves is never served without it.
test('a row that lists a visual without a publication authority is never served',async()=>{
 const {overlay,record,ports}=await harness();
 const listed=await overlay.publishVisuals({packId,revision:record.revision,expectedPublicationGeneration:record.execution.publication.generation,visuals:[a1400]});
 const g=listed.execution.publication.generation;
 assert.equal((await overlay.readCatalog(packId,record.revision,g)).status,'ready','served with the authority');
 const plain=createExecutableOverlay(ports);
 assert.deepEqual(await plain.readCatalog(packId,record.revision,g),{status:'unavailable',reason:'publication-generation-invalid'});
 assert.equal((await plain.readCatalog(packId,record.revision,record.execution.publication.generation)).status,'ready','a row with no visuals needs no authority');
 assert.equal((await plain.retainedVisual({packId,executionRevision:record.revision,assetId:'a1400',sha256:h('a')})).status,'unavailable');
});

// PR299 review N3: a new entry the authority does not return is refused; the pointer does not move.
test('publishVisuals refuses an entry the authority does not return; nothing is adopted',async()=>{
 const t=await harness({authority:({entry})=>entry.assetId!=='c4'});const g=t.record.execution.publication.generation;
 await assert.rejects(t.overlay.publishVisuals({packId,revision:t.record.revision,expectedPublicationGeneration:g,visuals:[c4]}),/visual-publication-stale/);
 assert.equal((await t.overlay.readCatalog(packId)).execution.publication.generation,g);
 assert.equal([...t.values.keys()].filter(k=>k.startsWith('executable-generation:')).length,1,'no row is stored');
});

// PR299 review N2: an identical generation already stored is re-pointed to only after it verifies.
test('publishVisuals never re-points to a stored identical generation that fails verification',async()=>{
 const t=await harness();const g1=t.record.execution.publication.generation;
 const r2=await t.overlay.publishVisuals({packId,revision:t.record.revision,expectedPublicationGeneration:g1,visuals:[a1400]});const g2=r2.execution.publication.generation;
 // Back to g1 as current, with g2's stored row corrupted: the same publication would produce g2 again.
 const key2=`executable-generation:${packId}@${g2}`,row2=t.values.get(key2);
 t.values.set(`executable-current:${packId}`,`executable-generation:${packId}@${g1}`);
 t.values.set(key2,{...row2,mediaManifest:{...row2.mediaManifest,bytes:row2.mediaManifest.bytes+1}});
 await assert.rejects(t.overlay.publishVisuals({packId,revision:t.record.revision,expectedPublicationGeneration:g1,visuals:[a1400]}),/publication-pin-invalid/);
 assert.equal(t.values.get(`executable-current:${packId}`),`executable-generation:${packId}@${g1}`,'the pointer stays');
});

// PR299 review N3: the runtime adapter over Otto's pure published() read.
test('the runtime visual authority accepts exactly the published entry and nothing else',async()=>{
 const {visualAuthorityFrom}=await import('../../server/fia/preparation/executable-presentation-runtime.mjs');
 assert.equal(visualAuthorityFrom(undefined),null);assert.equal(visualAuthorityFrom({}),null);
 const binding={packId,baseRevision:h('b')},executionRevision=h('e');let answer,seen;
 const authority=visualAuthorityFrom({published:async q=>{seen=q;return answer;}});
 answer={manifestEntry:a1400,ready:{path:a1400.path,sha256:a1400.sha256}};
 assert.equal(await authority({binding,executionRevision,entry:a1400}),true);
 assert.deepEqual(seen,{packId,baseRevision:h('b'),executionRevision,assetId:'a1400'});
 for(const bad of [null,{},{manifestEntry:{...a1400,width:1},ready:answer.ready},{manifestEntry:a1400,ready:{...answer.ready,sha256:h('b')}},{manifestEntry:a1400,ready:{...answer.ready,path:'/x'}},{manifestEntry:a1400}]){answer=bad;assert.equal(await authority({binding,executionRevision,entry:a1400}),false,JSON.stringify(bad));}
});

// F7a / port acceptance condition: historical access is granted only to a retained, verifying generation of
// exactly that revision that lists exactly that entry; forged, never-current and revoked are unavailable.
test('retainedVisual: retained eligible generations keep access; forged or revoked authority does not',async()=>{
 let live=true;const t=await harness({authority:()=>live});const g=t.record.execution.publication.generation;
 await t.overlay.publishVisuals({packId,revision:t.record.revision,expectedPublicationGeneration:g,visuals:[a1400]});
 assert.deepEqual(await t.overlay.retainedVisual({packId,executionRevision:t.record.revision,assetId:'a1400',sha256:h('a')}),{status:'ready',entry:a1400});
 assert.equal((await t.overlay.retainedVisual({packId,executionRevision:t.record.revision,assetId:'c4',sha256:h('c')})).status,'unavailable','not listed');
 assert.equal((await t.overlay.retainedVisual({packId,executionRevision:h('e'),assetId:'a1400',sha256:h('a')})).reason,'execution-not-current','a forged or never-current revision');
 assert.equal((await t.overlay.retainedVisual({packId,executionRevision:t.record.revision,assetId:'a1400',sha256:h('b')})).status,'unavailable','another original is never rebound');
 assert.deepEqual(await t.overlay.retainedVisual({packId,executionRevision:'x',assetId:'a1400',sha256:h('a')}),{status:'refused',code:'invalid-request'});
 live=false;assert.equal((await t.overlay.retainedVisual({packId,executionRevision:t.record.revision,assetId:'a1400',sha256:h('a')})).status,'unavailable','withdrawn authority');
});

// PR312 review thread 4412859935 (Terry 0be2e40 case b is non-transient only; OFFLINE L45): published() answers null for a
// withdrawn publication and for an operational outcome alike. With the typed object read, an unavailable, unreachable or skewed
// authority makes the exact generation read transient (it throws, so the client keeps its Saved copy); a real withdrawal still
// types publication-generation-invalid.
test('an unavailable visual authority makes the exact read transient; only a real withdrawal is publication-generation-invalid',async()=>{
 const {visualAuthorityFrom}=await import('../../server/fia/preparation/executable-presentation-runtime.mjs');
 let mode='ready';
 const ready={status:'ready',ready:{path:a1400.path,sha256:a1400.sha256},manifestEntry:a1400};
 const answers={ready,unavailable:{status:'unavailable',reason:'preparation-storage-unavailable',final:false},unreachable:{status:'unavailable',reason:'interrupted',subReason:'visual-object-unreachable',final:false},skew:{status:'unavailable',reason:'interrupted',subReason:'visual-object-version-skew',final:false},withdrawn:{status:'unavailable',reason:'visual-not-published'},stale:{status:'unavailable',reason:'visual-publication-stale'}};
 const port={published:async()=>mode==='ready'?{ready:ready.ready,manifestEntry:a1400}:null};
 const authority=visualAuthorityFrom(port,{readPublication:async()=>structuredClone(answers[mode])});
 const t=await harness({authority:args=>authority(args)});
 const listed=await t.overlay.publishVisuals({packId,revision:t.record.revision,expectedPublicationGeneration:t.record.execution.publication.generation,visuals:[a1400]}),g=listed.execution.publication.generation;
 assert.equal((await t.overlay.readCatalog(packId,t.record.revision,g)).status,'ready');
 for(mode of ['unavailable','unreachable','skew'])await assert.rejects(t.overlay.readCatalog(packId,t.record.revision,g),/temporarily unavailable/,`${mode}: transient, never invalid`);
 for(mode of ['withdrawn','stale'])assert.deepEqual(await t.overlay.readCatalog(packId,t.record.revision,g),{status:'unavailable',reason:'publication-generation-invalid'},mode);
 mode='ready';assert.equal((await t.overlay.readCatalog(packId,t.record.revision,g)).status,'ready','the row is served again once the authority answers');
});
