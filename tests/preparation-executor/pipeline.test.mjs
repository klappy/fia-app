import test from 'node:test';
import assert from 'node:assert/strict';
import {createPipeline} from '../../server/fia/preparation/executor/pipeline.mjs';
import {sha256} from '../../server/fia/preparation/contract.mjs';
const names=['discover','acquire','transcribe','align','accept','publish'];
const input=()=>({packId:'eng.MRK-1-14-20',book:'MRK',language:'eng',edition:'publisher',passage:'1:14-20',resource:'S01',scriptSha256:'a'.repeat(64),source:{publisherId:'publisher',resourceId:'p2s1',version:'v2'},modelRecipe:{modelId:'local',modelRevision:'model@1',configSha256:'b'.repeat(64)},policyRevision:'policy@1'});
function disk(){const values=new Map();let tail=Promise.resolve();return {values,transaction(action){const job=tail.then(async()=>{const staging=new Map(structuredClone([...values]));const result=await action({get:async k=>structuredClone(staging.get(k)),put:async(k,v)=>staging.set(k,structuredClone(v))});values.clear();for(const [k,v] of staging)values.set(k,v);return result;});tail=job.catch(()=>{});return job;}};}
async function fixture(){const storage=disk(),counts={},retained=new Map(),adapters={};for(const node of names)adapters[node]={paid:false,run:async()=>{counts[node]=(counts[node]||0)+1;const bytes=new TextEncoder().encode(node==='accept'?JSON.stringify({status:'machine-accepted'}):node),digest=await sha256(bytes),value={sha256:digest,reference:`immutable:${digest}`,...(node==='accept'?{status:'machine-accepted'}:{})};retained.set(value.reference,bytes);return value;}};const options={storage,policyId:'local-reference@1',adapters,verifyArtifact:async artifact=>{const bytes=retained.get(artifact.reference);return bytes?.slice();}};return {storage,counts,retained,adapters,options,pipeline:createPipeline(options)};}
test('two simultaneous callers persist one claim before provider and never duplicate',async()=>{
 const f=await fixture();let release,entered;const arrival=new Promise(r=>entered=r),wait=new Promise(r=>release=r);const run=f.adapters.discover.run;f.adapters.discover.run=async context=>{entered();await wait;return run(context);};const pipeline=createPipeline(f.options),first=pipeline.run(input());await arrival;const second=await pipeline.run(input());assert.equal(second.state,'preparing');assert.equal(second.revision,1);release();assert.equal((await first).state,'ready');assert.deepEqual(Object.values(f.counts),[1,1,1,1,1,1]);
});
test('restart leaves persisted preparing unresolved and no automatic replay',async()=>{
 const f=await fixture();let entered;const arrival=new Promise(r=>entered=r);f.adapters.discover.run=async()=>{entered();return new Promise(()=>{});};createPipeline(f.options).run(input());await arrival;const restart=createPipeline(f.options);assert.equal((await restart.run(input())).state,'preparing');assert.equal(f.storage.values.size,1);
});
test('trusted reconciliation fences late provider and requires exact attempt revision',async()=>{
 const f=await fixture();let release,entered;const arrival=new Promise(r=>entered=r),wait=new Promise(r=>release=r);const run=f.adapters.discover.run;f.adapters.discover.run=async context=>{entered();await wait;return run(context);};const pipeline=createPipeline(f.options),pending=pipeline.run(input());await arrival;const current=await pipeline.run(input());
 await assert.rejects(pipeline.reconcile(input(),'discover',{...current,outcome:'failed',revision:99,evidence:'trusted evidence'}),/stale/);
 await pipeline.reconcile(input(),'discover',{...current,outcome:'failed',evidence:'definitive no result'});release();await assert.rejects(pending,/stale/);assert.equal((await pipeline.run(input())).state,'failed');
});
test('warm completed bytes reuse works offline and corrupt artifacts never rerun',async()=>{
 const f=await fixture();assert.equal((await f.pipeline.run(input())).state,'ready');const offline=Object.fromEntries(names.map(node=>[node,{paid:false,run:async()=>{throw Error('upstream offline');}}]));assert.equal((await createPipeline({...f.options,adapters:offline}).run(input())).state,'ready');assert.equal(f.counts.discover,1);f.retained.clear();assert.equal((await f.pipeline.run(input())).state,'unavailable');assert.equal(f.counts.discover,1);
});
test('missing recognition capability and review-required acceptance never publish',async()=>{
 const f=await fixture();delete f.adapters.transcribe;const blocked=await createPipeline(f.options).run(input());assert.equal(blocked.state,'blocked');assert.equal(blocked.node,'transcribe');assert.equal(f.counts.publish,undefined);
 const g=await fixture(),accept=g.adapters.accept.run;g.adapters.accept.run=async c=>{const value=await accept(c),bytes=new TextEncoder().encode(JSON.stringify({status:'review-required'}));value.sha256=await sha256(bytes);value.reference='immutable:'+value.sha256;g.retained.set(value.reference,bytes);return {...value,status:'machine-accepted'};};assert.equal((await createPipeline(g.options).run(input())).reason,'review-required');assert.equal(g.counts.publish,undefined);
});
test('same recording recognition shares across consumers while consumer stages remain separate',async()=>{
 const f=await fixture();await f.pipeline.run(input());const changed={...input(),packId:'other-consumer',scriptSha256:'c'.repeat(64)};assert.equal((await f.pipeline.run(changed)).state,'ready');assert.equal(f.counts.discover,1);assert.equal(f.counts.acquire,1);assert.equal(f.counts.transcribe,1);assert.equal(f.counts.align,2);assert.equal(f.counts.accept,2);assert.equal(f.counts.publish,2);
});
test('paid adapters blocked by default and semantic input rejects arbitrary locators',async()=>{
 const f=await fixture();f.adapters.discover.paid=true;assert.equal((await createPipeline(f.options).run(input())).state,'blocked');assert.equal(f.counts.discover,undefined);await assert.rejects(f.pipeline.run({...input(),source:{...input().source,url:'https://arbitrary.example'}}));
});
test('provider exception persists uncertainty and a new caller cannot retry it',async()=>{
 const f=await fixture();let calls=0;f.adapters.discover.run=async()=>{calls++;throw Error('outcome unknown');};const pipeline=createPipeline(f.options);assert.equal((await pipeline.run(input())).state,'uncertain');assert.equal((await createPipeline(f.options).run(input())).state,'uncertain');assert.equal(calls,1);
});
test('changed recognition configuration invalidates downstream nodes but reuses acquisition',async()=>{
 const f=await fixture();await f.pipeline.run(input());await f.pipeline.run({...input(),modelRecipe:{...input().modelRecipe,configSha256:'d'.repeat(64)}});assert.equal(f.counts.discover,1);assert.equal(f.counts.acquire,1);assert.equal(f.counts.transcribe,2);assert.equal(f.counts.publish,2);
});

