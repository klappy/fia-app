import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {mkdtemp,readFile,readdir,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createBoundedSourceReader} from '../../server/fia/preparation/executor/observed-stream-acquisition.mjs';
import {createLocalWindowAdapter} from '../../server/fia/preparation/executor/local-window-adapter.mjs';
const required=['FIA_RETAINED_P2','FIA_WINDOW_PYTHON','FIA_WINDOW_MODEL','FIA_WINDOW_RUNTIME_MANIFEST'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const worker=`import {createObservedStreamAcquisition} from ${JSON.stringify(resolve('server/fia/preparation/executor/observed-stream-acquisition.mjs'))};
import {canonicalJSONString,sha256} from ${JSON.stringify(resolve('server/fia/preparation/contract.mjs'))};
export class Job { constructor(ctx,env){this.ctx=ctx;this.env=env;} async fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/revoke'){await this.ctx.storage.put('revoked',true);return new Response('revoked');}
 if(await this.ctx.storage.get('revoked'))return new Response('lease-revoked',{status:403});
 const input={packId:'fixture',book:'MRK',language:'eng',edition:'fia-guide',passage:'P2',resource:'S01',source:{publisherId:'fia-guide',resourceId:'S01',version:'fixture'}};
 const discovery={schema:'fia-source-discovery@1',metadataSha256:'a'.repeat(64),source:{...input.source,url:'https://s3.amazonaws.com/cbbt-er.public/pericopes/p2.mp3'},selection:Object.fromEntries(['book','language','edition','passage','resource'].map(k=>[k,input[k]]))};
 const encoded=new TextEncoder().encode(canonicalJSONString(discovery)),digest=await sha256(encoded),descriptor={sha256:digest,reference:'preparation/discovery/'+digest+'.json'};
 await this.env.R2.put(descriptor.reference,encoded);
 const adapter=await createObservedStreamAcquisition({storage:this.ctx.storage,bucket:this.env.R2,validatePublisherURL:async u=>u===discovery.source.url,eligibility:()=>true,policy:{revision:'retained-p2-stream-decode@1',maxBytes:2097152,totalMs:30000,progressMs:15000},fetchSource:(u,o)=>this.env.SOURCE.fetch(new Request(u,o))});
 const args={input,nodeOutputs:{discover:descriptor}};
 if(path==='/acquire')await adapter.run(args);
 return Response.json(await adapter.verifySource(args));
 }} export default {fetch(r,e){return e.JOBS.get(e.JOBS.idFromName('p2')).fetch(r)}};`;

test('actual R2 producer to private spool to PyAV: restart reuse and final lease revocation before decoder', {skip:required.some(k=>!process.env[k])},async()=>{
 const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json')),{build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
 const dir=await mkdtemp(join(tmpdir(),'fia-stream-decode-')),workDirectory=join(dir,'decode');await mkdir(workDirectory);
 const sourceBytes=await readFile(process.env.FIA_RETAINED_P2);assert.equal(hash(sourceBytes),'0f3fa9e77215f5050f9e22b7abee329c47e0e9ff71a5f0c4d248926a8f42268d');
 const bundle=await build({stdin:{contents:worker,resolveDir:resolve('.')},bundle:true,format:'esm',platform:'browser',external:['node:*'],write:false});
 let sourceFetches=0,decoderInvocations=0,mf,finalVerification=false;
 const options={...convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2025-09-01',compatibilityFlags:['nodejs_compat'],durableObjects:{JOBS:{className:'Job',useSQLite:true}},r2Buckets:['R2'],serviceBindings:{SOURCE:async()=>{sourceFetches++;return new Response(sourceBytes,{headers:{'Content-Type':'audio/mpeg','Content-Length':String(sourceBytes.length)}});}},outboundService:()=>{throw Error('No network');}}),resourcePersistencePath:join(dir,'storage')};
 const scriptPath=resolve('server/fia/preparation/executor/local-window-runtime.py'),scriptSha256=hash(await readFile(scriptPath));
 const adapter=await createLocalWindowAdapter({pythonPath:process.env.FIA_WINDOW_PYTHON,scriptPath,scriptSha256,modelDirectory:process.env.FIA_WINDOW_MODEL,modelId:'Systran/faster-whisper-tiny.en',modelManifestSha256:'60a1e73109aa75058f81191da437d3fa4ea57f1127bef81d4500e242988ad16d',runtimeManifest:JSON.parse(await readFile(process.env.FIA_WINDOW_RUNTIME_MANIFEST)),workDirectory,spawnProcess:(...args)=>{assert(finalVerification,'producer verification must precede decoder');decoderInvocations++;return spawn(...args);}});
 async function request(path){const r=await mf.dispatchFetch('https://fixture.invalid'+path);const text=await r.text();if(!r.ok)throw Error(text);return JSON.parse(text);}
 async function producer(source,{revokeAtEOF=false}={}){
  const bucket=await mf.getR2Bucket('R2');let chunks=0,maxChunk=0,eof=false;
  const reader=createBoundedSourceReader({bucket:{async get(key){const object=await bucket.get(key),raw=object.body.getReader();return {size:object.size,body:new ReadableStream({async pull(c){const part=await raw.read();if(part.done){eof=true;if(revokeAtEOF){const r=await mf.dispatchFetch('https://fixture.invalid/revoke');await r.text();}c.close();}else c.enqueue(part.value);},cancel:r=>raw.cancel(r)},{highWaterMark:0})};}},guard:async d=>assert.deepEqual(await request('/verify'),d)});
  return {openSource:async(d,opts)=>{const opened=await reader.openSource(d,opts);return {...opened,verified:opened.verified.then(()=>{assert(eof);finalVerification=true;}),stream:opened.stream.pipeThrough(new TransformStream({transform(chunk,c){chunks++;maxChunk=Math.max(maxChunk,chunk.length);c.enqueue(chunk);}}))};},stats:()=>({chunks,maxChunk})};
 }
 try{
  mf=new Miniflare(options);const source=await request('/acquire');assert.equal(sourceFetches,1);
  const records=[];
  for(let run=0;run<2;run++){
   if(run){await mf.dispose();mf=new Miniflare(options);assert.deepEqual(await request('/acquire'),source);}
   finalVerification=false;const p=await producer(source),decoded=await adapter.decodeStream({source,openSource:p.openSource});
   assert.equal(decoded.receipt.totalSamples,932699);assert.equal(decoded.receipt.pcmSha256,'6bc33b633108b305fe4f93aa838bb34c128db50ad8cfcd118c1ad417fee63cc8');assert(p.stats().maxChunk<=65536);records.push({decoder:decoded.receipt,...p.stats()});await decoded.dispose();assert.deepEqual(await readdir(workDirectory),[]);
  }
  assert.equal(sourceFetches,1);assert.equal(decoderInvocations,2);
  finalVerification=false;const revoked=await producer(source,{revokeAtEOF:true});await assert.rejects(adapter.decodeStream({source,openSource:revoked.openSource}),/lease-revoked/);assert.equal(finalVerification,false);assert.equal(decoderInvocations,2);assert.deepEqual(await readdir(workDirectory),[]);
  const receipt={status:'PASS',source,scriptSha256,sourceFetches,decoderInvocations,modelInvocations:0,records,finalLeaseRevocation:'refused-before-decoder',scope:'Actual retained P2 acquisition/SQLite/R2, reviewed bounded producer, private spool, PyAV decode; fresh acquisition adapter on every guard, cold process restart reuses source. Direct port composition, not full dispatcher/model execution.'};
  if(process.env.FIA_WINDOW_PROOF_DIR){await mkdir(process.env.FIA_WINDOW_PROOF_DIR,{recursive:true});await writeFile(join(process.env.FIA_WINDOW_PROOF_DIR,'stream-decode-storage.json'),JSON.stringify(receipt,null,2));}
 }finally{await mf?.dispose();await rm(dir,{recursive:true,force:true});}
});
