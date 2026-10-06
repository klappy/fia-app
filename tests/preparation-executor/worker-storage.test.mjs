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
const pipeline=fileURLToPath(new URL('../../server/fia/preparation/executor/pipeline.mjs',import.meta.url));
const contract=fileURLToPath(new URL('../../server/fia/preparation/contract.mjs',import.meta.url));
const input={packId:'eng.MRK-1-14-20',book:'MRK',language:'eng',edition:'fixture',passage:'1:14-20',resource:'S01',scriptSha256:'a'.repeat(64),source:{publisherId:'fixture',resourceId:'p2s1',version:'v2'},modelRecipe:{modelId:'fixture',modelRevision:'fixture@1',configSha256:'b'.repeat(64)},policyRevision:'fixture@1'};
const source=`import {createPipeline} from ${JSON.stringify(pipeline)};
import {sha256} from ${JSON.stringify(contract)};
export class FixturePipeline {
 constructor(ctx,env){this.storage=ctx.storage;this.env=env;}
 async fetch(request){
  const storage=this.storage;
  if(new URL(request.url).pathname==='/counts')return Response.json(await storage.get('counts')||{});
  const adapters=Object.fromEntries(['discover','acquire','transcribe','align','accept','publish'].map(node=>[node,{paid:false,run:async()=>{
   if(this.env.OFFLINE)throw Error('upstream-disabled-after-restart');
   await storage.transaction(async tx=>{const counts=await tx.get('counts')||{};counts[node]=(counts[node]||0)+1;await tx.put('counts',counts);});
   if(node==='discover')await new Promise(resolve=>setTimeout(resolve,50));
   const bytes=new TextEncoder().encode(JSON.stringify({node,...(node==='accept'?{status:'machine-accepted'}:{})})),digest=await sha256(bytes);
   await storage.put('artifact:'+digest,bytes);return {sha256:digest,reference:'artifact:'+digest};
  }}]));
  const pipeline=createPipeline({storage,policyId:'sqlite-fixture@1',adapters,verifyArtifact:async artifact=>storage.get(artifact.reference)});
  return Response.json(await pipeline.run(await request.json()));
 }
}
export default {fetch(request,env){return env.JOBS.get(env.JOBS.idFromName('same-owner')).fetch(request);}};`;
const bundle=await build({stdin:{contents:source,resolveDir:resolve('.')},bundle:true,format:'esm',platform:'browser',write:false});
function runtime(directory,offline=false){return new Miniflare({...convertV4MiniflareOptions({name:'pipeline-persistence-fixture',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{OFFLINE:offline},durableObjects:{JOBS:{className:'FixturePipeline',useSQLite:true,unsafeUniqueKey:'pipeline-storage-fixture'}}}),resourcePersistencePath:directory});}
const run=mf=>mf.dispatchFetch('https://fixture.invalid/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}).then(r=>r.json());
test('actual SQLite DO permits one concurrent owner and survives complete runtime restart offline',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'fia-pipeline-sqlite-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let mf=runtime(directory);try{
  const results=await Promise.all([run(mf),run(mf)]);assert.equal(results.filter(r=>r.state==='ready').length,1);assert.equal(results.filter(r=>r.state==='preparing').length,1);
  const counts=await(await mf.dispatchFetch('https://fixture.invalid/counts')).json();assert.deepEqual(counts,{discover:1,acquire:1,transcribe:1,align:1,accept:1,publish:1});
  const first=results.find(r=>r.state==='ready');await mf.dispose();mf=runtime(directory,true);
  const reused=await run(mf);assert.equal(reused.state,'ready');assert.equal(reused.key,first.key);assert.equal(reused.artifact.sha256,first.artifact.sha256);
  assert.deepEqual(await(await mf.dispatchFetch('https://fixture.invalid/counts')).json(),counts);
 }finally{await mf.dispose();}
});
