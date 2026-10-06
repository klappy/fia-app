import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {canonicalJSONString} from '../../server/fia/preparation/contract.mjs';
// Local workerd/SQLite proof only. All source bytes, timing and authority synthetic.
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json'));
const {build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const worker=fileURLToPath(new URL('../../server/fia/preparation/worker.mjs',import.meta.url));
const template=JSON.parse(await readFile(new URL('../../server/fia/preparation/catalog.json',import.meta.url),'utf8'));
const origin='https://dev.fiaguide.app',hash=b=>createHash('sha256').update(b).digest('hex');
const sourceBytes=Buffer.alloc(70003,42); // Bounded synthetic original, not actual publisher media.
const fixture=()=>{const c=structuredClone(template),r=c.entries[0];r.source={url:'https://source.fixture.invalid/original.mp3',sha256:hash(sourceBytes),bytes:sourceBytes.length,duration:58.2936875};r.accepted=null;r.blockedReason="recording-timing-review-required";return c;};
const requestFor=(row,n=0)=>Object.fromEntries([...['packId','presentationRevision','language','edition','quality'].map(k=>[k,row.selection[k]]),...Object.entries(row.activities[n])]);
const post=(mf,row,body=requestFor(row),headers={})=>mf.dispatchFetch(origin+'/v1/preparations',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
const admittedArtifacts=new Map();
function admit(row,revision='a'){
 const activities=row.activities.map((a,i)=>({...a,playbackRange:{startSeconds:i,endSeconds:i+0.5}}));
 const ledger={schema:'fia-prepared-recording-ledger@1',identity:row.identity,source:row.source,scriptSha256:row.scriptSha256,unitsSha256:row.unitsSha256,clockDomain:'decoded-pcm',mappings:activities,sourceReviewSha256:revision.repeat(64)};
 const timing={schema:'fia-original-audio-timing@1',sourceClockDomain:'decoded-pcm',mapping:{offsetSeconds:0,scale:1},sourceAudioSha256:row.source.sha256,deliveryAudioSha256:row.source.sha256,sourceBytes:row.source.bytes,deliveryBytes:row.source.bytes,deliveryDuration:row.source.duration,independentReviewSha256:'c'.repeat(64)};
 const evidence={recordingLedgerSha256:hash(canonicalJSONString(ledger)),timingSha256:hash(canonicalJSONString(timing))};
 const acceptance={schema:'fia-prepared-audio-evidence-acceptance@1',identity:row.identity,source:row.source,activities,...evidence,sourceReviewSha256:ledger.sourceReviewSha256,clockReviewSha256:timing.independentReviewSha256,scope:'Synthetic control-flow fixture only.'};
 const acceptanceSha256=hash(canonicalJSONString(acceptance));
 for(const doc of [ledger,timing,acceptance]){const bytes=canonicalJSONString(doc);admittedArtifacts.set('/content/prepared-audio-evidence/'+hash(bytes)+'.json',bytes);}
 const result={schema:'fia-prepared-audio@1',...row.identity,source:row.source,delivery:{...row.source,url:`/v1/preparation-audio/${row.source.sha256}.mp3`,mime:'audio/mpeg',quality:'original'},provenance:'official-recording',evidence:{acceptanceSha256,...evidence},activities:row.activities.map((a,i)=>({...a,playbackRange:{startSeconds:i,endSeconds:i+0.5}}))};
 const body=canonicalJSONString(result),resultSha256=hash(body);
 row.accepted={path:`/content/prepared-audio/${resultSha256}.json`,bytes:Buffer.byteLength(body),expected:{resultSha256,acceptanceSha256,identity:row.identity,source:row.source,delivery:result.delivery,evidence,activities:row.activities}};
 return body;
}
async function runtime(catalog,directory,counters,{storage=true,r2=true,body='',wrongSource=false,offline=false,media=sourceBytes,artifacts=admittedArtifacts}={}){
 const output=await build({stdin:{contents:`import {FiaPreparationJobs as Base,servePreparation} from ${JSON.stringify(worker)};export class FiaPreparationJobs extends Base {async fetch(r){if(['/test-seed-interrupted','/test-seed-job'].includes(new URL(r.url).pathname)){await this.ctx.storage.put('job',await r.json());if(new URL(r.url).pathname==='/test-seed-interrupted')await this.ctx.storage.put('source',{state:'attempting'});return new Response('seeded');}if(new URL(r.url).pathname==='/test-trigger-alarm'){await this.ctx.storage.setAlarm(Date.now()+1);return new Response('scheduled');}return super.fetch(r);}}export default {async fetch(r,e){if(['/test-seed-interrupted','/test-seed-job','/test-trigger-alarm'].includes(new URL(r.url).pathname)){const ns=e.FIA_PREPARATION_JOBS;return ns.get(ns.idFromName(r.headers.get('x-job-id'))).fetch(r);}return await servePreparation(r,e)||new Response('missing',{status:404});}};`,resolveDir:resolve('.')},bundle:true,format:'esm',platform:'browser',external:['node:crypto'],write:false,plugins:[{name:'synthetic-catalog',setup(b){b.onLoad({filter:/preparation\/catalog\.json$/},()=>({contents:JSON.stringify(catalog),loader:'json'}));}}]});
 const row=catalog.entries[0];
 return new Miniflare({...convertV4MiniflareOptions({modules:true,script:output.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{FIA_API_ORIGIN:origin},...(storage?{durableObjects:{FIA_PREPARATION_JOBS:{className:'FiaPreparationJobs',useSQLite:true}}}:{}),...(r2?{r2Buckets:['FIA_ORIGINALS']}:{}),outboundService:request=>{
  // This replaces ALL outbound network; unexpected requests never reach internet.
  if(request.url!==row.source.url||request.method!=='GET'){counters.unexpected++;return new Response('REFUSED',{status:403});}
  if(offline){counters.unexpected++;return new Response('OFFLINE',{status:503});}counters.source++;return new Response(wrongSource?Buffer.alloc(media.length,41):media,{headers:{'Content-Type':'audio/mpeg','Content-Length':String(media.length)}});
 },serviceBindings:{ASSETS:request=>{const path=new URL(request.url).pathname;if(artifacts.has(path)){counters.assets++;return new Response(artifacts.get(path));}if(!row.accepted||path!==row.accepted.path){counters.unexpected++;return new Response('REFUSED',{status:403});}counters.assets++;return new Response(body);}}}),resourcePersistencePath:directory});
}
async function settle(mf,record){for(let i=0;i<150&&record.state==='preparing';i++){await new Promise(r=>setTimeout(r,10));record=await(await mf.dispatchFetch(origin+record.statusUrl)).json();}return record;}
const counts=()=>({source:0,assets:0,unexpected:0});

test('invalid requests are rejected before DO/network; all outbound traffic is mocked',async()=>{
 const c=fixture(),r=c.entries[0],n=counts(),mf=await runtime(c,undefined,n,{storage:false});
 try{
  assert.equal((await post(mf,r)).status,503);
  assert.equal((await post(mf,r,{...requestFor(r),packId:'unknown'})).status,422);
  assert.equal((await post(mf,r,{...requestFor(r),operator:'alias'})).status,422);
  assert.equal((await post(mf,r,requestFor(r),{Origin:'https://other.invalid'})).status,403);
  assert.equal((await post(mf,r,'{')).status,400);assert.equal((await post(mf,r,'x'.repeat(4097))).status,413);
  assert.equal((await mf.dispatchFetch(origin+'/v1/preparations/'+'f'.repeat(64))).status,404);
  assert.deepEqual(n,counts());
 }finally{await mf.dispose();}
});

test('source alarm verifies once; R2 restart reuses originals and serves verified full/HEAD/range bytes',async()=>{
 const c=fixture(),r=c.entries[0],n=counts(),dir=await mkdtemp(join(tmpdir(),'fia-source-'));let mf;
 try{
  mf=await runtime(c,dir,n);const responses=await Promise.all([post(mf,r),post(mf,r,requestFor(r,1))]);
  assert.deepEqual(responses.map(x=>x.status).sort(),[200,201]);const records=await Promise.all(responses.map(x=>x.json()));assert.equal(records[0].jobId,records[1].jobId);
  const done=await settle(mf,records[0]);assert.equal(done.state,'blocked');assert.equal(done.sourceState,'verified');assert.equal(n.source,1);assert.equal(n.assets,0);
  await mf.dispose();mf=await runtime(c,dir,n,{offline:true});
  assert.equal((await(await post(mf,r)).json()).sourceState,'verified');assert.equal(n.source,1);
  const path=origin+`/v1/preparation-audio/${r.source.sha256}.mp3`;
  const full=await mf.dispatchFetch(path);assert.equal(full.status,200);assert.equal(full.headers.get('cache-control'),'no-store');assert.equal(hash(Buffer.from(await full.arrayBuffer())),r.source.sha256);
  const head=await mf.dispatchFetch(path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(sourceBytes.length));assert.equal((await head.arrayBuffer()).byteLength,0);
  const part=await mf.dispatchFetch(path,{headers:{Range:'bytes=65530-65550'}});assert.equal(part.status,206);assert.equal(part.headers.get('content-range'),`bytes 65530-65550/${sourceBytes.length}`);assert.deepEqual(Buffer.from(await part.arrayBuffer()),sourceBytes.subarray(65530,65551));
  assert.equal((await mf.dispatchFetch(path,{headers:{Range:'bytes=999999-'}})).status,416);
  const bucket=await mf.getR2Bucket('FIA_ORIGINALS');await bucket.put(`originals/sha256/${r.source.sha256}.mp3`,Buffer.alloc(sourceBytes.length,0));
  const corruptStatus=await mf.dispatchFetch(origin+done.statusUrl);assert.equal(corruptStatus.status,503);assert.equal((await corruptStatus.json()).code,'stored-source-invalid');
  for(const options of [{},{method:'HEAD'},{headers:{Range:'bytes=0-2'}}])assert.equal((await mf.dispatchFetch(path,options)).status,409,'corrupt R2 object never serves partial bytes');
  assert.equal(n.source,1);assert.equal(n.unexpected,0);
 }finally{if(mf)await mf.dispose();await rm(dir,{recursive:true,force:true});}
});

test('ready receipt survives restart; changed acceptance unblocks same operation; revocation and changed source fail closed',async()=>{
 const c=fixture(),r=c.entries[0],n=counts(),dir=await mkdtemp(join(tmpdir(),'fia-admission-'));let mf;
 try{
  mf=await runtime(c,dir,n);const blocked=await settle(mf,await(await post(mf,r)).json());await mf.dispose();
  let body=admit(r);mf=await runtime(c,dir,n,{body});const ready=await settle(mf,await(await post(mf,r)).json());assert.equal(ready.jobId,blocked.jobId);assert.equal(ready.state,'ready');assert.equal(n.source,2);assert.equal(n.assets,4);await mf.dispose();
  mf=await runtime(c,dir,n,{body});assert.equal((await(await mf.dispatchFetch(origin+ready.statusUrl)).json()).state,'ready');assert.equal((await(await post(mf,r)).json()).state,'ready');assert.equal(n.source,2);assert.equal(n.assets,4);await mf.dispose();
  body=admit(r,'d');mf=await runtime(c,dir,n,{body});assert.equal((await(await mf.dispatchFetch(origin+ready.statusUrl)).json()).state,'blocked');const revised=await settle(mf,await(await post(mf,r)).json());assert.equal(revised.jobId,ready.jobId);assert.equal(revised.state,'ready');assert.equal(n.source,3);assert.equal(n.assets,7);await mf.dispose();
  r.accepted=null;mf=await runtime(c,dir,n);const revoked=await(await post(mf,r)).json();assert.equal(revoked.state,'blocked');assert.equal(revoked.result,null);await mf.dispose();
  r.identity.sourceVersion+='-new';mf=await runtime(c,dir,n);const changed=await settle(mf,await(await post(mf,r)).json());assert.notEqual(changed.jobId,ready.jobId);assert.equal(n.source,3,'new version reuses verified original SHA');assert.equal((await mf.dispatchFetch(origin+ready.statusUrl)).status,404);assert.equal(n.unexpected,0);
 }finally{if(mf)await mf.dispose();await rm(dir,{recursive:true,force:true});}
});

test('wrong source hash cannot become verified or playable and repeat does not blindly fetch again',async()=>{
 const c=fixture(),r=c.entries[0],n=counts(),mf=await runtime(c,undefined,n,{body:admit(r),wrongSource:true});
 try{
  const failed=await settle(mf,await(await post(mf,r)).json());assert.equal(failed.state,'blocked');assert.notEqual(failed.sourceState,'verified');assert.equal(failed.result,null);assert.equal(n.source,1);assert.equal(n.assets,0);
  assert.equal((await mf.dispatchFetch(origin+`/v1/preparation-audio/${r.source.sha256}.mp3`)).status,409);
  await post(mf,r);assert.equal(n.source,1);assert.equal(n.unexpected,0);
 }finally{await mf.dispose();}
});

test('persisted started source attempt survives restart and blocks uncertain without another acquisition',async()=>{
 const {operationId}=await import('../../server/fia/preparation/service.mjs');
 const c=fixture(),r=c.entries[0],n=counts(),dir=await mkdtemp(join(tmpdir(),'fia-interrupted-'));let mf;
 const id=await operationId(r),statusUrl='/v1/preparations/'+id;
 try{
  mf=await runtime(c,dir,n);
  const seed={schema:'fia-preparation-job@1',jobId:id,selection:r.selection,state:'preparing',sourceState:'queued',reason:null,result:null,resultSha256:null,admissionSha256:null};
  assert.equal((await mf.dispatchFetch(origin+'/test-seed-interrupted',{method:'POST',headers:{'x-job-id':id},body:JSON.stringify(seed)})).status,200);
  await mf.dispose();mf=await runtime(c,dir,n);
  assert.equal((await(await mf.dispatchFetch(origin+statusUrl)).json()).state,'preparing');
  await mf.dispatchFetch(origin+'/test-trigger-alarm',{headers:{'x-job-id':id}});
  const interrupted=await settle(mf,{state:'preparing',statusUrl});assert.equal(interrupted.state,'blocked');assert.equal(interrupted.sourceState,'uncertain');assert.equal(interrupted.reason,'source-attempt-interrupted');assert.equal(interrupted.result,null);
  assert.equal((await(await post(mf,r)).json()).state,'blocked');assert.deepEqual(n,counts());
 }finally{if(mf)await mf.dispose();await rm(dir,{recursive:true,force:true});}
});


test('missing R2 binding fails before source acquisition',async()=>{
 const c=fixture(),n=counts(),mf=await runtime(c,undefined,n,{r2:false});
 try{assert.equal((await post(mf,c.entries[0])).status,503);assert.deepEqual(n,counts());}finally{await mf.dispose();}
});


test('interrupted DO attempt reconciles verified existing R2 bytes without upstream access',async()=>{
 const {operationId}=await import('../../server/fia/preparation/service.mjs');
 const c=fixture(),r=c.entries[0],n=counts(),dir=await mkdtemp(join(tmpdir(),'fia-r2-recovery-'));let mf;
 const id=await operationId(r),statusUrl='/v1/preparations/'+id;
 try{
  mf=await runtime(c,dir,n,{offline:true});
  const bucket=await mf.getR2Bucket('FIA_ORIGINALS');await bucket.put(`originals/sha256/${r.source.sha256}.mp3`,sourceBytes);
  const seed={schema:'fia-preparation-job@1',jobId:id,selection:r.selection,state:'preparing',sourceState:'queued',reason:null,result:null,resultSha256:null,admissionSha256:null};
  await mf.dispatchFetch(origin+'/test-seed-interrupted',{method:'POST',headers:{'x-job-id':id},body:JSON.stringify(seed)});
  await mf.dispose();mf=await runtime(c,dir,n,{offline:true});
  await mf.dispatchFetch(origin+'/test-trigger-alarm',{headers:{'x-job-id':id}});
  const recovered=await settle(mf,{state:'preparing',statusUrl});assert.equal(recovered.sourceState,'verified');assert.equal(recovered.state,'blocked');assert.equal(recovered.reason,r.blockedReason);assert.deepEqual(n,counts());
 }finally{if(mf)await mf.dispose();await rm(dir,{recursive:true,force:true});}
});

test('orphan R2 bytes require ensure receipt and source reference; corrupt reference refuses status and audio',async()=>{
 const c=fixture(),r=c.entries[0],n=counts(),mf=await runtime(c,undefined,n,{offline:true});
 const path=origin+`/v1/preparation-audio/${r.source.sha256}.mp3`;
 try{
  const bucket=await mf.getR2Bucket('FIA_ORIGINALS');await bucket.put(`originals/sha256/${r.source.sha256}.mp3`,sourceBytes);
  for(const options of [{},{method:'HEAD'},{headers:{Range:'bytes=0-2'}}])assert.equal((await mf.dispatchFetch(path,options)).status,409,'orphan bytes have no accepted DO receipt/reference');
  assert.deepEqual(n,counts());
  const prepared=await settle(mf,await(await post(mf,r)).json());assert.equal(prepared.sourceState,'verified');assert.equal(prepared.state,'blocked');assert.deepEqual(n,counts());
  const audio=await mf.dispatchFetch(path);assert.equal(audio.status,200);assert.equal(hash(Buffer.from(await audio.arrayBuffer())),r.source.sha256);
  const referenceId=hash(canonicalJSONString({url:r.source.url,sourceVersion:r.identity.sourceVersion}));
  const referenceKey=`originals/refs/${referenceId}/${r.source.sha256}.json`;
  assert.notEqual(await bucket.get(referenceKey),null,'ensure recorded exact source reference');
  await bucket.put(referenceKey,'corrupt-reference');
  const status=await mf.dispatchFetch(origin+prepared.statusUrl);assert.equal(status.status,503);assert.equal((await status.json()).code,'stored-source-invalid');
  for(const options of [{},{method:'HEAD'},{headers:{Range:'bytes=0-2'}}])assert.equal((await mf.dispatchFetch(path,options)).status,409);
  assert.deepEqual(n,counts());
 }finally{await mf.dispose();}
});

test('real retained P2 passes public cold alarm and offline warm status with all evidence reverified',{skip:!process.env.FIA_RETAINED_P2},async()=>{
 const c=structuredClone(template),r=c.entries[0],n=counts(),dir=await mkdtemp(join(tmpdir(),'fia-reviewed-real-'));
 const media=await readFile(process.env.FIA_RETAINED_P2),e=r.accepted.expected;
 assert.equal(hash(media),r.source.sha256);assert.equal(media.length,r.source.bytes);
 const body=await readFile(new URL('../../apps/web/public'+r.accepted.path,import.meta.url)),artifacts=new Map();
 for(const sha of [e.evidence.recordingLedgerSha256,e.evidence.timingSha256,e.acceptanceSha256]){
  const path=`/content/prepared-audio-evidence/${sha}.json`;artifacts.set(path,await readFile(new URL('../../apps/web/public'+path,import.meta.url)));
 }
 let mf;
 const rejectWrong=async()=>{
  for(const field of ['activityId','sourceUnitId','sourceTextSha256','packId','language','presentationRevision'])assert.equal((await post(mf,r,{...requestFor(r),[field]:'wrong'})).status,422,field);
 };
 try{
  mf=await runtime(c,dir,n,{media,body,artifacts});await rejectWrong();assert.deepEqual(n,counts());
  const ready=await settle(mf,await(await post(mf,r)).json());assert.equal(ready.state,'ready');assert.equal(ready.resultSha256,e.resultSha256);assert.equal(ready.result.activities.length,8);
  assert.deepEqual(n,{source:1,assets:4,unexpected:0});
  const bucket=await mf.getR2Bucket('FIA_ORIGINALS');
  assert.equal((await bucket.list({prefix:'reviewed-original/evidence/'})).objects.length,4);
  await mf.dispose();mf=await runtime(c,dir,n,{offline:true,artifacts:new Map()});
  for(let i=0;i<8;i++){const warm=await(await post(mf,r,requestFor(r,i))).json();assert.equal(warm.state,'ready');assert.equal(warm.resultSha256,e.resultSha256);}
  await rejectWrong();assert.deepEqual(n,{source:1,assets:4,unexpected:0});
  const audio=await mf.dispatchFetch(origin+ready.result.delivery.url);assert.equal(audio.status,200);assert.equal(hash(Buffer.from(await audio.arrayBuffer())),r.source.sha256);
  const reopened=await mf.getR2Bucket('FIA_ORIGINALS');await reopened.put(`reviewed-original/evidence/${e.evidence.timingSha256}.json`,'corrupt');
  const rejected=await mf.dispatchFetch(origin+ready.statusUrl);assert.equal(rejected.status,200);const blocked=await rejected.json();assert.equal(blocked.state,'blocked');assert.equal(blocked.reason,'stable-evidence-unavailable');assert.equal(blocked.result,null);assert.equal(blocked.resultSha256,null);
  assert.deepEqual(n,{source:1,assets:4,unexpected:0});
 }finally{if(mf)await mf.dispose();await rm(dir,{recursive:true,force:true});}
});

test('changed presentation uses separate public operation and never pairs retained old audio with new text',async()=>{
 const c=fixture(),r=c.entries[0],n=counts(),dir=await mkdtemp(join(tmpdir(),'fia-revision-boundary-'));let mf;
 try{
  const body=admit(r);mf=await runtime(c,dir,n,{body});const old=await settle(mf,await(await post(mf,r)).json());assert.equal(old.state,'ready');await mf.dispose();
  r.selection.presentationRevision='d'.repeat(64);r.identity.presentationRevision='d'.repeat(64);
  r.activities[0].sourceTextSha256='e'.repeat(64);r.scriptSha256='f'.repeat(64);r.accepted=null;
  mf=await runtime(c,dir,n,{offline:true});
  const current=await settle(mf,await(await post(mf,r)).json());assert.notEqual(current.jobId,old.jobId);
  assert.equal(current.state,'blocked');assert.equal(current.result,null);assert.equal((await mf.dispatchFetch(origin+old.statusUrl)).status,404);
  assert.deepEqual(n,{source:1,assets:4,unexpected:0});
 }finally{if(mf)await mf.dispose();await rm(dir,{recursive:true,force:true});}
});

test('legacy receipt without reviewed snapshot cannot upgrade offline by relabeling cached bytes as fresh',async()=>{
 const c=fixture(),r=c.entries[0],n=counts(),dir=await mkdtemp(join(tmpdir(),'fia-reviewed-upgrade-'));let mf;
 try{
  mf=await runtime(c,dir,n);const prior=await settle(mf,await(await post(mf,r)).json());await mf.dispose();
  const body=admit(r);mf=await runtime(c,dir,n,{body,offline:true});
  const legacy={schema:'fia-preparation-job@1',jobId:prior.jobId,selection:r.selection,state:'ready',sourceState:'verified',reason:null,result:JSON.parse(body),resultSerialized:body,resultSha256:r.accepted.expected.resultSha256,admissionSha256:r.accepted.expected.resultSha256};
  await mf.dispatchFetch(origin+'/test-seed-job',{method:'POST',headers:{'x-job-id':prior.jobId},body:JSON.stringify(legacy)});
  const before=await(await mf.dispatchFetch(origin+prior.statusUrl)).json();assert.equal(before.state,'blocked');assert.equal(before.result,null);
  const upgraded=await settle(mf,await(await post(mf,r)).json());assert.equal(upgraded.state,'blocked');assert.equal(upgraded.jobId,prior.jobId);
  assert.deepEqual(n,{source:1,assets:0,unexpected:1});
 }finally{if(mf)await mf.dispose();await rm(dir,{recursive:true,force:true});}
});
