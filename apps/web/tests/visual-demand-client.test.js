import test from 'node:test';import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {selectServerPresentation,prepareVisual} from '../src/lib/library.js';
import {createExecutionTransport} from '../src/lib/execution-transport.js';
// F9 (SOURCE-TO-APP L87-L99, Q22): the page acts on the server's visual declarations only. A ready entry is
// read with no POST; a preparable one is sent once exactly as declared; the frontend never resolves a reference.
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const h=c=>c.repeat(64),id='eng.MRK-1-14-20',rev=h('e');
const demand=(assetId,kind,generation=h('6'))=>({packId:id,baseRevision:h('b'),sourceRevision:'c'.repeat(40),capability:'executable-presentation',visualDemand:{assetId,kind},expectedExecutionRevision:rev,expectedPublicationGeneration:generation});
const path=sha=>`/v1/original-visuals/${h('1')}/${h('2')}/${sha}`;
const ready=(assetId,kind,sha)=>({assetId,kind,status:'ready',ready:{path:path(sha),sha256:sha}});
const pin=g=>({publication:{schema:'fia-executable-publication-pin@1',generation:g,baseManifest:{id:`base-offline:${h('7')}`,sha256:h('7'),bytes:10,mime:'application/json'}},mediaManifest:{id:'bound-offline:x',sha256:h('8'),bytes:20,mime:'application/json'}});
const record=(visualResources,g=h('6'))=>({status:'ready',packId:id,revision:rev,artifact:{sha256:rev,bytes:9,mime:'application/json'},identity:{packId:id,title:'Mark 1:14–20',language:'eng',pericopeId:'MRK-1-14-20',defaultScriptureId:'s'},capabilities:{text:{available:true}},execution:{schema:'fia-executable-catalog@1',visualResources,...pin(g)}});
const pack=(visualResources)=>({id,revision:rev,visualResources});

test('the selected descriptor carries the declarations, generation pin and bound manifest unchanged',async()=>{
 const vr=[{assetId:'a1400',kind:'image',status:'preparable',preparationDemand:demand('a1400','image')},{assetId:'c4',kind:'map',status:'unavailable',reason:'decoder-unavailable'}];
 const presentation={id,assets:{s:{id:'s',kind:'scripture'}},activities:[{id:'one',sectionId:'x',completion:'confirm'}],sections:[{id:'x'}],listContracts:[]};
 const r=await selectServerPresentation(id,{transport:{readPack:async()=>record(vr),readPresentationRecord:async()=>presentation}});
 assert.deepEqual(r.descriptor.visualResources,vr);assert.equal(r.descriptor.publication.generation,h('6'));assert.equal(r.descriptor.mediaManifest.sha256,h('8'));
});

test('a ready entry is read with no POST; an unavailable or undeclared asset sends nothing',async()=>{
 const calls=[];const transport={preparePresentation:async()=>{calls.push('post');}};
 assert.deepEqual(await prepareVisual(pack([ready('a1400','image',h('a'))]),'a1400',{transport}),{status:'ready',path:path(h('a')),sha256:h('a'),served:null});
 assert.deepEqual(await prepareVisual(pack([{assetId:'c4',kind:'map',status:'unavailable',reason:'decoder-unavailable'}]),'c4',{transport}),{status:'unavailable'});
 assert.deepEqual(await prepareVisual(pack([]),'a1400',{transport}),{status:'unavailable'});
 assert.deepEqual(calls,[]);
});

test('a preparable entry sends its declared demand once; the ready record of the same execution refreshes the declarations',async()=>{
 const sent=[],d=demand('a1400','image');const refreshed=record([ready('a1400','image',h('a')),{assetId:'c4',kind:'map',status:'preparable',preparationDemand:demand('c4','map',h('9'))}],h('9'));
 const transport={preparePresentation:async(x)=>{sent.push(x);return {status:'ready',record:refreshed};}};
 const out=await prepareVisual(pack([{assetId:'a1400',kind:'image',status:'preparable',preparationDemand:d}]),'a1400',{transport});
 assert.equal(sent.length,1);assert.equal(sent[0],d,'exactly the declared demand object');
 assert.equal(out.status,'ready');assert.equal(out.path,path(h('a')));assert.equal(out.served.publication.generation,h('9'));assert.equal(out.served.visualResources[1].preparationDemand.expectedPublicationGeneration,h('9'));
 // Another execution's record never speaks for this one.
 await assert.rejects(prepareVisual(pack([{assetId:'a1400',kind:'image',status:'preparable',preparationDemand:d}]),'a1400',{transport:{preparePresentation:async()=>({status:'ready',record:{...refreshed,revision:h('f'),artifact:{...refreshed.artifact,sha256:h('f')}}})}}),/visual-not-ready/);
});

