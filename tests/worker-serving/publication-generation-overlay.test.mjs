import test from 'node:test';import assert from 'node:assert/strict';
import {sha256} from '../../server/fia/preparation/contract.mjs';
import {createExecutableOverlay} from '../../server/fia/publication/executable-overlay.mjs';

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
 for(const g of [a,b].map(r=>r.execution.publication.generation))assert.deepEqual(await t.overlay.readCatalog(packId,a.revision,g),{status:'unavailable',reason:'publication-generation-unavailable'});
 assert.equal((await t.overlay.readCatalog(packId))?.execution,undefined,'the current read falls through to the base catalog');
});

test('an identical generation is reused only after the stored row verifies; a corrupt stored row is refused',async()=>{
 const t=await harness();const a=await t.publish({});const g=a.execution.publication.generation;
 const again=await t.publish({expectedPublicationGeneration:g});assert.equal(again.execution.publication.generation,g);
 const key=`executable-generation:${packId}@${g}`,row=t.values.get(key);t.values.set(key,{...row,mediaManifest:{...row.mediaManifest,bytes:row.mediaManifest.bytes+1}});
 await assert.rejects(t.publish({expectedPublicationGeneration:g}),/publication-pin-invalid/);
});
