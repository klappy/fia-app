import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildApprovedAudioProofIndex} from '../../scripts/approved-audio-proof-index.mjs';
import {canonicalJSONString,sha256} from '../../server/fia/preparation/contract.mjs';
import {SOURCE_ACTION_RECIPE} from '../../server/fia/compiler/presentation/source-action-projector.mjs';

// The registry of released execution builds is release authority: a historical row
// authenticates only under the {policy, recipe} its build wrote. A name computed from
// today's code or content (sha256(EXECUTION_POLICY), currentPolicy, a recipe constant)
// renames that build when a later release moves the value, and strands its rows.
const runtimePath='server/fia/preparation/executable-presentation-runtime.mjs';
const LITERAL=/^\{policy:'([a-f0-9]{64})',recipe:'(fia-server-source-action-projector@[1-9][0-9]*)',approvedAudio:(true|false)\}$/;
// aad92a4's EXECUTION_POLICY, written out: a later code release may move the module's.
const AAD92A4_EXECUTION_POLICY='fia-source-to-app/7fa17af806c139cfc353cace39fa6d50ed9e061b';
// The proof index every build from #189 through this one served (DEV serves the same bytes).
const D3BE5884={id:'approved-audio-proof-index',path:'/content/approved-audio/d3be588481b0be844fab52b285684702887dc863ba47b8abdbbeb23ec2b9f6b8.json',sha256:'d3be588481b0be844fab52b285684702887dc863ba47b8abdbbeb23ec2b9f6b8',bytes:4311,mime:'application/json'};
const fixture=`tests/worker-serving/fixtures/approved-audio/${D3BE5884.sha256}.json`;

// The registry as the runtime source writes it: the one array literal of {policy,...}
// entries, element by element, whitespace removed.
async function writtenRegistry(){
 const source=await readFile(runtimePath,'utf8'),starts=[...source.matchAll(/\[\s*\{\s*policy\s*:/g)];
 assert.equal(starts.length,1,'the runtime writes exactly one registry of released builds');
 let depth=0,end=-1;
 for(let i=starts[0].index;i<source.length&&end<0;i++){if('[{('.includes(source[i]))depth++;else if(']})'.includes(source[i])&&--depth===0)end=i;}
 const body=source.slice(starts[0].index+1,end),elements=[...body.matchAll(/\{[^{}]*\}/g)].map(m=>m[0].replace(/\s+/g,''));
 assert.match(body.replace(/\{[^{}]*\}/g,''),/^[\s,]*$/,'the registry holds entry objects only: no spread, call, comment or computed element');
 return elements;
}

test('every registry entry is a literal: no computed policy and no moving recipe constant names a released build',async()=>{
 const elements=await writtenRegistry(),computed=elements.filter(e=>!LITERAL.test(e));
 assert.deepEqual(computed,[],"each entry is {policy:'<64 hex>',recipe:'fia-server-source-action-projector@<n>',approvedAudio:<true|false>}, written out");
 const written=elements.map(e=>{const [,policy,recipe,approvedAudio]=LITERAL.exec(e);return {policy,recipe,approvedAudio:approvedAudio==='true'};});
 assert.equal(new Set(written.map(e=>e.policy+' '+e.recipe)).size,written.length,'no build is named twice');
 const {SUPERSEDED_BUILDS}=await import('../../'+runtimePath);
 assert.deepEqual(SUPERSEDED_BUILDS,written,'the runtime serves exactly the written registry');
 assert.ok(Object.isFrozen(SUPERSEDED_BUILDS)&&SUPERSEDED_BUILDS.every(Object.isFrozen),'no caller can add, drop or rename a build');
});

test('the released builds keep their own literal names: aad92a4, the builds through e7eb0f0, and the builds from 45a3248',async()=>{
 const bytes=await readFile(fixture);assert.equal(bytes.length,D3BE5884.bytes);assert.equal(await sha256(new Uint8Array(bytes)),D3BE5884.sha256,'the stored d3be5884 proof index is byte-exact');
 assert.deepEqual(JSON.parse(bytes).authority,{registrySha256:'4aea7044189e7e6413deaff4e69c72e3b75ab4a1d72cf1dc63f4ced9cc4ec28c',sourceRevision:'f8776d92b090b5af5b17b17dc1137f25fb059ed0'});
 const withoutIndex=await sha256(AAD92A4_EXECUTION_POLICY),withIndex=await sha256(canonicalJSONString({policy:AAD92A4_EXECUTION_POLICY,approvedAudio:D3BE5884}));
 assert.equal(withoutIndex,'35e074a65296fbb4743e17bfe28f52b7e0e2b8b558c7a0d4a5fb7ceecad85a47');assert.equal(withIndex,'9a7733f5139e9cf7352bfe4018f3164715e69abc9eba3776052bdc324f33295c');
 const {SUPERSEDED_BUILDS}=await import('../../'+runtimePath);
 assert.deepEqual(SUPERSEDED_BUILDS.slice(0,3),[
  {policy:withoutIndex,recipe:'fia-server-source-action-projector@1',approvedAudio:false},
  {policy:withIndex,recipe:'fia-server-source-action-projector@1',approvedAudio:true},
  {policy:withIndex,recipe:'fia-server-source-action-projector@2',approvedAudio:true},
 ],'DEV holds rows under these three names: never edit or drop one; a new build is appended');
});

// Guard: a content release (the proof index) or a code release (EXECUTION_POLICY, the
// recipe) moves today's build. Its rows are stranded at the release after that unless
// the build is registered before it ships.
test('this build is registered, so the release after it cannot strand the rows it publishes',async()=>{
 const authority=JSON.parse(await readFile('server/fia/publication/trusted-generalized.json'));
 const proof=await buildApprovedAudioProofIndex({publicRoot:'apps/web/public',authority:{registrySha256:authority.catalog.sha256,sourceRevision:authority.sourceCommit}});
 const {EXECUTION_POLICY,SUPERSEDED_BUILDS}=await import('../../'+runtimePath);
 const policy=await sha256(canonicalJSONString({policy:EXECUTION_POLICY,approvedAudio:proof.descriptor}));
 assert.ok(SUPERSEDED_BUILDS.some(e=>e.policy===policy&&e.recipe===SOURCE_ACTION_RECIPE&&e.approvedAudio===true),`this build {${policy}, ${SOURCE_ACTION_RECIPE}} is not registered. Append the literal {policy:'${policy}',recipe:'${SOURCE_ACTION_RECIPE}',approvedAudio:true} to SUPERSEDED_BUILDS and a replay of it to executable-transition.test.mjs. Never edit an existing entry or a pinned test constant to the new value: those name builds DEV already holds rows for.`);
});
