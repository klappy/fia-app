import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Actual local workerd + SQLite DO execution; not hosted/deployment evidence.
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json'));
const {build}=require('esbuild');
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const worker=fileURLToPath(new URL('../../server/fia/preparation/worker.mjs',import.meta.url));
const catalog=JSON.parse(await readFile(new URL('../../server/fia/preparation/catalog.json',import.meta.url),'utf8'));
const row=catalog.entries[0],origin='https://dev.fiaguide.app';
const requestFor=activity=>Object.fromEntries([...['packId','presentationRevision','language','edition','quality'].map(k=>[k,row.selection[k]]),...Object.entries(activity)]);
const bundled=await build({stdin:{contents:`export {FiaPreparationJobs} from ${JSON.stringify(worker)}; import {servePreparation} from ${JSON.stringify(worker)}; export default {async fetch(request,env){return await servePreparation(request,env)||new Response('not-found',{status:404});}};`,resolveDir:resolve('.')},bundle:true,format:'esm',platform:'browser',write:false});
const runtime=(directory,storage=true)=>new Miniflare({...convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{FIA_API_ORIGIN:origin},...(storage?{durableObjects:{FIA_PREPARATION_JOBS:{className:'FiaPreparationJobs',useSQLite:true}}}:{}),serviceBindings:{ASSETS:()=>new Response('no accepted fixture',{status:404})}}),resourcePersistencePath:directory});
const post=(mf,body,extra={})=>mf.dispatchFetch(origin+'/v1/preparations',{method:'POST',headers:{'Content-Type':'application/json',...extra},body:typeof body==='string'?body:JSON.stringify(body)});

test('local workerd rejects unknown/malformed requests before durable binding access',async()=>{
 const mf=runtime(undefined,false);
 try{
  const valid=requestFor(row.activities[0]);
  assert.equal((await post(mf,valid)).status,503,'valid request reaches absent binding');
  assert.equal((await post(mf,{...valid,packId:'eng.MRK-99-1-2'})).status,422);
  assert.equal((await post(mf,{...valid,operator:'caller-alias'})).status,422);
  assert.equal((await post(mf,valid,{Origin:'https://other.invalid'})).status,403);
  assert.equal((await post(mf,'{')).status,400);
  assert.equal((await post(mf,'x'.repeat(4097))).status,413);
  assert.equal((await mf.dispatchFetch(origin+'/v1/preparations/'+'f'.repeat(64))).status,404);
  assert.equal((await mf.dispatchFetch(origin+'/v1/preparations',{method:'POST',headers:{'Content-Type':'application/json'},body:new Uint8Array([255])})).status,400);
 }finally{await mf.dispose();}
});

test('local SQLite DO coalesces activities and preserves truthful blocked status across runtime restart',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'fia-preparation-runtime-'));let mf;let job;
 try{
  mf=runtime(directory);
  const responses=await Promise.all([post(mf,requestFor(row.activities[0])),post(mf,requestFor(row.activities[1]))]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);
  const records=await Promise.all(responses.map(r=>r.json()));
  assert.equal(records[0].jobId,records[1].jobId);
  assert.deepEqual(records.map(r=>r.reused).sort(),[false,true]);
  job=records[0];assert.equal(job.state,'blocked');assert.equal(job.reason,row.blockedReason);assert.equal(job.result,null);
  assert.equal(Object.hasOwn(job,'operator'),false);
  await mf.dispose();mf=undefined;
  mf=runtime(directory);
  const status=await mf.dispatchFetch(origin+job.statusUrl);assert.equal(status.status,200);
  const restored=await status.json();assert.equal(restored.jobId,job.jobId);assert.equal(restored.state,'blocked');assert.equal(restored.reason,row.blockedReason);assert.equal(restored.reused,true);
  const repeat=await post(mf,requestFor(row.activities[0]));assert.equal(repeat.status,200);assert.equal((await repeat.json()).jobId,job.jobId);
 }finally{if(mf)await mf.dispose();await rm(directory,{recursive:true,force:true});}
});

