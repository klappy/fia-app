import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json')),{Miniflare,convertV4MiniflareOptions}=require('miniflare'),{build}=require('esbuild');
const modulePath=fileURLToPath(new URL('../../server/fia/preparation/executor/known-source-stream.mjs',import.meta.url));
const worker=`import {createKnownSourceAcquisition,KNOWN_SOURCE_POLICY} from ${JSON.stringify(modulePath)};import {createHash} from 'node:crypto';
export class Job {constructor(ctx,env){this.ctx=ctx;this.env=env;this.gets=0;}async fetch(request){const args=await request.json(),size=args.size||5135362;const hash=createHash('sha256');for(let n=0;n<size;n+=65536)hash.update(new Uint8Array(Math.min(65536,size-n)).fill(97));const policy={policy:KNOWN_SOURCE_POLICY,url:args.local?'https://openbible.com/audio/souer/BSB_41_Mrk_001.mp3':'https://publisher.invalid/original.mp3',sourceVersion:'trusted-fixture-v1',sha256:args.local?'ad82d1a49f696a421f87a0ba54e7079c35fb403462c1e2e335a1fabe515363ec':args.digest||hash.digest('hex'),bytes:size};let controller=new AbortController();const actual=this.env.BUCKET,bucket={get:(...a)=>actual.get(...a),put:async(key,body,options)=>{if(args.interruptPublication&&key.startsWith('originals/refs/'))controller.abort(Error('publication-interrupted'));if(args.race&&key.startsWith('originals/sha256/')){const staging=(await actual.list({prefix:'originals/quarantine/'})).objects[0];await actual.put(key,args.race==='corrupt'?new Uint8Array([1,2,3]):(await actual.get(staging.key)).body,{onlyIf:{etagDoesNotMatch:'*'}});}return actual.put(key,body,options);}};const task=createKnownSourceAcquisition({bucket,storage:this.ctx.storage,policy,totalMs:args.timeout||5000,progressMs:args.progress||1000,fetchSource:async(url,options)=>{this.gets++;if(args.offline)throw Error('offline');if(args.local)return new Response((await actual.get('fixture/source')).body,{headers:{'content-type':'audio/mpeg'}});if(options.redirect!=='manual')throw Error('redirect-policy');let offset=0;const target=size+(args.extra||0),body=new ReadableStream({async pull(c){if(args.slow)await new Promise(r=>setTimeout(r,5));if(args.stall)return new Promise(()=>{});if(args.abort){controller.abort(Error('caller-aborted'));return;}if(offset===target){c.close();return;}const bytes=new Uint8Array(Math.min(65536,target-offset)).fill(args.badBytes?98:97);offset+=bytes.length;c.enqueue(bytes);},cancel(){}});const headers={'content-type':args.mime||'audio/mpeg'};if(args.length!==null)headers['content-length']=String(args.length??size);return new Response(body,{status:args.status||200,headers});}});
try{const result=await task.acquire(controller.signal);return Response.json({result,gets:this.gets,objects:(await this.env.BUCKET.list()).objects.map(x=>x.key)});}catch(error){return Response.json({error:error.message,status:await task.status(),gets:this.gets,objects:(await this.env.BUCKET.list()).objects.map(x=>x.key)});}}
}
export default{fetch(request,env){if(new URL(request.url).pathname==='/seed')return env.BUCKET.put('fixture/source',request.body).then(()=>new Response('ok'));return env.JOBS.get(env.JOBS.idFromName(new URL(request.url).pathname)).fetch(request);}};`;
const bundle=await build({stdin:{contents:worker,resolveDir:resolve('.')},bundle:true,format:'esm',platform:'browser',external:['node:crypto'],write:false});
function runtime(path){return new Miniflare({...convertV4MiniflareOptions({name:'known-stream-fixture',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],durableObjects:{JOBS:{className:'Job',useSQLite:true}},r2Buckets:['BUCKET']}),resourcePersistencePath:path});}
const call=(mf,key,args={})=>mf.dispatchFetch('https://fixture.invalid/'+key,{method:'POST',body:JSON.stringify(args)}).then(r=>r.json());
test('actual R2 streams >2MiB and cap; missing length accepted by actual pin; warm/restart use zero publisher requests',async t=>{const directory=await mkdtemp(join(tmpdir(),'known-stream-'));t.after(()=>rm(directory,{recursive:true,force:true}));let mf=runtime(directory);try{for(const [key,size] of [['large',5135362],['cap',8*1024*1024]]){const first=await call(mf,key,{size,length:null});assert.equal(first.result?.state,'completed',JSON.stringify(first));assert.equal(first.result.measurement.maxInputChunkBytes,65536);assert.equal(first.gets,1);const warm=await call(mf,key,{size,offline:true});assert.equal(warm.result?.state,'completed');assert.equal(warm.gets,1);}await mf.dispose();mf=runtime(directory);const warm=await call(mf,'large',{offline:true});assert.equal(warm.result.state,'completed');assert.equal(warm.gets,0);}finally{await mf.dispose();}});
test('actual R2 refuses false length, cap+1, MIME, redirect, wrong digest, stall and abort without completed receipt',async t=>{const directory=await mkdtemp(join(tmpdir(),'known-refuse-'));t.after(()=>rm(directory,{recursive:true,force:true}));const mf=runtime(directory);try{for(const [key,args] of Object.entries({falseLength:{length:1},excess:{size:8*1024*1024,extra:1,length:null},mime:{mime:'text/plain'},redirect:{status:302},digest:{badBytes:true},stall:{stall:true,progress:20},slow:{slow:true,timeout:25,progress:20},short:{extra:-1,length:null},abort:{abort:true}})){const r=await call(mf,key,args);assert.ok(r.error,key+JSON.stringify(r));assert.equal(r.status.state,'uncertain',key);assert.ok(!r.objects.some(k=>k.startsWith('originals/known-acquisitions/')),key);const repeat=await call(mf,key,args);assert.equal(repeat.result.state,'uncertain');assert.equal(repeat.gets,1);}}finally{await mf.dispose();}});

