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
 admittedArtifacts.set(row.accepted.path,body);return body;
}
async function runtime(catalog,directory,counters,{storage=true,r2=true,body='',wrongSource=false,offline=false,media=sourceBytes,artifacts=admittedArtifacts,assetGate=null,sourceGate=null,freshMedia=null,workerPath=worker}={}){
 const output=await build({stdin:{contents:`import catalog from ${JSON.stringify(fileURLToPath(new URL('../../server/fia/preparation/catalog.json',import.meta.url)))};import {stableOriginalIdentity} from ${JSON.stringify(fileURLToPath(new URL('../../server/fia/preparation/stable-original-coordinator.mjs',import.meta.url)))};import {operationId} from ${JSON.stringify(fileURLToPath(new URL('../../server/fia/preparation/service.mjs',import.meta.url)))};import {FiaPreparationJobs as Base,servePreparation} from ${JSON.stringify(workerPath)};export class FiaPreparationJobs extends Base {async fetch(r){if(['/test-seed-interrupted','/test-seed-job'].includes(new URL(r.url).pathname)){await this.ctx.storage.put('job',await r.json());if(new URL(r.url).pathname==='/test-seed-interrupted')await this.ctx.storage.put('source',{state:'attempting'});return new Response('seeded');}if(new URL(r.url).pathname==='/test-trigger-alarm'){await this.ctx.storage.setAlarm(Date.now()+1);return new Response('scheduled');}return super.fetch(r);}}export default {async fetch(r,e){const u=new URL(r.url);if(u.pathname==='/test-current'){const {index,revoked}=await r.json();for(let i=0;i<catalog.entries.length;i++){catalog.entries[i].coordinatorCurrent=i===index;if(revoked===i)catalog.entries[i].eligibility='revoked';}return new Response('changed');}if(u.pathname==='/test-internal'){const i=Number(u.searchParams.get('index')),row=catalog.entries[i],identity=await stableOriginalIdentity(row),id=await operationId(row);return e.FIA_PREPARATION_JOBS.get(e.FIA_PREPARATION_JOBS.idFromName(u.searchParams.has('wrong')?'wrong':identity.name)).fetch(new Request('https://preparation.internal/_stable-original/'+id+'/read'));}if(['/test-seed-interrupted','/test-seed-job','/test-trigger-alarm'].includes(new URL(r.url).pathname)){const ns=e.FIA_PREPARATION_JOBS;return ns.get(ns.idFromName(r.headers.get('x-job-id'))).fetch(r);}return await servePreparation(r,e)||new Response('missing',{status:404});}};`,resolveDir:resolve('.')},bundle:true,format:'esm',platform:'browser',external:['node:crypto'],write:false,plugins:[{name:'synthetic-catalog',setup(b){b.onLoad({filter:/preparation\/catalog\.json$/},()=>({contents:JSON.stringify(catalog),loader:'json'}));}}]});
 const row=catalog.entries[0];
 return new Miniflare({...convertV4MiniflareOptions({modules:true,script:output.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{FIA_API_ORIGIN:origin},...(storage?{durableObjects:{FIA_PREPARATION_JOBS:{className:'FiaPreparationJobs',useSQLite:true}}}:{}),...(r2?{r2Buckets:['FIA_ORIGINALS']}:{}),outboundService:async request=>{
  // This replaces ALL outbound network; unexpected requests never reach internet.
  if(request.url!==row.source.url||request.method!=='GET'){counters.unexpected++;return new Response('REFUSED',{status:403});}
  if(offline){counters.unexpected++;return new Response('OFFLINE',{status:503});}counters.source++;if(sourceGate)await sourceGate(request);return new Response(freshMedia?freshMedia(counters.source):wrongSource?Buffer.alloc(media.length,41):media,{headers:{'Content-Type':'audio/mpeg','Content-Length':String(media.length)}});
 },serviceBindings:{ASSETS:async request=>{const path=new URL(request.url).pathname;if(assetGate)await assetGate(path);if(artifacts.has(path)){counters.assets++;return new Response(artifacts.get(path));}if(!row.accepted||path!==row.accepted.path){counters.unexpected++;return new Response('REFUSED',{status:403});}counters.assets++;return new Response(body);}}}),resourcePersistencePath:directory});
}
async function settle(mf,record){for(let i=0;i<150&&record.state==='preparing';i++){await new Promise(r=>setTimeout(r,10));record=await(await mf.dispatchFetch(origin+record.statusUrl)).json();}return record;}
const counts=()=>({source:0,assets:0,unexpected:0});