test('synthetic accepted catalog runs actual alarm, reuses ready receipt and blocks tampered static bytes',async()=>{
 const {createHash}=await import('node:crypto');
 const hash=value=>createHash('sha256').update(value).digest('hex');
 const fixture=structuredClone(catalog),selected=fixture.entries[0];
 const acceptanceSha256='a'.repeat(64),evidence={recordingLedgerSha256:'b'.repeat(64),timingSha256:'c'.repeat(64)};
 // Deliberately synthetic ranges and authority, injected only into test bundle.
 const result={schema:'fia-prepared-audio@1',...selected.identity,source:selected.source,delivery:{...selected.source,mime:'audio/mpeg',quality:selected.selection.quality},provenance:'official-recording',evidence:{acceptanceSha256,...evidence},activities:selected.activities.map((a,i)=>({...a,playbackRange:{startSeconds:i,endSeconds:i+0.5}}))};
 const {canonicalJSONString}=await import('../../server/fia/preparation/contract.mjs');
 const bytes=canonicalJSONString(result),resultSha256=hash(bytes);
 selected.accepted={path:`/content/prepared-audio/${resultSha256}.json`,bytes:Buffer.byteLength(bytes),expected:{resultSha256,acceptanceSha256,identity:selected.identity,source:selected.source,delivery:result.delivery,evidence,activities:selected.activities}};
 const injected=await build({stdin:{contents:`export {FiaPreparationJobs} from ${JSON.stringify(worker)};import {servePreparation} from ${JSON.stringify(worker)};export default {fetch:servePreparation};`,resolveDir:resolve('.')},bundle:true,format:'esm',platform:'browser',write:false,plugins:[{name:'synthetic-accepted-catalog',setup(b){b.onLoad({filter:/preparation\/catalog\.json$/},()=>({contents:JSON.stringify(fixture),loader:'json'}));}}]});
 for(const tamper of [false,true]){
  let acquisitions=0;
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:injected.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{FIA_API_ORIGIN:origin},durableObjects:{FIA_PREPARATION_JOBS:{className:'FiaPreparationJobs',useSQLite:true}},serviceBindings:{ASSETS:()=>{acquisitions++;return new Response(tamper?bytes.replace('official-recording','untrusted-recording'):bytes);}}}));
  try{
   const initial=await(await post(mf,requestFor(row.activities[0]))).json();
   let status=initial;
   for(let attempt=0;attempt<100&&status.state==='preparing';attempt++){
    await new Promise(resolve=>setTimeout(resolve,10));
    status=await(await mf.dispatchFetch(origin+initial.statusUrl)).json();
   }
   assert.equal(status.state,tamper?'blocked':'ready');assert.equal(acquisitions,1);
   if(tamper){assert.equal(status.reason,'accepted-artifact-verification-failed');assert.equal(status.result,null);}
   else{assert.equal(status.resultSha256,resultSha256);assert.deepEqual(status.result,result);}
   const repeat=await(await post(mf,requestFor(row.activities[1]))).json();assert.equal(repeat.jobId,initial.jobId);assert.equal(repeat.reused,true);assert.equal(repeat.state,status.state);assert.equal(acquisitions,1);
  }finally{await mf.dispose();}
 }
});