test('actual SQLite concurrent demand owns one transfer and interrupted publication stays uncertain',async t=>{const directory=await mkdtemp(join(tmpdir(),'known-race-'));t.after(()=>rm(directory,{recursive:true,force:true}));const mf=runtime(directory);try{const results=await Promise.all([call(mf,'same',{slow:true}),call(mf,'same',{slow:true})]);assert.ok(results.some(r=>r.result?.state==='completed'));assert.ok(results.every(r=>Number.isInteger(r.gets)&&r.gets>=0&&r.gets<=1),JSON.stringify(results));const settled=await call(mf,'same',{offline:true});assert.equal(settled.result.state,'completed');assert.equal(settled.gets,1);const interrupted=await call(mf,'interrupted',{size:5135361,interruptPublication:true});assert.equal(interrupted.status.state,'uncertain');assert.equal((await call(mf,'interrupted',{size:5135361,offline:true})).result.state,'uncertain');}finally{await mf.dispose();}});
test('actual R2 create-only race verifies winner and never overwrites corrupt winner',async t=>{for(const race of ['valid','corrupt']){const directory=await mkdtemp(join(tmpdir(),'known-winner-'));t.after(()=>rm(directory,{recursive:true,force:true}));const mf=runtime(directory);try{const result=await call(mf,'winner',{race});if(race==='valid')assert.equal(result.result?.state,'completed',JSON.stringify(result));else{assert.equal(result.status.state,'uncertain');const bucket=await mf.getR2Bucket('BUCKET'),objects=(await bucket.list({prefix:'originals/sha256/'})).objects;assert.equal(objects.length,1);assert.equal(objects[0].size,3);const warm=await call(mf,'other',{offline:true});assert.equal(warm.gets,0);assert.equal(warm.status.state,'uncertain');}}finally{await mf.dispose();}}});
test('actual R2 retained BSB local fixture streams exact known bytes without a publisher request',{skip:!process.env.FIA_RETAINED_BSB},async t=>{const bytes=await readFile(process.env.FIA_RETAINED_BSB);assert.equal(bytes.length,5135362);assert.equal(createHash('sha256').update(bytes).digest('hex'),'ad82d1a49f696a421f87a0ba54e7079c35fb403462c1e2e335a1fabe515363ec');const directory=await mkdtemp(join(tmpdir(),'known-bsb-'));t.after(()=>rm(directory,{recursive:true,force:true}));let mf=runtime(directory);try{await mf.dispatchFetch('https://fixture.invalid/seed',{method:'POST',body:bytes});const result=await call(mf,'bsb',{local:true});assert.equal(result.result?.state,'completed',JSON.stringify(result));assert.equal(result.result.artifact.sha256,'ad82d1a49f696a421f87a0ba54e7079c35fb403462c1e2e335a1fabe515363ec');await mf.dispose();mf=runtime(directory);assert.equal((await call(mf,'bsb',{local:true,offline:true})).gets,0);}finally{await mf.dispose();}});

