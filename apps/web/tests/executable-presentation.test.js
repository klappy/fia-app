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
