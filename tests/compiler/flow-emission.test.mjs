import test from 'node:test';import assert from 'node:assert/strict';
import {canonicalJSONString,sha256} from '../../server/fia/preparation/contract.mjs';
import {projectExecutablePresentation,validateExecutablePresentation,matchesSchema,SOURCE_ACTION_RECIPE,FLOW_ROLE_SCHEMA,flowFor} from '../../server/fia/compiler/presentation/source-action-projector.mjs';
import executionSchema from '../../server/fia/compiler/presentation/executable-presentation.schema.json' with {type:'json'};
import {executableFixture} from '../preparation/fixtures/executable-presentation-fixture.mjs';
// fia-flow-role@1 emission (cookbook work/active/2026-10-06-fia-easy-button-policy PLAN step 13).
// Read-only use of the preparation fixture; nothing under tests/preparation is edited.
const project=f=>projectExecutablePresentation({...f.context,decisions:[f.decision]});
const holdOf=a=>a.execution.completion.action==='manual-continue'?'manual':'auto';
const rehash=async f=>{f.decision.result.inputSha256=await sha256(canonicalJSONString(f.decision.input));};
const pauseOnlyFixture=async(opts={})=>{const f=await executableFixture(opts);f.decision.input.requestedDecisions=['cue-roles'];f.decision.input.intentSlots=[];await rehash(f);f.decision.result.resourceAssociations=[];f.decision.result.cueRoles.roles={readingRequested:false,discussionRequested:false,resourceLookupRequested:false,pauseOnly:true};return f;};
function assertFlowShape(a){
 assert.deepEqual(Object.keys(a.flow).sort(),['cue','hold','media','role','schema'],a.id);
 assert.equal(a.flow.schema,FLOW_ROLE_SCHEMA);assert.equal(a.flow.role,a.kind,a.id);assert.equal(a.flow.hold,holdOf(a),a.id);
 assert.deepEqual(Object.keys(a.flow.cue),['pauseOnly']);assert.equal(typeof a.flow.cue.pauseOnly,'boolean');assert.deepEqual(a.flow.media,{video:'none'});
}
test('recipe is bumped to @2 because projector output gained flow',()=>{
 assert.equal(SOURCE_ACTION_RECIPE,'fia-server-source-action-projector@2');
});
test('every projected activity, including derived resource steps, carries fia-flow-role@1 matching kind and completion',async()=>{
 for(const opts of [{},{language:'spa',suffix:'spa'},{ambiguousMap:true,unknownTransition:true},{unknownTransition:true}]){
  const f=await executableFixture(opts),out=await project(f);
  assert.ok(out.presentation.activities.length>=3);
  for(const a of out.presentation.activities)assertFlowShape(a);
  assert.equal(out.presentation.execution.recipeRevision,SOURCE_ACTION_RECIPE);
  assert.ok(matchesSchema(out.presentation,executionSchema));
 }
 const f=await executableFixture(),out=await project(f),[intro,primary,secondary]=out.presentation.activities;
 assert.equal(intro.flow.hold,'auto');assert.equal(primary.flow.role,'discussion');assert.equal(primary.flow.hold,'manual');
 assert.equal(secondary.fulfills,primary.id);assert.equal(secondary.flow.role,'discussion');assert.equal(secondary.flow.hold,'manual');assert.equal(secondary.flow.cue.pauseOnly,false);
});
test('pauseOnly is true iff the resolved cue roles say pauseOnly; resolved non-pause and unresolved cues stay false',async()=>{
 const p=await pauseOnlyFixture(),out=await project(p),byId=new Map(out.presentation.activities.map(a=>[a.id,a]));
 assert.equal(byId.get(p.ids.cue).flow.cue.pauseOnly,true);assert.equal(byId.get(p.ids.cue).flow.hold,'manual');
 for(const a of out.presentation.activities)if(a.id!==p.ids.cue)assert.equal(a.flow.cue.pauseOnly,false,a.id);
 const resolved=await project(await executableFixture());for(const a of resolved.presentation.activities)assert.equal(a.flow.cue.pauseOnly,false,a.id);
 for(const cueRoles of [{outcome:'unknown',roles:null},null]){
  const u=await pauseOnlyFixture();if(cueRoles===null){u.decision.input.requestedDecisions=['resource-association'];await rehash(u);u.decision.result.cueRoles=null;}else u.decision.result.cueRoles={...u.decision.result.cueRoles,...cueRoles};
  const o=await project(u);for(const a of o.presentation.activities){assertFlowShape(a);assert.equal(a.flow.cue.pauseOnly,false,a.id);}
 }
});
test('flow emission reads facts only: identical facts with different source wording give identical flow',async()=>{
 const eng=await project(await pauseOnlyFixture()),spa=await project(await pauseOnlyFixture({language:'spa'}));
 assert.deepEqual(eng.presentation.activities.map(a=>a.flow),spa.presentation.activities.map(a=>a.flow));
 assert.deepEqual(flowFor('scripture','manual-continue',undefined),{schema:'fia-flow-role@1',role:'scripture',hold:'manual',cue:{pauseOnly:false},media:{video:'none'}});
});
test('base presentation, every non-flow activity field and projection events are unchanged by flow emission',async()=>{
 const f=await executableFixture(),before=canonicalJSONString(f.context.basePresentation),revision=await sha256(new TextEncoder().encode(before)),out=await project(f);
 assert.equal(canonicalJSONString(f.context.basePresentation),before);assert.equal(revision,f.context.baseRevision);
 assert.equal(out.presentation.activities.some(a=>a.flow===undefined),false);
 for(const event of out.provenance.events)for(const e of event.events)for(const step of e.orderedSteps)assert.equal(Object.hasOwn(step,'flow'),false);
 for(const a of f.context.basePresentation.activities)assert.equal(Object.hasOwn(a,'flow'),false);
});
test('schema keeps flow optional and closed; validator refuses flow that disagrees with kind or completion',async()=>{
 const f=await executableFixture(),out=await project(f),bare=structuredClone(out.presentation);for(const a of bare.activities)delete a.flow;
 assert.ok(matchesSchema(bare,executionSchema));await validateExecutablePresentation(bare,{boundArtifacts:f.context.boundArtifacts,baseRevision:f.context.baseRevision,language:'eng'});
 for(const mutate of [a=>{a.flow.extra=1;},a=>{a.flow.schema='fia-flow-role@2';},a=>{a.flow.media.video='maybe';},a=>{a.flow.cue.text='pause';},a=>{delete a.flow.cue;}]){const p=structuredClone(out.presentation);mutate(p.activities[0]);assert.equal(matchesSchema(p,executionSchema),false);}
 for(const mutate of [a=>{a.flow.role='scripture';},a=>{a.flow.hold=a.flow.hold==='auto'?'manual':'auto';}]){const p=structuredClone(out.presentation);mutate(p.activities[0]);await assert.rejects(validateExecutablePresentation(p,{boundArtifacts:f.context.boundArtifacts,baseRevision:f.context.baseRevision,language:'eng'}),/execution-flow-compatibility/);}
});