test('stalled retained stream with unresolved cancellation still returns within the progress deadline',async()=>{
 const {createKnownSourceAcquisition,KNOWN_SOURCE_POLICY}=await import('../../server/fia/preparation/executor/known-source-stream.mjs');const rows=new Map(),storage={get:async key=>rows.get(key),put:async(key,value)=>rows.set(key,value),transaction(fn){return fn(this);}};let cancelled=0;
 const task=createKnownSourceAcquisition({storage,bucket:{get:async()=>({size:3,body:new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled++;return new Promise(()=>{});}})})},policy:{policy:KNOWN_SOURCE_POLICY,url:'https://publisher.invalid/original.mp3',sourceVersion:'v1',sha256:'a'.repeat(64),bytes:3},progressMs:10,totalMs:100,fetchSource:()=>{throw Error('must-not-fetch');}});
 let timer;try{await assert.rejects(Promise.race([task.acquire(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('cleanup-hung')),250);})]),/acquisition-progress-timeout/);}finally{clearTimeout(timer);}assert.equal(cancelled,1);assert.equal((await task.status()).state,'uncertain');
});

// Deliberately replay every callback with the first storage writes rolled back.
// External effects are not rolled back by a transaction, so this catches the
// real duplicate-fetch / consumed-stream failure without relying on contention.
async function replayAcquisition({beforeReplay=()=>{},afterPut=()=>{},abortAfterFence=false}={}){
 const {createKnownSourceAcquisition,KNOWN_SOURCE_POLICY}=await import('../../server/fia/preparation/executor/known-source-stream.mjs');
 const rows=new Map(),objects=new Map(),puts=new Map(),controller=new AbortController();let inside=false,transactions=0,gets=0,publisherChunks=0;
 const storage={get:async key=>structuredClone(rows.get(key)),async transaction(callback){
  const number=++transactions;let result;
  for(let replay=0;replay<2;replay++){
   const draft=new Map(structuredClone([...rows]));inside=true;
   try{result=await callback({get:async key=>structuredClone(draft.get(key)),put:async(key,value)=>draft.set(key,structuredClone(value))});}finally{inside=false;}
   if(!replay)beforeReplay({number,rows});else{rows.clear();for(const [k,v] of draft)rows.set(k,v);}
  }
  if(abortAfterFence&&number===2)controller.abort(Error('fence-completion-aborted'));
  return result;
 }};
 const bytes=new Uint8Array([97,98,99]),digest=createHash('sha256').update(bytes).digest('hex');
 const bucket={async get(key){const value=objects.get(key);return value?{size:value.length,body:new Response(value.slice()).body}:null;},async put(key,body){
  assert.equal(inside,false,'bucket I/O must not run in a replayable callback');puts.set(key,(puts.get(key)||0)+1);
  const value=body instanceof Uint8Array?body.slice():new Uint8Array(await new Response(body).arrayBuffer());
  if(!objects.has(key))objects.set(key,value);afterPut({key,rows});return {};
 }};
 const task=createKnownSourceAcquisition({storage,bucket,policy:{policy:KNOWN_SOURCE_POLICY,url:'https://publisher.invalid/replayed.mp3',sourceVersion:'replay-fixture-v1',sha256:digest,bytes:bytes.length},makeStream:()=>new TransformStream(),totalMs:1000,progressMs:100,fetchSource:async()=>{
  assert.equal(inside,false,'publisher I/O must not run in a replayable callback');gets++;
  return new Response(new ReadableStream({start(c){publisherChunks++;c.enqueue(bytes.slice());c.close();}}),{headers:{'content-type':'audio/mpeg','content-length':'3'}});
 }});
 let result,error;try{result=await task.acquire(controller.signal);}catch(e){error=e;}
 return {task,result,error,rows,objects,puts,get gets(){return gets;},publisherChunks,transactions};
}
function replaceAttempt(rows){for(const [key,row] of rows){const attemptId=crypto.randomUUID();rows.set(key,{...row,attemptId,quarantineKey:row.quarantineKey.replace(row.attemptId,attemptId)});}}
test('replayed storage callbacks cause exactly one publisher GET and one consumption per upload',async()=>{
 const run=await replayAcquisition();assert.ifError(run.error);assert.equal(run.result.state,'completed');assert.equal(run.gets,1);assert.equal(run.publisherChunks,1);
 assert.equal(run.puts.size,4);assert.ok([...run.puts.values()].every(n=>n===1));assert.ok(run.transactions>4);
 assert.equal((await run.task.acquire()).state,'completed');assert.equal(run.gets,1);
});
test('a replay observing a replaced attempt prevents publisher access and never marks successor uncertain',async()=>{
 const run=await replayAcquisition({beforeReplay:({number,rows})=>{if(number===2)replaceAttempt(rows);}});
 assert.match(run.error?.message,/acquisition-fence/);assert.equal(run.gets,0);assert.equal(run.puts.size,0);assert.equal([...run.rows.values()][0].state,'preparing');
});
test('late external receipt write cannot complete a replaced attempt or trigger automatic retry',async()=>{
 const run=await replayAcquisition({afterPut:({key,rows})=>{if(key.startsWith('originals/known-acquisitions/'))replaceAttempt(rows);}});
 assert.match(run.error?.message,/acquisition-fence/);assert.equal(run.gets,1);assert.equal([...run.rows.values()][0].state,'preparing');
 assert.equal((await run.task.acquire()).state,'preparing');assert.equal(run.gets,1);assert.ok([...run.puts.values()].every(n=>n===1));
});
test('abort immediately after a successful fence prevents external fetch',async()=>{
 const run=await replayAcquisition({abortAfterFence:true});assert.match(run.error?.message,/fence-completion-aborted/);assert.equal(run.gets,0);assert.equal(run.puts.size,0);assert.equal([...run.rows.values()][0].state,'uncertain');
});

test('revision replacement during quarantine write prevents measurement and publication',async()=>{
 const run=await replayAcquisition({afterPut:({key,rows})=>{if(key.startsWith('originals/quarantine/'))for(const [id,row] of rows)rows.set(id,{...row,revision:row.revision+1});}});
 assert.match(run.error?.message,/acquisition-fence/);assert.equal(run.gets,1);const successor=[...run.rows.values()][0];assert.equal(successor.revision,2);assert.equal(successor.state,'preparing');assert.equal(successor.measurement,undefined);assert.ok(![...run.objects.keys()].some(key=>key.startsWith('originals/sha256/')||key.startsWith('originals/known-acquisitions/')));
});
