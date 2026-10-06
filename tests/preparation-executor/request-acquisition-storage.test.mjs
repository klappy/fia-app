import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {canonicalJSONString,sha256} from '../../server/fia/preparation/contract.mjs';
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json'));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare'),{build}=require('esbuild');
const modulePath=fileURLToPath(new URL('../../server/fia/preparation/executor/request-acquisition.mjs',import.meta.url));
const row={packId:'eng.MRK-1-14-20',presentationRevision:'a'.repeat(64),language:'eng',book:'MRK',edition:'fia-guide',publisherSourceId:'test-p2',publisherPassage:'1:14-20',stepId:'S01',sourceURL:'https://s3.amazonaws.com/cbbt-er.public/pericopes/eng/mrk/p2/s1/v2/vbr0.mp3',guideContentSha256:'b'.repeat(64),sourceMetadataSha256:'c'.repeat(64),sourceUnits:[{sourceUnitId:'S01-U001',sourceTextSha256:'d'.repeat(64)},{sourceUnitId:'S01-U002',sourceTextSha256:'e'.repeat(64)}]};
const metadata=canonicalJSONString({schema:'fia-published-guide-sources@1',rows:[row]});
const request={packId:row.packId,presentationRevision:row.presentationRevision,language:row.language,edition:row.edition,...row.sourceUnits[0]};
const sourceHash='0f3fa9e77215f5050f9e22b7abee329c47e0e9ff71a5f0c4d248926a8f42268d';
const config={metadataSha256:await sha256(metadata),knownSources:[{source:{publisherId:'fia-guide',resourceId:row.publisherSourceId,version:row.presentationRevision},policy:{policy:'fia-known-long-original@1',url:row.sourceURL,sourceVersion:row.presentationRevision,sha256:sourceHash,bytes:867865}}],modelRecipe:{modelId:'disabled-test-model',modelRevision:'disabled',configSha256:'f'.repeat(64)},policyRevision:'integration-test-v1'};
const worker=`import {createRequestAcquisition} from ${JSON.stringify(modulePath)};
export class Job {
 constructor(ctx,env){this.ctx=ctx;this.fetches=0;this.app=createRequestAcquisition({...${JSON.stringify(config)},metadataBytes:new TextEncoder().encode(${JSON.stringify(metadata)}),storage:ctx.storage,bucket:env.BUCKET,fetchSource:async()=>{if(env.OFFLINE)throw Error('publisher-disabled');this.fetches++;const object=await env.BUCKET.get('fixture/source');return new Response(object.body,{headers:{'content-type':'audio/mpeg','content-length':String(object.size)}});}});}
 async fetch(req){try{return Response.json({result:await(await this.app).request(await req.json()),fetches:this.fetches});}catch(error){return Response.json({error:error?.message??String(error),fetches:this.fetches});}}
}
export default{fetch(req,env){return env.JOBS.get(env.JOBS.idFromName('section')).fetch(req);}};`;
const bundle=await build({stdin:{contents:worker,resolveDir:resolve('.')},bundle:true,format:'esm',platform:'browser',external:['node:crypto'],write:false});
function runtime(path,offline=false){return new Miniflare({...convertV4MiniflareOptions({name:'request-acquisition-fixture',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{OFFLINE:offline},durableObjects:{JOBS:{className:'Job',useSQLite:true}},r2Buckets:['BUCKET']}),resourcePersistencePath:path});}
const call=(mf,input)=>mf.dispatchFetch('https://fixture.invalid/request',{method:'POST',body:JSON.stringify(input)}).then(r=>r.json());
test('actual SQLite/R2 request path deduplicates units, survives restart and rejects corruption',{skip:!process.env.FIA_RETAINED_P2},async t=>{
 const bytes=await readFile(process.env.FIA_RETAINED_P2);assert.equal(bytes.length,867865);assert.equal(await sha256(bytes),sourceHash);
 const dir=await mkdtemp(join(tmpdir(),'request-acquisition-'));t.after(()=>rm(dir,{recursive:true,force:true}));let mf=runtime(dir);
 try{
  const bucket=await mf.getR2Bucket('BUCKET');await bucket.put('fixture/source',bytes);
  const invalid=await call(mf,{...request,sourceTextSha256:'0'.repeat(64)});assert.match(invalid.error,/unresolved/);assert.equal(invalid.fetches,0);
  const results=await Promise.all([call(mf,request),call(mf,{...request,...row.sourceUnits[1]})]);
  assert.ok(results.some(r=>r.result?.node==='transcribe'&&r.result.state==='blocked'),JSON.stringify(results));assert.ok(results.every(r=>r.fetches<=1));
  const settled=await call(mf,request);assert.equal(settled.result.node,'transcribe');assert.equal(settled.result.state,'blocked');assert.equal(settled.fetches,1);
  const retained=await bucket.get('originals/sha256/'+sourceHash+'.mp3');assert.equal(await sha256(new Uint8Array(await retained.arrayBuffer())),sourceHash);
  await mf.dispose();mf=runtime(dir,true);
  const warm=await call(mf,request);assert.equal(warm.result.key,settled.result.key);assert.equal(warm.result.node,'transcribe');assert.equal(warm.result.state,'blocked');assert.equal(warm.fetches,0);
  await(await mf.getR2Bucket('BUCKET')).put('originals/sha256/'+sourceHash+'.mp3',new Uint8Array([1,2,3]));
  const corrupt=await call(mf,request);assert.equal(corrupt.result.node,'acquire');assert.equal(corrupt.result.state,'unavailable');assert.equal(corrupt.fetches,0);
 }finally{await mf.dispose();}
});