test('warm acceptance descriptor cannot promote review-required hashed content',async()=>{
 const f=await fixture();f.adapters.accept.run=async()=>{const bytes=new TextEncoder().encode(JSON.stringify({status:'review-required'})),digest=await sha256(bytes);f.retained.set(digest,bytes);return {sha256:digest,reference:digest,status:'machine-accepted'};};const pipeline=createPipeline(f.options);assert.equal((await pipeline.run(input())).state,'blocked');const row=[...f.storage.values.values()].find(r=>r.identity.node==='accept');row.artifact.status='machine-accepted';assert.equal((await pipeline.run(input())).state,'blocked');assert.equal(f.counts.publish,undefined);
});
test('different discovery selection cannot reuse another language or passage discovery',async()=>{
 const f=await fixture();await f.pipeline.run(input());await f.pipeline.run({...input(),language:'spa'});assert.equal(f.counts.discover,2);await f.pipeline.run({...input(),passage:'1:21-28'});assert.equal(f.counts.discover,3);assert.equal(f.counts.acquire,1);
});
test('proven free predispatch outage retries on next demand only and recovers',async()=>{
 const f=await fixture(),success=f.adapters.discover.run;let calls=0;f.adapters.discover.retry={maxAttempts:2};f.adapters.discover.run=async context=>++calls===1?{kind:'retryable-failure',classification:'pre-dispatch',evidence:'connection failed before dispatch'}:success(context);const pipeline=createPipeline(f.options);
 const first=await pipeline.run(input());assert.equal(first.state,'retryable');assert.equal(calls,1);assert.equal((await pipeline.run(input())).state,'ready');assert.equal(calls,2);assert.equal((await pipeline.run(input())).state,'ready');assert.equal(calls,2);
});
test('retry budget persists through restart and cannot be increased by changed adapter',async()=>{
 const f=await fixture();let calls=0;f.adapters.discover.retry={maxAttempts:2};f.adapters.discover.run=async()=>{calls++;return {kind:'retryable-failure',classification:'idempotent-free-read',evidence:'safe GET unavailable'};};assert.equal((await createPipeline(f.options).run(input())).state,'retryable');f.adapters.discover.retry.maxAttempts=3;const fresh=createPipeline(f.options);assert.equal((await fresh.run(input())).state,'failed');assert.equal((await fresh.run(input())).state,'failed');assert.equal(calls,2);
});
test('ambiguous or paid classified failures never automatically retry',async()=>{
 for(const paid of [false,true]){const f=await fixture();let calls=0;f.adapters.discover.paid=paid;f.adapters.discover.retry={maxAttempts:3};f.adapters.discover.run=async()=>{calls++;return {kind:'retryable-failure',classification:paid?'pre-dispatch':'unknown',evidence:'cannot prove safe retry'};};const pipeline=createPipeline({...f.options,allowPaid:true});assert.equal((await pipeline.run(input())).state,'uncertain');assert.equal((await pipeline.run(input())).state,'uncertain');assert.equal(calls,1);}
});
test('old attempt reconciliation cannot overwrite a retried attempt',async()=>{
 const f=await fixture(),success=f.adapters.discover.run;let calls=0;f.adapters.discover.retry={maxAttempts:2};f.adapters.discover.run=async context=>++calls===1?{kind:'retryable-failure',classification:'pre-dispatch',evidence:'not dispatched'}:success(context);const pipeline=createPipeline(f.options),first=await pipeline.run(input());await pipeline.run(input());await assert.rejects(pipeline.reconcile(input(),'discover',{...first,revision:2,outcome:'failed',evidence:'stale report'}),/stale/);
});

test('all semantic scalar fields reject object null array and numeric values before claiming',async()=>{const f=await fixture();for(const key of ['packId','book','language','edition','passage','resource','scriptSha256','policyRevision'])for(const value of [null,{},[],42])await assert.rejects(f.pipeline.run({...input(),[key]:value}),/invalid-pipeline-input/);assert.equal(f.storage.values.size,0);assert.equal(f.counts.discover,undefined);});