test('unavailable is final; a stale answer re-reads the pack once and never sends a second POST',async()=>{
 const d=demand('a1400','image');let posts=0,reads=0;
 assert.deepEqual(await prepareVisual(pack([{assetId:'a1400',kind:'image',status:'preparable',preparationDemand:d}]),'a1400',{transport:{preparePresentation:async()=>{posts++;return {status:'unavailable',reason:'decoder-unavailable'};}}}),{status:'unavailable'});
 const fresh=record([{assetId:'a1400',kind:'image',status:'preparable',preparationDemand:demand('a1400','image',h('9'))}],h('9'));
 const transport={preparePresentation:async()=>{posts++;return {status:'blocked',reason:'publication-generation-stale'};},readPack:async()=>{reads++;return fresh;}};
 const error=await prepareVisual(pack([{assetId:'a1400',kind:'image',status:'preparable',preparationDemand:d}]),'a1400',{transport}).catch(e=>e);
 assert.equal(error.message,'visual-stale');assert.equal(error.served.visualResources[0].preparationDemand.expectedPublicationGeneration,h('9'),'the next deliberate action sends the current demand');
 assert.equal(posts,2);assert.equal(reads,1);
 // Already ready on the re-read: it is used, still with no second POST.
 const r2=await prepareVisual(pack([{assetId:'a1400',kind:'image',status:'preparable',preparationDemand:d}]),'a1400',{transport:{preparePresentation:async()=>{posts++;return {status:'blocked',reason:'execution-revision-stale'};},readPack:async()=>record([ready('a1400','image',h('a'))])}});
 assert.equal(r2.status,'ready');assert.equal(posts,3);
});

test('the transport sends a declared visual demand unchanged, and verifies an original by path, sha and image type',async()=>{
 const bytes=new TextEncoder().encode('jpeg bytes'),sha=Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 const seen=[];let reply;
 const t=createExecutionTransport({fetch:async(url,init)=>{seen.push({url,init});return reply(url);}});
 const d=demand('a1400','image');
 reply=()=>new Response(JSON.stringify({schema:'fia-presentation-preparation@1',status:'unavailable',jobId:null,reason:'decoder-unavailable',record:null}),{status:404});
 assert.equal((await t.preparePresentation(d)).status,'unavailable');assert.equal(seen[0].url,'/v1/presentation-preparations');assert.deepEqual(JSON.parse(seen[0].init.body),d);
 await assert.rejects(t.preparePresentation({...d,visualDemand:{assetId:'a1400',kind:'video'}}),/demand is invalid/);
 await assert.rejects(t.preparePresentation({...d,extra:1}),/demand is invalid/);
 reply=()=>new Response(bytes,{status:200,headers:{'Content-Type':'image/jpeg'}});
 const out=await t.readOriginalVisual({path:path(sha),sha256:sha});assert.equal(out.mime,'image/jpeg');assert.equal(out.bytes.byteLength,bytes.length);
 await assert.rejects(t.readOriginalVisual({path:path(sha),sha256:h('0')}),/reference is invalid/,'the path names its sha');
 await assert.rejects(t.readOriginalVisual({path:'/v1/original-visuals/x',sha256:sha}),/reference is invalid/);
 reply=()=>new Response(new TextEncoder().encode('other'),{status:200,headers:{'Content-Type':'image/jpeg'}});
 await assert.rejects(t.readOriginalVisual({path:path(sha),sha256:sha}),/could not be verified/);
 reply=()=>new Response(bytes,{status:200,headers:{'Content-Type':'text/html'}});
 await assert.rejects(t.readOriginalVisual({path:path(sha),sha256:sha}),/could not be read/);
 reply=()=>new Response('gone',{status:410});
 await assert.rejects(t.readOriginalVisual({path:path(sha),sha256:sha}),/could not be read/);
});