test('SQLite receipt survives restart, revised acceptance unblocks same operation, revocation fails closed and changed source creates new identity',async()=>{
 const {createHash}=await import('node:crypto');
 const {canonicalJSONString}=await import('../../server/fia/preparation/contract.mjs');
 const directory=await mkdtemp(join(tmpdir(),'fia-preparation-admission-'));
 let mf,fetches=0;
 const fixture=structuredClone(catalog),selected=fixture.entries[0];
 const request=()=>Object.fromEntries([...['packId','presentationRevision','language','edition','quality'].map(k=>[k,selected.selection[k]]),...Object.entries(selected.activities[0])]);
 let body;
 function admit(revision){
  const acceptanceSha256=revision.repeat(64),evidence={recordingLedgerSha256:'b'.repeat(64),timingSha256:'c'.repeat(64)};
  // Synthetic authority/ranges; no actual recording timing acceptance implied.
  const result={schema:'fia-prepared-audio@1',...selected.identity,source:selected.source,delivery:{...selected.source,mime:'audio/mpeg',quality:'original'},provenance:'official-recording',evidence:{acceptanceSha256,...evidence},activities:selected.activities.map((a,i)=>({...a,playbackRange:{startSeconds:i,endSeconds:i+0.5}}))};
  body=canonicalJSONString(result);const resultSha256=createHash('sha256').update(body).digest('hex');
  selected.accepted={path:`/content/prepared-audio/${resultSha256}.json`,bytes:Buffer.byteLength(body),expected:{resultSha256,acceptanceSha256,identity:selected.identity,source:selected.source,delivery:result.delivery,evidence,activities:selected.activities}};
  return resultSha256;
 }
 async function start(){
  const output=await build({stdin:{contents:`export {FiaPreparationJobs} from ${JSON.stringify(worker)};import {servePreparation} from ${JSON.stringify(worker)};export default {fetch:servePreparation};`,resolveDir:resolve('.')},bundle:true,format:'esm',platform:'browser',write:false,plugins:[{name:'synthetic-admission-revision',setup(b){b.onLoad({filter:/preparation\/catalog\.json$/},()=>({contents:JSON.stringify(fixture),loader:'json'}));}}]});
  mf=new Miniflare({...convertV4MiniflareOptions({modules:true,script:output.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{FIA_API_ORIGIN:origin},durableObjects:{FIA_PREPARATION_JOBS:{className:'FiaPreparationJobs',useSQLite:true}},serviceBindings:{ASSETS:()=>{fetches++;return new Response(body);}}}),resourcePersistencePath:directory});
 }
 async function stop(){await mf.dispose();mf=undefined;}
 async function settled(record){
  for(let i=0;i<100&&record.state==='preparing';i++){await new Promise(r=>setTimeout(r,10));record=await(await mf.dispatchFetch(origin+record.statusUrl)).json();}
  return record;
 }
 try{
  selected.accepted=null;await start();
  const blocked=await(await post(mf,request())).json();assert.equal(blocked.state,'blocked');assert.equal(fetches,0);await stop();
  const firstSha=admit('a');await start();
  const ready=await settled(await(await post(mf,request())).json());assert.equal(ready.jobId,blocked.jobId);assert.equal(ready.state,'ready');assert.equal(ready.resultSha256,firstSha);assert.equal(fetches,1);await stop();
  await start();const restored=await(await mf.dispatchFetch(origin+ready.statusUrl)).json();assert.equal(restored.state,'ready');assert.equal(restored.resultSha256,firstSha);
  assert.equal((await(await post(mf,request())).json()).state,'ready');assert.equal(fetches,1,'persisted ready receipt requires no second asset fetch');await stop();
  const secondSha=admit('d');assert.notEqual(secondSha,firstSha);await start();
  const stale=await(await mf.dispatchFetch(origin+ready.statusUrl)).json();assert.equal(stale.state,'blocked');assert.equal(stale.result,null);
  const revised=await settled(await(await post(mf,request())).json());assert.equal(revised.jobId,ready.jobId);assert.equal(revised.state,'ready');assert.equal(revised.resultSha256,secondSha);assert.equal(fetches,2);await stop();
  selected.accepted=null;await start();
  const revoked=await(await mf.dispatchFetch(origin+ready.statusUrl)).json();assert.equal(revoked.state,'blocked');assert.equal(revoked.result,null);assert.equal((await(await post(mf,request())).json()).state,'blocked');assert.equal(fetches,2);await stop();
  selected.identity.sourceVersion+='-changed';await start();
  const changed=await(await post(mf,request())).json();assert.notEqual(changed.jobId,ready.jobId);assert.equal(changed.state,'blocked');assert.equal((await mf.dispatchFetch(origin+ready.statusUrl)).status,404);assert.equal(fetches,2);
 }finally{if(mf)await mf.dispose();await rm(directory,{recursive:true,force:true});}
});
