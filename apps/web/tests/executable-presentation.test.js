import test from 'node:test';import assert from 'node:assert/strict';
import {validateExecutablePresentation,executionFor,createExecutableNarration} from '../src/lib/executable-presentation.js';
const h='a'.repeat(64),ref={id:'opaque-bound-reference',sha256:h};
const fixture=(narration={action:'none'})=>({execution:{schema:'fia-executable-presentation@1',sourceRevision:'source-1',decisionEvidenceSha256:h,recipeRevision:'recipe-1'},activities:[{id:'step-1',kind:'discussion',sourceText:'Retained provenance is not an action',audioSrc:'/must-not-play.mp3',execution:{narration,focalAssetId:'image-1',completion:{action:'manual-continue'}}}]});
test('legacy is only absent discriminator; malformed new plan never falls back',()=>{
 assert.equal(validateExecutablePresentation({activities:[]}),null);
 for(const execution of [null,{},false,{...fixture().execution,schema:'unknown'},{...fixture().execution,extra:true}])assert.throws(()=>validateExecutablePresentation({...fixture(),execution}));
 for(const mutate of [p=>delete p.activities[0].execution,p=>p.activities[0].execution.extra=true,p=>p.activities[0].execution.narration={action:'prepare-original',demand:{...ref,url:'https://bad'}},p=>p.activities[0].execution.completion.action='auto',p=>p.activities[0].execution.narration={action:'blocked',status:'ready',reason:'x'}]){const p=fixture();mutate(p);assert.throws(()=>validateExecutablePresentation(p));}
});
test('none and blocked actions never invoke preparation or playback even with legacy audio/provenance',async()=>{
 const calls=[],owner=createExecutableNarration({playBoundAudio:()=>calls.push('play'),prepareOriginal:()=>calls.push('prepare')});
 assert.deepEqual(await owner.run(fixture(),'step-1',{explicit:true}),{status:'none'});
 assert.deepEqual(await owner.run(fixture({action:'blocked',status:'unsupported',reason:'retained-reason'}),'step-1',{explicit:true}),{status:'blocked',reason:'retained-reason',availability:'unsupported'});assert.deepEqual(calls,[]);
});
test('dispatch exactly the declared immutable reference without reconstructing identity',async()=>{
 for(const [action,key,port] of [['play-bound-audio','artifact','playBoundAudio'],['prepare-original','demand','prepareOriginal']]){
  const calls=[],result={opaque:'port-result'},p=fixture({action,[key]:ref});const owner=createExecutableNarration({[port]:async(reference,context)=>{calls.push({reference,context});return result;}});
  assert.equal(await owner.run(p,'step-1',{explicit:true}),result);assert.equal(calls.length,1);assert.deepEqual(calls[0].reference,ref);assert.equal(calls[0].context.activityId,'step-1');assert.deepEqual(calls[0].context.presentationExecution,p.execution);assert.equal(Object.isFrozen(calls[0].reference),true);
 }
});
test('no explicit consent, canceled operation and missing ports never cause fallback',async()=>{
 let calls=0,release;const owner=createExecutableNarration({prepareOriginal:()=>{calls++;return new Promise(r=>release=r);}}),p=fixture({action:'prepare-original',demand:ref});
 await assert.rejects(owner.run(p,'step-1'),/explicit/i);assert.equal(calls,0);
 const pending=owner.run(p,'step-1',{explicit:true});owner.cancel();release({bytes:'stale'});assert.equal(await pending,null);
 await assert.rejects(createExecutableNarration({}).run(p,'step-1',{explicit:true}),/unavailable/i);
});
test('focal and completion are explicit and independent of source strings and legacy fields',()=>{
 const p=fixture();p.activities[0].assetId='legacy-wrong';p.activities[0].completion='auto';
 assert.deepEqual(executionFor(p,'step-1'),p.activities[0].execution);assert.throws(()=>executionFor(p,'missing'));
});
test('invalid replacement revokes an older outstanding owner before validation refuses',async()=>{
 let resolve,signal;const owner=createExecutableNarration({prepareOriginal:(ref,context)=>{signal=context.signal;return new Promise(r=>resolve=r);}}),p=fixture({action:'prepare-original',demand:ref});const pending=owner.run(p,'step-1',{explicit:true});
 await assert.rejects(owner.run({...p,execution:null},'step-1',{explicit:true}));assert.equal(signal.aborted,true);resolve({bytes:'obsolete'});assert.equal(await pending,null);
});

