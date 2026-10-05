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
 constructor(ctx,env){this.storage=ctx.storage;this.env=env;}
 async fetch(request){
  const storage=this.storage;
  if(new URL(request.url).pathname==='/budget')return Response.json(await storage.get('hosted:budget'));
  const service=createHostedDispatch({storage,ledger:'A',activation:${JSON.stringify(activation)},identity:{sourceSha256:'a'.repeat(64),configSha256:'b'.repeat(64),modelSha256:'c'.repeat(64),scriptSha256:'d'.repeat(64)},validateResult:async()=>true,verifyArtifact:async artifact=>storage.get(artifact.reference),executor:{limitsEnforced:true,stop:async()=>true,start:async()=>{
   if(this.env.OFFLINE)throw Error('offline');
   await new Promise(resolve=>setTimeout(resolve,50));
   const bytes=new TextEncoder().encode('{}'),digest=await sha256(bytes),reference='recognition/sha256/'+digest+'.json';await storage.put(reference,bytes);return {sha256:digest,reference};
  }}});
  return Response.json(await service.dispatch());
 }
 async alarm(){}
}
export default {fetch(request,env){return env.JOBS.get(env.JOBS.idFromName('same-owner')).fetch(request);}};`;
const bundle=await build({stdin:{contents:source,resolveDir:resolve('.')},bundle:true,format:'esm',platform:'browser',write:false});
function runtime(directory,offline=false){return new Miniflare({...convertV4MiniflareOptions({name:'hosted-dispatch-fixture',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{OFFLINE:offline},durableObjects:{JOBS:{className:'FixtureDispatch',useSQLite:true,unsafeUniqueKey:'hosted-dispatch-fixture'}}}),resourcePersistencePath:directory});}
const run=mf=>mf.dispatchFetch('https://fixture.invalid/run').then(r=>r.json());
test('actual SQLite predispatch debit survives runtime restart; warm reuse starts nothing',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'fia-hosted-sqlite-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let mf=runtime(directory);try{
  const results=await Promise.all([run(mf),run(mf)]);assert.equal(results.filter(r=>r.state==='completed').length,1);assert.equal(results.filter(r=>r.state==='preparing').length,1);
  const first=results.find(r=>r.state==='completed');assert.equal((await(await mf.dispatchFetch('https://fixture.invalid/budget')).json()).starts,1);
  await mf.dispose();mf=runtime(directory,true);
  const reused=await run(mf);assert.equal(reused.state,'completed');assert.equal(reused.attemptId,first.attemptId);assert.equal(reused.artifact.sha256,first.artifact.sha256);
  assert.equal((await(await mf.dispatchFetch('https://fixture.invalid/budget')).json()).starts,1);
 }finally{await mf.dispose();}
});