function two(){const c=fixture(),a=c.entries[0];c.entries=[a];admit(a);a.coordinatorCurrent=true;const b=structuredClone(a);b.selection.presentationRevision='b'.repeat(64);b.identity.presentationRevision=b.selection.presentationRevision;b.scriptSha256='d'.repeat(64);b.coordinatorCurrent=false;admit(b,'b');c.entries.push(b);return {c,a,b};}
const change=(mf,index,revoked)=>mf.dispatchFetch(origin+'/test-current',{method:'POST',body:JSON.stringify({index,revoked})});
test('actual HTTP stable coordinator retains coherent old revision, isolates public IDs, and cold audio survives offline restart',async()=>{
 const {c,a,b}=two(),n=counts(),dir=await mkdtemp(join(tmpdir(),'fia-stable-'));let mf;
 try{
  mf=await runtime(c,dir,n);const old=await settle(mf,await(await post(mf,a)).json());assert.equal(old.state,'ready');assert.equal(n.source,1);
  const audio=origin+old.result.delivery.url;assert.equal((await mf.dispatchFetch(audio)).status,200);assert.equal((await mf.dispatchFetch(audio,{method:'HEAD'})).status,200);assert.equal((await mf.dispatchFetch(audio,{headers:{Range:'bytes=2-9'}})).status,206);
  await change(mf,1);const newer=await settle(mf,await(await post(mf,b)).json());assert.equal(newer.state,'ready');assert.notEqual(newer.jobId,old.jobId);assert.equal(n.source,2,'new admission performs actual fresh GET despite same retained bytes');
  assert.equal((await(await mf.dispatchFetch(origin+'/test-internal?index=0')).json()).servedSelection.presentationRevision,b.selection.presentationRevision);
  assert.equal((await mf.dispatchFetch(origin+'/test-internal?index=0&wrong')).status,403);
  await post(mf,a);assert.equal(n.source,2,'historical POST does not roll freshness back');
  c.entries[0].coordinatorCurrent=false;c.entries[1].coordinatorCurrent=true;await mf.dispose();mf=await runtime(c,dir,n,{offline:true,artifacts:new Map()});
  const warm=await(await mf.dispatchFetch(origin+newer.statusUrl)).json();assert.equal(warm.state,'ready');assert.equal(warm.resultSha256,b.accepted.expected.resultSha256);assert.equal(n.source,2);assert.equal(n.unexpected,0);
  await change(mf,1,1);assert.equal((await mf.dispatchFetch(origin+newer.statusUrl)).status,404);
 }finally{if(mf)await mf.dispose();await rm(dir,{recursive:true,force:true});}
});
test('failed replacement retains exact complete old snapshot internally and refuses mismatched public result',async()=>{
 const {c,a,b}=two(),n=counts(),artifacts=new Map(admittedArtifacts);artifacts.set(b.accepted.path,'bad');const mf=await runtime(c,undefined,n,{artifacts});
 try{const old=await settle(mf,await(await post(mf,a)).json());assert.equal(old.state,'ready');await change(mf,1);const next=await settle(mf,await(await post(mf,b)).json());assert.equal(next.state,'blocked');assert.equal(next.result,null);const retained=await(await mf.dispatchFetch(origin+'/test-internal?index=1')).json();assert.equal(retained.state,'ready');assert.deepEqual(retained.result,old.result);assert.equal(retained.resultSha256,old.resultSha256);assert.equal((await(await mf.dispatchFetch(origin+old.statusUrl)).json()).state,'ready');assert.equal(n.source,2);await post(mf,b);assert.equal(n.source,2);await post(mf,b);assert.equal(n.source,2);}
 finally{await mf.dispose();}
});
test('new cold job remains independently readable by frozen pre-coordinator runtime after rollback',async()=>{
 const c=fixture(),a=c.entries[0];admit(a);const n=counts(),dir=await mkdtemp(join(tmpdir(),'fia-rollback-'));let mf;
 try{mf=await runtime(c,dir,n);const ready=await settle(mf,await(await post(mf,a)).json());assert.equal(ready.state,'ready');assert.equal(ready.sourceState,'verified');await mf.dispose();mf=await runtime(c,dir,n,{offline:true,artifacts:new Map(),workerPath:fileURLToPath(new URL('./fixtures/worker-f61f045.mjs',import.meta.url))});assert.equal((await(await mf.dispatchFetch(origin+ready.statusUrl)).json()).state,'ready');assert.equal((await mf.dispatchFetch(origin+ready.result.delivery.url)).status,200);assert.deepEqual(n,{source:1,assets:4,unexpected:0});}
 finally{if(mf)await mf.dispose();await rm(dir,{recursive:true,force:true});}
});
test('same SHA audio selects verified stable original even when first admitted row has no public job',async()=>{
 const {c,a,b}=two();a.coordinatorCurrent=false;b.coordinatorCurrent=true;const n=counts(),mf=await runtime(c,undefined,n);
 try{const ready=await settle(mf,await(await post(mf,b)).json());assert.equal(ready.state,'ready');for(const options of [{},{method:'HEAD'},{headers:{Range:'bytes=1-9'}}])assert.ok((await mf.dispatchFetch(origin+ready.result.delivery.url,options)).ok);assert.equal(n.source,1);}
 finally{await mf.dispose();}
});
test('late evidence completion cannot promote after newer fresh head and desired attempt win',async()=>{
 const {c,a,b}=two(),n=counts();let release,entered;const gate=new Promise(r=>release=r),seen=new Promise(r=>entered=r);let held=false;
 const mf=await runtime(c,undefined,n,{assetGate:async path=>{if(path===a.accepted.path&&!held){held=true;entered();await gate;}}});
 try{const initial=await(await post(mf,a)).json();await seen;await change(mf,1);const newer=await settle(mf,await(await post(mf,b)).json());assert.equal(newer.state,'ready');release();const old=await settle(mf,initial);assert.equal(old.state,'blocked');assert.equal(old.result,null);const retained=await(await mf.dispatchFetch(origin+'/test-internal?index=0')).json();assert.equal(retained.resultSha256,b.accepted.expected.resultSha256);assert.equal(n.source,2);}
 finally{release();await mf.dispose();}
});
test('revocation during evidence verification blocks promotion, and ambiguous current or wrong unit never fetches',async()=>{
 const {c,a,b}=two(),n=counts();let release,entered;const gate=new Promise(r=>release=r),seen=new Promise(r=>entered=r);const mf=await runtime(c,undefined,n,{assetGate:async path=>{if(path===a.accepted.path){entered();await gate;}}});
 try{assert.equal((await post(mf,a,{...requestFor(a),sourceUnitId:'other'})).status,422);const first=await(await post(mf,a)).json();await seen;await change(mf,1,0);release();await settle(mf,first);const internal=await(await mf.dispatchFetch(origin+'/test-internal?index=1')).json();assert.notEqual(internal.state,'ready');assert.equal(n.source,1);}
 finally{release();await mf.dispose();}
});
test('concurrent same admission coalesces; a late older transfer cannot move the newer observation head',async()=>{
 const {c,a,b}=two(),n=counts();let release,entered;const gate=new Promise(r=>release=r),seen=new Promise(r=>entered=r);let calls=0;const mf=await runtime(c,undefined,n,{sourceGate:async()=>{if(++calls===1){entered();await gate;}}});
 try{const [one,two]=await Promise.all([post(mf,a),post(mf,a,requestFor(a,1))]);const first=await one.json();assert.equal((await two.json()).jobId,first.jobId);await seen;await change(mf,1);const newer=await settle(mf,await(await post(mf,b)).json());assert.equal(newer.state,'ready');release();await settle(mf,first);const head=await(await mf.dispatchFetch(origin+'/test-internal?index=1')).json();assert.equal(head.resultSha256,b.accepted.expected.resultSha256);assert.equal(n.source,2);await post(mf,a);assert.equal(n.source,2);}
 finally{release();await mf.dispose();}
});
test('changed observed bytes block unmatched reviewed pin while prior whole snapshot remains usable',async()=>{
 const {c,a,b}=two();const n=counts(),mf=await runtime(c,undefined,n,{freshMedia:count=>count===1?sourceBytes:Buffer.alloc(sourceBytes.length,7)});
 try{const first=await settle(mf,await(await post(mf,a)).json());assert.equal(first.state,'ready');await change(mf,1);const next=await settle(mf,await(await post(mf,b)).json());assert.equal(next.state,'blocked');assert.equal(next.result,null);const retained=await(await mf.dispatchFetch(origin+'/test-internal?index=1')).json();assert.deepEqual(retained.result,first.result);assert.equal((await(await mf.dispatchFetch(origin+first.statusUrl)).json()).state,'ready');assert.equal(n.source,2);await post(mf,b);assert.equal(n.source,2);}
 finally{await mf.dispose();}
});
test('retained old evidence plus current replacement with identical public operation ID chooses current admission',async()=>{
 const c=fixture(),a=c.entries[0];admit(a);a.coordinatorCurrent=true;const b=structuredClone(a);b.coordinatorCurrent=false;admit(b,'f');c.entries.push(b);const n=counts(),mf=await runtime(c,undefined,n);
 try{const first=await settle(mf,await(await post(mf,a)).json());assert.equal(first.state,'ready');await change(mf,1);const replacement=await settle(mf,await(await post(mf,b)).json());assert.equal(replacement.jobId,first.jobId);assert.equal(replacement.state,'ready');assert.equal(replacement.resultSha256,b.accepted.expected.resultSha256);assert.notEqual(replacement.resultSha256,first.resultSha256);assert.equal(n.source,2);assert.equal((await(await mf.dispatchFetch(origin+replacement.statusUrl)).json()).resultSha256,b.accepted.expected.resultSha256);await post(mf,a);assert.equal(n.source,2);}
 finally{await mf.dispose();}
});
test('ambiguous duplicate operation admissions refuse before creating a job or fetching',async()=>{
 const c=fixture(),a=c.entries[0];admit(a);const b=structuredClone(a);admit(b,'f');c.entries.push(b);const n=counts(),mf=await runtime(c,undefined,n);
 try{assert.equal((await post(mf,a)).status,422);assert.equal((await mf.dispatchFetch(origin+'/test-internal?index=0')).status,404);assert.deepEqual(n,counts());}
 finally{await mf.dispose();}
});
