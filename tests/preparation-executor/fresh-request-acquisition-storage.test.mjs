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
const modulePath=fileURLToPath(new URL('../../server/fia/preparation/executor/fresh-request-acquisition.mjs',import.meta.url));
const fixturePath=fileURLToPath(new URL('./fixtures/request-snapshot-fixture.mjs',import.meta.url));
const worker=`import {createFreshRequestAcquisition} from ${JSON.stringify(modulePath)};
import {setup} from ${JSON.stringify(fixturePath)};
export class Job {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.fetches=0;this.eligible=true;this.init=this.setup();}
 async setup(){
  const object=await this.env.BUCKET.get('fixture/source');
  this.fixture=await setup({store:this.ctx.storage,objects:this.env.BUCKET,bytes:new Uint8Array(await object.arrayBuffer())});
  const options=this.fixture.options;
  this.app=await createFreshRequestAcquisition({...options,snapshots:{policy:this.fixture.policy,eligibility:()=>this.eligible,alignmentConfigSha256:this.fixture.next.identity.alignmentConfigSha256,deliveryConfigSha256:this.fixture.next.identity.deliveryConfigSha256},freshness:{
   source:{logicalId:this.fixture.next.logicalId,url:options.knownSources[0].policy.url,sourceVersionKind:'discovery-snapshot',sourceVersion:this.fixture.request.presentationRevision,publisherVersion:null},
   policy:{revision:'fixture-fresh-v1',maxBytes:1048576,totalMs:10000,progressMs:1000},
   admissions:[{checkId:'first',sequence:1,expectedPreviousObservationSha256:null,previousSourceSha256:null}],eligibility:()=>this.eligible,
   fetchSource:async()=>{this.fetches++;if(this.env.OFFLINE)throw Error('publisher-offline');const source=await this.env.BUCKET.get('fixture/source');return new Response(source.body,{headers:{'content-type':'audio/mpeg','content-length':String(source.size)}});}
  }});
 }
 async fetch(req){await this.init;const input=await req.json();if(input.revoke)this.eligible=false;
  try{if(input.demand)return Response.json({result:await this.app.demand(this.fixture.request,{sequence:2,expectedPreviousObservationSha256:this.fixture.next.expectedPreviousObservationSha256}),fetches:this.fetches});if(input.observe)return Response.json({observation:await this.app.observe('first'),fetches:this.fetches});
   return Response.json({result:await this.app.request(this.fixture.request),fetches:this.fetches});
  }catch(error){return Response.json({error:error.message,fetches:this.fetches});}
 }
}
export default{fetch(req,env){return env.JOBS.get(env.JOBS.idFromName('section')).fetch(req);}};`;
const bundle=await build({stdin:{contents:worker,resolveDir:resolve('.')},bundle:true,format:'esm',platform:'browser',external:['node:crypto'],write:false});
function runtime(path,offline=false){return new Miniflare({...convertV4MiniflareOptions({name:'fresh-request-fixture',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{OFFLINE:offline},durableObjects:{JOBS:{className:'Job',useSQLite:true}},r2Buckets:['BUCKET']}),resourcePersistencePath:path});}
const call=(mf,input={})=>mf.dispatchFetch('https://fixture.invalid/request',{method:'POST',body:JSON.stringify(input)}).then(r=>r.json());
test('actual SQLite/R2 fresh original feeds preparation with one fetch and survives offline restart',{skip:!process.env.FIA_RETAINED_P2},async t=>{
 const bytes=await readFile(process.env.FIA_RETAINED_P2);assert.equal(bytes.length,867865);
 assert.equal(await sha256(bytes),'0f3fa9e77215f5050f9e22b7abee329c47e0e9ff71a5f0c4d248926a8f42268d');
 const dir=await mkdtemp(join(tmpdir(),'fresh-request-'));t.after(()=>rm(dir,{recursive:true,force:true}));let mf=runtime(dir);
 try{
  await(await mf.getR2Bucket('BUCKET')).put('fixture/source',bytes);
  const absent=await call(mf);assert.match(absent.error,/fresh-observation-unavailable/);assert.equal(absent.fetches,0);
  assert.equal((await call(mf,{observe:true})).fetches,1);
  const cold=await call(mf);assert.equal(cold.result.preparation.node,'transcribe');assert.equal(cold.result.preparation.state,'blocked');assert.equal(cold.fetches,1);
  const snapshot=await call(mf,{demand:true});assert.equal(snapshot.result.snapshot.refresh.state,'blocked');assert.equal(snapshot.result.snapshot.state,'ready');assert.equal(snapshot.fetches,1);
  await mf.dispose();mf=runtime(dir,true);
  const warm=await call(mf);assert.equal(warm.fetches,0);assert.equal(warm.result.preparation.key,cold.result.preparation.key);assert.equal(warm.result.observationSha256,cold.result.observationSha256);
  assert.equal((await call(mf,{observe:true})).fetches,0);
  const saved=await call(mf,{demand:true});assert.equal(saved.fetches,0);assert.deepEqual(saved.result.snapshot.served,snapshot.result.snapshot.served);
  assert.match((await call(mf,{revoke:true})).error,/fresh-ineligible/);
 }finally{await mf.dispose();}
});
