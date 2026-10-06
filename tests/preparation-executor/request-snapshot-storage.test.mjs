import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {sha256} from '../../server/fia/preparation/contract.mjs';
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json'));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare'),{build}=require('esbuild');
const modulePath=fileURLToPath(new URL('../../server/fia/preparation/executor/request-snapshot.mjs',import.meta.url));
const fixturePath=fileURLToPath(new URL('./fixtures/request-snapshot-fixture.mjs',import.meta.url));
const worker=`import {createRequestSnapshots} from ${JSON.stringify(modulePath)};
import {setup} from ${JSON.stringify(fixturePath)};
export class Job {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.fetches=0;this.eligible=true;this.init=this.setup();}
 async setup(){
  const object=await this.env.BUCKET.get('fixture/source');
  this.fixture=await setup({store:this.ctx.storage,objects:this.env.BUCKET,bytes:new Uint8Array(await object.arrayBuffer())});
  const options=this.fixture.options,fetchSource=options.fetchSource;delete options.makeStream;
  this.app=await createRequestSnapshots({acquisition:{...options,fetchSource:async()=>{this.fetches++;if(this.env.OFFLINE)throw Error('publisher-offline');return fetchSource();}},policy:this.fixture.policy,eligibility:()=>this.eligible});
 }
 async fetch(req){await this.init;const input=await req.json();if(input.revoke)this.eligible=false;
  if(input.prior)return Response.json(this.fixture.prior);
  return Response.json({result:await this.app.demand(this.fixture.request,this.fixture.next),fetches:this.fetches});
 }
}
export default{fetch(req,env){return env.JOBS.get(env.JOBS.idFromName('section')).fetch(req);}};`;
const bundle=await build({stdin:{contents:worker,resolveDir:resolve('.')},bundle:true,format:'esm',platform:'browser',external:['node:crypto'],write:false});
function runtime(path,offline=false){return new Miniflare({...convertV4MiniflareOptions({name:'request-snapshot-fixture',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{OFFLINE:offline},durableObjects:{JOBS:{className:'Job',useSQLite:true}},r2Buckets:['BUCKET']}),resourcePersistencePath:path});}
const call=(mf,input={})=>mf.dispatchFetch('https://fixture.invalid/request',{method:'POST',body:JSON.stringify(input)}).then(r=>r.json());
test('actual SQLite/R2 request preserves prior snapshot across acquisition, restart and revocation',{skip:!process.env.FIA_RETAINED_P2},async t=>{
 const bytes=await readFile(process.env.FIA_RETAINED_P2);assert.equal(bytes.length,867865);
 assert.equal(await sha256(bytes),'0f3fa9e77215f5050f9e22b7abee329c47e0e9ff71a5f0c4d248926a8f42268d');
 const dir=await mkdtemp(join(tmpdir(),'request-snapshot-'));t.after(()=>rm(dir,{recursive:true,force:true}));let mf=runtime(dir);
 try{
  await(await mf.getR2Bucket('BUCKET')).put('fixture/source',bytes);
  const prior=await call(mf,{prior:true}),cold=await call(mf);
  assert.equal(cold.result.preparation.node,'transcribe');assert.equal(cold.result.preparation.state,'blocked');assert.equal(cold.fetches,1);
  assert.deepEqual(cold.result.snapshot.served,prior.served);assert.equal(cold.result.snapshot.refresh.state,'blocked');
  await mf.dispose();mf=runtime(dir,true);
  const warm=await call(mf);assert.equal(warm.fetches,0);assert.equal(warm.result.preparation,null);assert.deepEqual(warm.result.snapshot.served,prior.served);
  assert.equal((await call(mf,{revoke:true})).result.snapshot.served,null);
 }finally{await mf.dispose();}
});
