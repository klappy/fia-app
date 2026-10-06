import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
// Actual local workerd + SQLite persistence, synthetic adapters. No hosted ASR claim.
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json'));
const {build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const dispatch=fileURLToPath(new URL('../../server/fia/preparation/hosted-asr/dispatch.mjs',import.meta.url));
const contract=fileURLToPath(new URL('../../server/fia/preparation/contract.mjs',import.meta.url));
const activation={startedAt:Date.now(),expiresAt:Date.now()+1200000};activation.expiresAt=activation.startedAt+1200000;
const source=`import {createHostedDispatch} from ${JSON.stringify(dispatch)};
import {sha256} from ${JSON.stringify(contract)};
export class FixtureDispatch {
 constructor(ctx,env){this.storage=ctx.storage;this.env=env;this.alarms=0;this.running=null;this.stops=[];}
 async fetch(request){
  const path=new URL(request.url).pathname,storage=this.storage;
  if(path==='/release'){this.release?.();return Response.json({released:true});}
  if(path==='/counts')return Response.json({running:this.running,stops:this.stops,waiting:!!this.release});
  const bytes=new TextEncoder().encode('{}'),digest=await sha256(bytes),artifact={sha256:digest,reference:'recognition/sha256/'+digest+'.json'};
  const adapter={get:key=>storage.get(key),transaction:fn=>storage.transaction(fn),setAlarm:async value=>{if(this.env.GATE_ALARM&&++this.alarms===2)await new Promise(r=>this.release=r);await storage.setAlarm(value);}};
  const service=lane=>createHostedDispatch({storage:adapter,ledger:lane,activation:${JSON.stringify(activation)},identity:{sourceSha256:'0f3fa9e77215f5050f9e22b7abee329c47e0e9ff71a5f0c4d248926a8f42268d',sourceBytes:867865,modelId:'Systran/faster-whisper-small',modelRevision:'536b0662742c02347bc0e980a01041f333bce120',language:'eng',runtimeSha256:'e'.repeat(64),configSha256:'b'.repeat(64),modelSha256:'c'.repeat(64),scriptSha256:'d'.repeat(64)},validateResult:async()=>true,verifyArtifact:async()=>bytes,executor:{limitsEnforced:true,start:async row=>{if(this.env.OFFLINE)throw Error('unexpected-new-start');this.running=row.ledger;return artifact;},stop:async row=>{if(this.env.OFFLINE)throw Error('unexpected-new-stop');this.stops.push({lane:row.ledger,running:this.running});if(this.env.UNRESOLVED)return false;this.running=null;return true;}}});
  try{if(path==='/status')return Response.json(await service('A').status());if(path==='/reconcile'){const row=await service('A').status();return Response.json(await service('A').reconcile({attemptId:row.attemptId,revision:row.revision,artifact}));}return Response.json(await service(path==='/B'?'B':'A').dispatch());}catch(error){return Response.json({error:error.message});}
 }
 async alarm(){}
}
export default {fetch(request,env){return env.JOBS.get(env.JOBS.idFromName('same-owner')).fetch(request);}};`;
const bundle=await build({stdin:{contents:source,resolveDir:resolve('.')},bundle:true,format:'esm',platform:'browser',write:false});
function runtime(directory,options={}){return new Miniflare({...convertV4MiniflareOptions({name:'stop-lease-dispatch-fixture',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:options,durableObjects:{JOBS:{className:'FixtureDispatch',useSQLite:true,unsafeUniqueKey:'stop-lease-dispatch-fixture'}}}),resourcePersistencePath:directory});}
const call=(mf,path)=>mf.dispatchFetch('https://fixture.invalid'+path).then(r=>r.json());
async function poll(mf){for(let i=0;i<100;i++){const counts=await call(mf,'/counts');if(counts.waiting)return;await new Promise(r=>setTimeout(r,5));}throw Error('gate-timeout');}
test('actual SQLite gated old alarm cannot reconcile A or allocate B before sole stop completes',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'fia-stop-lease-sqlite-'));t.after(()=>rm(directory,{recursive:true,force:true}));const mf=runtime(directory,{GATE_ALARM:true});try{
  const pending=call(mf,'/A');await poll(mf);assert.equal((await call(mf,'/status')).stopLease.state,'pending');assert.equal((await call(mf,'/reconcile')).error,'stop-unverified');assert.equal((await call(mf,'/B')).reason,'singleton-unresolved');assert.deepEqual((await call(mf,'/counts')).stops,[]);
  await call(mf,'/release');assert.equal((await pending).state,'completed');assert.equal((await call(mf,'/B')).state,'completed');assert.deepEqual((await call(mf,'/counts')).stops,[{lane:'A',running:'A'},{lane:'B',running:'B'}]);
 }finally{await mf.dispose();}
});
test('actual SQLite unresolved native outcome remains locked through runtime restart',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'fia-stop-lease-restart-'));t.after(()=>rm(directory,{recursive:true,force:true}));let mf=runtime(directory,{UNRESOLVED:true});try{
  const first=await call(mf,'/A');assert.equal(first.state,'uncertain');assert.equal(first.stopLease.state,'pending');assert.equal((await call(mf,'/counts')).stops.length,1);
  await mf.dispose();mf=runtime(directory,{OFFLINE:true});const retained=await call(mf,'/status');assert.equal(retained.stopLease.token,first.stopLease.token);assert.equal((await call(mf,'/reconcile')).error,'stop-unverified');assert.equal((await call(mf,'/B')).reason,'singleton-unresolved');assert.deepEqual((await call(mf,'/counts')).stops,[]);
 }finally{await mf.dispose();}
});