// F4 client half (cross-pericope PLAN VA1): the closed execution object accepts the
// server-declared visualResources, mediaManifest and publication, absent or present,
// in their contract shapes only. Any other key, or a malformed value, still refuses.
test('execution accepts visualResources, mediaManifest and publication absent or present, closed shapes only',()=>{
 const d=c=>c.repeat(64),demand={packId:'eng.MRK-1-14-20',baseRevision:d('b'),sourceRevision:'f8776d92b090b5af5b17b17dc1137f25fb059ed0',capability:'executable-presentation',visualDemand:{assetId:'a1400',kind:'image'},expectedExecutionRevision:d('c')};
 const extensions={visualResources:[{assetId:'a1400',kind:'image',status:'preparable',preparationDemand:demand},{assetId:'c4',kind:'map',status:'ready',ready:{path:`/v1/original-visuals/${d('1')}/${d('2')}/${d('3')}`,sha256:d('3')}},{assetId:'a293',kind:'image',status:'unavailable',reason:'visual-ineligible'}],mediaManifest:{id:'bound-offline:x',sha256:d('4'),bytes:2048,mime:'application/json'},publication:{schema:'fia-executable-publication-pin@1',generation:d('5'),baseManifest:{id:`base-offline:${d('6')}`,sha256:d('6'),bytes:1024,mime:'application/json'}}};
 for(const keys of [[],['visualResources'],['mediaManifest'],['publication'],['visualResources','mediaManifest','publication']]){const p=fixture();for(const k of keys)p.execution[k]=structuredClone(extensions[k]);assert.equal(validateExecutablePresentation(p),p.execution,keys.join()||'none');}
 {const p=fixture();p.execution.visualResources=[{...extensions.visualResources[0],preparationDemand:{...demand,expectedPublicationGeneration:null}}];assert.ok(validateExecutablePresentation(p),'the OFFLINE generation fence may ride the demand');}
 const bad=[
  e=>e.visualResources=[{...e.visualResources[0]},{...e.visualResources[0]}],
  e=>e.visualResources[0].kind='video',
  e=>e.visualResources[0].status='pending',
  e=>e.visualResources[0].preparationDemand.visualDemand.assetId='c4',
  e=>e.visualResources[0].preparationDemand.decisionDemand={},
  e=>delete e.visualResources[0].preparationDemand.expectedExecutionRevision,
  e=>e.visualResources[0].preparationDemand.url='https://example.invalid/a.jpg',
  e=>e.visualResources[1].ready.path='https://example.invalid/c4.png',
  e=>e.visualResources[1].ready.extra=true,
  e=>e.visualResources[2].reason='pending',
  e=>e.visualResources={},
  e=>e.mediaManifest.mime='text/plain',
  e=>e.mediaManifest.bytes=0,
  e=>e.mediaManifest.deliveryURL='/x',
  e=>e.publication.schema='fia-executable-publication-pin@2',
  e=>e.publication.baseManifest.id='bound-offline:x',
  e=>e.publication.generation='nothex',
 ];
 for(const [n,mutate] of bad.entries()){const p=fixture(),e=structuredClone(extensions);mutate(e);Object.assign(p.execution,e);assert.throws(()=>validateExecutablePresentation(p),String(n));}
 {const p=fixture();p.execution.visualResource=[];assert.throws(()=>validateExecutablePresentation(p),'an unknown key still refuses');}
});

// Carry-forward of #288 fe806b6 (PR287 native review P1, executable-presentation.js:26): visual-unsupported is the
// canonical typed unavailable reason (cookbook PR265). An entry carrying it is accepted, and the presentation stays
// valid; an unknown or malformed reason still refuses.
test('visualResources accepts the visual-unsupported reason and still refuses unknown reasons',async()=>{
 const {validateVisualResources}=await import('../src/lib/executable-presentation.js');
 assert.ok(validateVisualResources([{assetId:'c4',kind:'map',status:'unavailable',reason:'visual-unsupported'}]));
 {const p=fixture();p.execution.visualResources=[{assetId:'c4',kind:'map',status:'unavailable',reason:'visual-unsupported'}];assert.ok(validateExecutablePresentation(p),'the whole presentation stays valid');}
 {const p=fixture();p.execution.visualResources=[{assetId:'c4',kind:'map',status:'unavailable',reason:'too-big'}];assert.throws(()=>validateExecutablePresentation(p));}
 for(const reason of ['too-big','Visual-Unsupported','visual-unsupported ','',null,1])assert.throws(()=>validateVisualResources([{assetId:'c4',kind:'map',status:'unavailable',reason}]),String(reason));
 assert.throws(()=>validateVisualResources([{assetId:'c4',kind:'map',status:'unavailable',reason:'visual-unsupported',subReason:'fresh-byte-limit'}]),'the entry shape stays closed');
});
