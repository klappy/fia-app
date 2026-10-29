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
 const calls=[];
 const overlay=createExecutableOverlay({storage,artifacts,base,eligible:async()=>true,validate:async()=>true,baseManifests:{read:async()=>({bytes:manifest,sha256:manifestSha})},visualAuthority:async args=>{calls.push(args.entry.assetId);return authority(args);}});
 const presentation={...original,execution:{schema:'fia-executable-presentation@1'}};
 const record=await overlay.publish({binding:{packId,baseRevision,sourceRevision:'f'.repeat(40),capability:'executable-presentation'},presentation,boundArtifacts:[],provenance:{jobId:h('0')}});
 return {overlay,record,blobs,calls,values};
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
 assert.deepEqual(await t.overlay.readCatalog(packId,t.record.revision,listed.execution.publication.generation),{status:'unavailable',reason:'publication-generation-unavailable'});
 assert.notEqual((await t.overlay.readCatalog(packId))?.execution?.publication?.generation,listed.execution.publication.generation,'the current read falls through to the base');
});

test('a row that lists a visual without a publication authority is never served',async()=>{
 const {record,values}=await harness();
 const keys=[...values.keys()].filter(k=>k.startsWith('executable-generation:'));assert.equal(keys.length,1);
 const row=values.get(keys[0]);row.visuals=[a1400];values.set(keys[0],row);
 const plain=createExecutableOverlay({storage:{transaction:async fn=>fn({get:async k=>structuredClone(values.get(k)),put:async()=>{}})},artifacts:{write:async()=>{throw Error('no');},read:async()=>{throw Error('no');}},base:{readCatalog:async()=>null,findArtifact:async()=>null},eligible:async()=>true,validate:async()=>true});
 assert.equal((await plain.readCatalog(packId,record.revision,record.execution.publication.generation)).status,'unavailable');
});
