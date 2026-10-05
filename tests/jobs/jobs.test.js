import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {canonical,sha256,requestBinding} from '../../server/core/jobs/codec.mjs';
import {JobStore,fixtureBytes} from '../../server/core/jobs/store.mjs';
import {localFixtureCapability} from '../../server/core/budget/fixture.mjs';
import {audioPlan} from '../../server/fia/audio/plan.mjs';
import {request} from './fixture.mjs';
const childFile=new URL('./child.mjs',import.meta.url);
async function setup(t) {
  const directory=await mkdtemp(join(tmpdir(),'fia-j-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  return {directory,store:new JobStore(directory,{operator:'test',capability:localFixtureCapability('test')})};
}
function child(directory,id,mode) {return run([childFile.pathname,directory,id,mode]);}
function run(arguments_) {
  return new Promise((resolve,reject)=>{
    const proc=spawn(process.execPath,arguments_);let stdout='',stderr='';
    proc.stdout.on('data',data=>stdout+=data);proc.stderr.on('data',data=>stderr+=data);proc.on('error',reject);
    proc.on('close',code=>resolve({code,stdout,stderr}));
  });
}
test('restricted canonical bytes and input validation',()=>{
  assert.equal(canonical({z:'é',a:['中','😀','e\u0301']}),' {"a":["中","😀","é"],"z":"é"}'.trim());
  assert.equal(sha256(canonical({a:'b'})),'db4a7ecb114bc66c623a06c4ff6fe8daa2f49cc270ebbf7a1f81e22ab061c837');
  for(const value of [1,NaN,undefined,[,],new Date(),{a:undefined},'\ud800',Object.defineProperty({},'a',{value:'x'}),Object.defineProperty({},'a',{get(){throw Error('getter executed')},enumerable:true})])assert.throws(()=>canonical(value));
  const cyclic={};cyclic.a=cyclic;assert.throws(()=>canonical(cyclic));
  assert.throws(()=>requestBinding({...request(),extra:'x'}));
  assert.throws(()=>requestBinding(request({effectiveText:'changed'})));
});
test('permission and caps fail closed; full configuration affects binding',async t=>{
  const {directory}=await setup(t);
  for(const change of [{operator:'other'},{monetaryCap:'1'},{externalCalls:'1'},{attemptsPerJob:'2'},{permission:'other'},{mode:'paid'}])assert.throws(()=>new JobStore(directory,{operator:'test',capability:{...localFixtureCapability('test'),...change}}));
  assert.throws(()=>new JobStore(directory,{operator:'',capability:localFixtureCapability('')}));
  const original=requestBinding(request()).buildKey;
  for(const change of [{language:'different'},{portion:'another'},{generation:{...request().generation,voice:'changed'}},{generation:{...request().generation,settings:{seed:'1'}}},{normalization:{revision:'changed',config:{}}}])assert.notEqual(requestBinding(request(change)).buildKey,original);
});
test('CLI lifecycle, durable reuse and ordered nonplayable confirm plan',async t=>{
  const {directory,store}=await setup(t);const first=await store.enqueue('first',request());
  const completed=await child(directory,first.id,'execute');assert.equal(completed.code,0,completed.stderr);
  const fresh=await child(directory,first.id,'status');assert.equal(JSON.parse(fresh.stdout).state,'completed');
  const reused=await store.enqueue('first',request());assert.equal(reused.id,first.id);assert.equal(reused.state,'completed');
  assert.notEqual(reused.buildKey,reused.output.outputSha);
  await assert.rejects(store.enqueue('first',request({language:'changed'})),/conflict/);
  const second=await store.enqueue('second',request({portion:'second'}));
  await assert.rejects(audioPlan(store,[second.id]),/unavailable/);await store.execute(second.id);
  const plan=await audioPlan(store,[second.id,first.id]);assert.equal(plan.playable,false);assert.deepEqual(plan.entries.map(e=>e.portion),['second','fixture-portion']);assert(plan.entries.every(e=>e.completion==='confirm'&&e.provenance==='synthetic-fixture'));
  await assert.rejects(store.execute(first.id),/not-permitted/);
});
test('two child processes contend and fixture provider is invoked once',async t=>{
  const {directory,store}=await setup(t);const job=await store.enqueue('race',request());
  const results=await Promise.all([child(directory,job.id,'execute'),child(directory,job.id,'execute')]);
  assert.equal(results.filter(r=>r.code===0).length,1,JSON.stringify(results));
  assert.equal(await readFile(join(directory,'calls'),'utf8'),'called\n');assert.equal((await store.status(job.id)).state,'completed');
});
test('fresh process queued recovery and preparing crash never repeats',async t=>{
  const {directory,store}=await setup(t);const job=await store.enqueue('crash',request());
  assert.equal(JSON.parse((await child(directory,job.id,'status')).stdout).state,'queued');
  assert.equal((await child(directory,job.id,'crash-preparing')).code,77);
  const uncertain=await store.status(job.id);assert.equal(uncertain.state,'uncertain');assert.equal(uncertain.persistedState,'preparing');
  assert.equal((await child(directory,job.id,'execute')).code,1);
  await assert.rejects(store.reconcile(job.id,{attempt:uncertain.attempt,revision:99,outcome:'no-output',evidence:'fixture'}),/stale/);
  const recovered=await store.reconcile(job.id,{attempt:uncertain.attempt,revision:uncertain.revision,outcome:'recovered',bytes:fixtureBytes(request()),evidence:'fixture original attempt recovered'});
  assert.equal(recovered.state,'completed');await assert.rejects(store.execute(job.id),/not-permitted/);
});
test('crash after output needs exact dead-lock recovery and original reconciliation',async t=>{
  const {directory,store}=await setup(t);const job=await store.enqueue('output-crash',request());
  assert.equal((await child(directory,job.id,'crash-output')).code,77);
  await assert.rejects(store.status(job.id),/busy/);
  const lock=JSON.parse(await readFile(join(directory,'lock/owner.json'),'utf8'));
  await assert.rejects(store.recoverLock('wrong-token'),/refused/);await store.recoverLock(lock.token);
  const uncertain=await store.status(job.id);assert.equal(uncertain.state,'uncertain');
  await assert.rejects(store.execute(job.id),/not-permitted/);
  await store.reconcile(job.id,{attempt:uncertain.attempt,revision:uncertain.revision,outcome:'recovered',bytes:fixtureBytes(request()),evidence:'fixture bytes read back'});
  assert.equal(await readFile(join(directory,'calls'),'utf8'),'called\n');assert.equal((await store.status(job.id)).state,'completed');
});
test('live lock cannot be reclaimed',async t=>{
  const {directory,store}=await setup(t);await mkdir(join(directory,'lock'));
  await writeFile(join(directory,'lock/owner.json'),JSON.stringify({token:'live',pid:process.pid}));
  await assert.rejects(store.recoverLock('live'),/alive/);
});
test('unknown and failed outcomes never retry; reconciliation rejects mismatched bytes',async t=>{
  const {store}=await setup(t);const job=await store.enqueue('unknown',request());
  const uncertain=await store.execute(job.id,async()=>{throw Error('timeout');});assert.equal(uncertain.state,'uncertain');
  await assert.rejects(store.execute(job.id),/not-permitted/);
  await assert.rejects(store.reconcile(job.id,{attempt:uncertain.attempt,revision:uncertain.revision,outcome:'recovered',bytes:Buffer.from('wrong'),evidence:'fixture'}),/binding/);
  const failed=await store.reconcile(job.id,{attempt:uncertain.attempt,revision:uncertain.revision,outcome:'no-output',evidence:'fixture definitive absence'});assert.equal(failed.state,'failed');
  await assert.rejects(store.execute(job.id),/not-permitted/);
  const second=await store.enqueue('failed',request());assert.equal((await store.execute(second.id,async()=>({kind:'definitive-failure'}))).state,'failed');
});
test('reconciliation wins over late provider and cannot be replaced',async t=>{
  const {store}=await setup(t);const job=await store.enqueue('late',request());let release,entered;
  const arrived=new Promise(resolve=>entered=resolve),wait=new Promise(resolve=>release=resolve);
  const running=store.execute(job.id,async()=>{entered();await wait;return {kind:'output',bytes:fixtureBytes(request())};});
  await arrived;const current=await store.status(job.id);
  await store.reconcile(job.id,{attempt:current.attempt,revision:current.revision,outcome:'no-output',evidence:'trusted fixture resolution'});
  release();await assert.rejects(running,/stale-attempt/);assert.equal((await store.status(job.id)).state,'failed');
});
test('corrupt snapshots and completed artifacts fail closed',async t=>{
  const {directory,store}=await setup(t);const job=await store.enqueue('corrupt',request());const completed=await store.execute(job.id);
  await writeFile(join(directory,`artifact-${completed.output.outputSha}`),'wrong');
  await assert.rejects(store.enqueue('corrupt',request()),/corrupt/);await assert.rejects(audioPlan(store,[job.id]),/corrupt/);
  await writeFile(join(directory,'state.json'),'{');await assert.rejects(store.enqueue('new',request()),/corrupt/);
  assert.equal(await readFile(join(directory,'state.json'),'utf8'),'{');
});

test('actual local CLI creates, executes, reads and plans one fixture',async t=>{
  const {directory}=await setup(t), cli=new URL('../../server/core/jobs/cli.mjs',import.meta.url).pathname;
  const input=join(directory,'request.json');await writeFile(input,JSON.stringify(request()));
  const enqueued=await run([cli,'enqueue',directory,'test','cli-key',input]);assert.equal(enqueued.code,0,enqueued.stderr);
  const id=JSON.parse(enqueued.stdout).id;
  for(const command of ['execute','status','plan']) {
    const result=await run([cli,command,directory,'test',id]);assert.equal(result.code,0,result.stderr);
    const value=JSON.parse(result.stdout);assert.equal(command==='plan'?value.playable:value.state,command==='plan'?false:'completed');
  }
});
test('extra snapshot aliases and undeclared records fail closed',async t=>{
  const {directory,store}=await setup(t),job=await store.enqueue('key',request());
  const path=join(directory,'state.json'),original=JSON.parse(await readFile(path,'utf8'));
  for(const mutate of [state=>state.extra=true,state=>state.jobs[job.id].extra=true,state=>state.requests['a'.repeat(64)]=job.id,state=>state.jobs[job.id].attempt='invented',state=>state.jobs[job.id].reservation.monetaryCap='1']) {
    const state=structuredClone(original);mutate(state);await writeFile(path,JSON.stringify(state));await assert.rejects(store.status(job.id),/corrupt/);
  }
});
