import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdtemp,rm} from 'node:fs/promises';import {readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';import {deflateSync,crc32} from 'node:zlib';import {createHash} from 'node:crypto';
import {visualOriginalIdentity,VISUAL_ORIGINAL_POLICY,VISUAL_ORIGINAL_RECIPE,VISUAL_ORIGINAL_RECIPE_SHA256} from '../../server/fia/preparation/visual-original.mjs';
import {createFreshSourceObservations,AUDIO_CONTENT,VISUAL_CONTENT} from '../../server/fia/preparation/executor/fresh-source-observation.mjs';
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json')),{Miniflare,convertV4MiniflareOptions}=require('miniflare'),{build}=require('esbuild');
// Fixtures: a real 2x2 RGB PNG built here, and real JPEG/PNG files made by ImageMagick (fixtures/visual); no publisher is contacted.
function chunk(type,data){const body=Buffer.concat([Buffer.from(type,'ascii'),data]),out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);body.copy(out,4);out.writeUInt32BE(crc32(body)>>>0,8+data.length);return out;}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(2,0);ihdr.writeUInt32BE(2,4);ihdr[8]=8;ihdr[9]=2;
const PNG=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.from([0,200,30,40,200,30,40,0,10,20,30,10,20,30]))),chunk('IEND',Buffer.alloc(0))]);
const fixtureFile=name=>readFileSync(new URL(`./fixtures/visual/${name}`,import.meta.url));
const JPEG=fixtureFile('baseline-37x23.jpg'),INTERLACED=fixtureFile('interlaced-16x16.png');
// The 2x2 PNG's unfiltered scanlines, hashed independently of the decoder.
const PNG_PIXELS='200,30,40,200,30,40,10,20,30,10,20,30';
const sha=x=>createHash('sha256').update(x).digest('hex');
const modulePath=fileURLToPath(new URL('../../server/fia/preparation/visual-original.mjs',import.meta.url));
const worker=`import {createVisualOriginalJob} from ${JSON.stringify(modulePath)};
const fixtures=${JSON.stringify({png:PNG.toString('base64'),jpeg:JPEG.toString('base64'),interlaced:INTERLACED.toString('base64')})};
const decode=b=>Uint8Array.from(atob(b),c=>c.charCodeAt(0));
export class Job {constructor(ctx,env){this.ctx=ctx;this.env=env;this.gets=0;this.decodes=0;this.gates=[];this.readGates=[];
  // Counts decodes: only the decode readback calls arrayBuffer() on a retained object (custody verifies by streaming the body).
  const self=this,raw=env.ORIGINALS;this.bucket=new Proxy(raw,{get(t,p){if(p==='get')return async(...a)=>{const o=await t.get(...a);return o&&new Proxy(o,{get(ot,op){if(op==='arrayBuffer')return async()=>{if(self.holdReads)await new Promise(r=>self.readGates.push(r));if(self.failNext){self.failNext=false;self.decodes++;await new Promise(r=>setTimeout(r,50));throw Error('r2-readback-down');}self.decodes++;return ot.arrayBuffer();};const v=ot[op];return typeof v==='function'?v.bind(ot):v;}});};const v=t[p];return typeof v==='function'?v.bind(t):v;}});}
 async fetch(request){const args=await request.json();if(args.op==='holdReads'){this.holdReads=true;return Response.json({ok:1});}if(args.op==='releaseReads'){this.holdReads=false;for(const r of this.readGates.splice(0))r();return Response.json({ok:1});}if(args.op==='heldReads')return Response.json({held:this.readGates.length});if(args.op==='armFail'){this.failNext=true;return Response.json({armed:true});}if(args.op==='dropDecode'){const rows=await this.ctx.storage.list({prefix:'visual-original:decode:'});for(const k of rows.keys())await this.ctx.storage.delete(k);this.decodes=0;return Response.json({dropped:rows.size});}if(args.op==='corruptDecode'){const rows=await this.ctx.storage.list({prefix:'visual-original:decode:'});for(const [k,v] of rows){const next={...v,...args.patch};for(const d of args.drop||[])delete next[d];await this.ctx.storage.put(k,next);}return Response.json({patched:rows.size});}if(args.op==='corrupt'){for(const o of (await this.env.ORIGINALS.list({prefix:'originals/visual/sha256/'})).objects)await this.env.ORIGINALS.put(o.key,new Uint8Array(o.size).fill(1));return Response.json({corrupted:true});}if(args.op==='counts')return Response.json({gets:this.gets,waiting:this.gates.length});if(args.op==='release'){for(const r of this.gates.splice(0))r();return Response.json({released:true});}
  const source={kind:args.kind||'map',url:args.url||'https://publisher.invalid/maps/c4.png',sourceVersion:'fixture-revision-1'};
  try{const job=createVisualOriginalJob({storage:this.ctx.storage,bucket:this.bucket,source,eligibility:c=>!args.ineligible&&!(args.badHash&&c.observedContent?.sha256===args.badHash),now:()=>1000,fetchSource:async(url,options)=>{this.gets++;if(args.fail)throw null;if(options.redirect!=='manual')throw Error('wrong-redirect');if(args.gate)await new Promise(r=>this.gates.push(r));
    if(args.redirect)return new Response(null,{status:302,headers:{location:'https://elsewhere.invalid/x.png'}});if(args.httpStatus)return new Response('no',{status:args.httpStatus,headers:{'content-type':'text/plain','content-length':'2'}});
    const bytes=args.body?decode(args.body):args.size?new Uint8Array(args.size).fill(7).map((v,i)=>i<8?[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a][i]:v):decode(fixtures[args.fixture||'png']);
    const headers={'content-type':args.mime||'image/png'};if(!args.noLength)headers['content-length']=String(args.length??bytes.length);
    let sent=false;const cuts=args.split?[0,...args.split,bytes.length]:null;return new Response(new ReadableStream({pull(c){if(sent){c.close();return;}sent=true;if(cuts){for(let i=0;i<cuts.length-1;i++)c.enqueue(bytes.slice(cuts[i],cuts[i+1]));return;}for(let n=0;n<bytes.length;n+=65536)c.enqueue(bytes.slice(n,n+65536));}}),{status:200,headers});}});
   const result=args.op==='read'?await job.read():await job.demand({...(args.aborted?{signal:AbortSignal.abort()}:{}),...(args.retry?{retry:true}:{})});
   const objects=(await this.env.ORIGINALS.list()).objects;return Response.json({result,gets:this.gets,decodes:this.decodes,objects:objects.map(o=>o.key),rows:[...(await this.ctx.storage.list()).keys()]});}catch(error){return Response.json({error:error.message,gets:this.gets});}}
}
export default {fetch(request,env){const name=new URL(request.url).pathname.slice(1)||'one';return env.JOBS.get(env.JOBS.idFromName(name)).fetch(request);}};`;
const bundle=await build({stdin:{contents:worker,resolveDir:resolve('.')},bundle:true,format:'esm',platform:'browser',external:['node:crypto','node:zlib'],write:false});
async function fixture(t){const directory=await mkdtemp(join(tmpdir(),'visual-original-'));const mf=new Miniflare({...convertV4MiniflareOptions({name:'visual-original-fixture',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],durableObjects:{JOBS:{className:'Job',useSQLite:true}},r2Buckets:['ORIGINALS']}),resourcePersistencePath:directory});t.after(async()=>{await mf.dispose();await rm(directory,{recursive:true,force:true});});return mf;}
const call=(mf,args={},object='one')=>mf.dispatchFetch(`https://fixture.invalid/${object}`,{method:'POST',body:JSON.stringify(args)}).then(r=>r.json());

test('visual policy fits c4 and the largest map inside the primitive ceiling without touching the audio cap',()=>{
 assert.ok(VISUAL_ORIGINAL_POLICY.maxBytes>=5092889&&VISUAL_ORIGINAL_POLICY.maxBytes>=7889557&&VISUAL_ORIGINAL_POLICY.maxBytes<=16777216);
 assert.deepEqual(Object.keys(VISUAL_CONTENT.types),['image/jpeg','image/png']);assert.deepEqual(Object.keys(AUDIO_CONTENT.types),['audio/mpeg']);
 assert.throws(()=>createFreshSourceObservations({content:{...VISUAL_CONTENT}}),/fresh-capability/);
});
test('identity is per source, shared across packs and languages, and refuses query or non-https sources',async()=>{
 const a=await visualOriginalIdentity({kind:'map',url:'https://publisher.invalid/maps/c4.png',sourceVersion:'r1'});
 assert.match(a.name,/^visual-original@1:[a-f0-9]{64}$/);assert.equal((await visualOriginalIdentity({sourceVersion:'r1',url:'https://publisher.invalid/maps/c4.png',kind:'map'})).name,a.name);
 assert.notEqual((await visualOriginalIdentity({kind:'map',url:'https://publisher.invalid/maps/c5.png',sourceVersion:'r1'})).name,a.name);
 for(const bad of [{kind:'map',url:'https://publisher.invalid/c4.png?x=1',sourceVersion:'r1'},{kind:'map',url:'http://publisher.invalid/c4.png',sourceVersion:'r1'},{kind:'video',url:'https://publisher.invalid/c4.png',sourceVersion:'r1'},{kind:'map',url:'https://publisher.invalid/c4.png',sourceVersion:'r1',packId:'eng.MRK-1-14-20'}])await assert.rejects(visualOriginalIdentity(bad),/visual-source/);
});
test('fixture PNG is fetched once, stored content-addressed, read back and fully decoded to ready',async t=>{
 const mf=await fixture(t),first=await call(mf);assert.equal(first.gets,1,JSON.stringify(first));
 const r=first.result;assert.equal(r.state,'ready',JSON.stringify(r));assert.equal(r.custody,'retained');assert.deepEqual(r.recipe,JSON.parse(JSON.stringify(VISUAL_ORIGINAL_RECIPE)));assert.equal(r.recipeSha256,VISUAL_ORIGINAL_RECIPE_SHA256);
 assert.deepEqual(r.decode,{state:'ready',reason:null,subReason:null,decoder:JSON.parse(JSON.stringify(VISUAL_ORIGINAL_RECIPE.decoder['image/png'])),width:2,height:2,pixelsSha256:sha(Buffer.from(PNG_PIXELS.split(',').map(Number)))});
 assert.ok(!first.objects.some(k=>/pixel|decoded/.test(k)),'decoded pixels are never stored');
 assert.equal(r.original.sha256,sha(PNG));assert.equal(r.original.bytes,PNG.length);assert.equal(r.original.contentType,'image/png');assert.equal(r.original.sourceKey,`originals/visual/sha256/${sha(PNG)}.png`);
 assert.ok(first.objects.includes(r.original.sourceKey));assert.ok(first.objects.some(k=>/^originals\/quarantine\/checks\/[a-f0-9]{64}\/[-a-f0-9]{36}\.bin$/.test(k)));assert.ok(first.objects.some(k=>k.startsWith('originals/observations/')));assert.ok(!first.objects.some(k=>k.endsWith('.mp3')));
 const again=await call(mf);assert.equal(again.gets,1,'repeat fetches nothing');assert.deepEqual(again.result,r);
 const read=await call(mf,{op:'read'});assert.equal(read.gets,1,'read fetches nothing');assert.deepEqual(read.result,r);
});
test('fixture JPEG is stored with a .jpg key and its own MIME, and decodes through EOI to its dimensions',async t=>{
 const mf=await fixture(t),out=await call(mf,{fixture:'jpeg',mime:'image/jpeg',kind:'photo',url:'https://publisher.invalid/a1400/1000.jpg'});
 assert.equal(out.result.custody,'retained',JSON.stringify(out));assert.equal(out.result.original.contentType,'image/jpeg');assert.equal(out.result.original.sourceKey,`originals/visual/sha256/${sha(JPEG)}.jpg`);
 assert.equal(out.result.state,'ready');assert.equal(out.result.decode.width,37);assert.equal(out.result.decode.height,23);assert.equal(out.result.decode.decoder.name,'jpeg-js');assert.equal(out.result.decode.decoder.version,'0.4.4');assert.match(out.result.decode.pixelsSha256,/^[a-f0-9]{64}$/);
});
test('a retained interlaced PNG is a final visual-unsupported decode-not-streamable, kept with 0 refetches and 0 re-decodes',async t=>{
 const mf=await fixture(t),out=await call(mf,{fixture:'interlaced'});
 assert.equal(out.result.state,'unavailable',JSON.stringify(out));assert.equal(out.result.reason,'visual-unsupported');assert.equal(out.result.subReason,'decode-not-streamable');assert.equal(out.result.final,true);assert.equal(out.result.custody,'retained');assert.equal(out.result.decode.width,null);
 const again=await call(mf,{fixture:'interlaced'});assert.equal(again.gets,1);assert.deepEqual(again.result,out.result);
});
test('a kept ready verdict is never returned over corrupted retained bytes: the read is retained-evidence-unavailable, with no refetch',async t=>{
 const mf=await fixture(t),first=await call(mf);assert.equal(first.result.state,'ready');
 const repeat=await call(mf,{op:'read'});assert.deepEqual(repeat.result,first.result,'a repeat read returns the kept verdict');
 await call(mf,{op:'corrupt'});const read=await call(mf,{op:'read'});assert.equal(read.gets,1);
 assert.equal(read.result.state,'unavailable');assert.equal(read.result.reason,'retained-evidence-unavailable');assert.equal(read.result.final,false);assert.equal(read.result.custody,'unverified');assert.notEqual(read.result.decode.state,'ready');
});
test('two demands at once fetch once and the joiner sees preparing',async t=>{
 const mf=await fixture(t),first=call(mf,{gate:true});for(let n=0;n<200&&(await call(mf,{op:'counts'})).waiting<1;n++)await new Promise(r=>setTimeout(r,5));
 const joined=await call(mf,{gate:true});assert.equal(joined.result.state,'preparing');assert.equal(joined.gets,1);
 await call(mf,{op:'release'});const done=await first;assert.equal(done.result.custody,'retained');assert.equal(done.gets,1);
});
test('a Retry after a decoded ready fetches 0 and decodes 0, returning the kept verdict',async t=>{
 const mf=await fixture(t),first=await call(mf);assert.equal(first.result.state,'ready');assert.equal(first.gets,1);assert.equal(first.decodes,1);
 const retried=await call(mf,{retry:true});assert.equal(retried.gets,1,'Retry fetches nothing');assert.equal(retried.decodes,1,'Retry decodes nothing');assert.deepEqual(retried.result,first.result);
 const again=await call(mf,{retry:true});assert.equal(again.gets,1);assert.equal(again.decodes,1);assert.deepEqual(again.result,first.result);
});
test('a large PNG with corrupt zlib is a kept final visual-unsupported png-zlib-invalid; read and Retry fetch 0 and decode 0',async t=>{
 // 1024x1024 noise, one IDAT with a bad zlib header: large enough that the zlib error arrives while the writer waits on 'drain'.
 const w=1024,h=1024,rows=Buffer.alloc(h*(1+w*3));for(let i=0;i<rows.length;i+=32)createHash('sha256').update('j'+i).digest().copy(rows,i);for(let y=0;y<h;y++)rows[y*(1+w*3)]=0;
 const z=Buffer.from(deflateSync(rows,{level:1}));z[0]=0x78;z[1]=0x00;
 const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;
 const bad=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ih),chunk('IDAT',z),chunk('IEND',Buffer.alloc(0))]).toString('base64');
 const mf=await fixture(t),first=await call(mf,{body:bad});
 assert.equal(first.result.state,'unavailable',JSON.stringify(first.result));assert.equal(first.result.reason,'visual-unsupported');assert.equal(first.result.subReason,'png-zlib-invalid');assert.equal(first.result.final,true);assert.equal(first.result.custody,'retained');assert.equal(first.gets,1);assert.equal(first.decodes,1);
 const read=await call(mf,{op:'read'});assert.equal(read.gets,1);assert.equal(read.decodes,1);assert.deepEqual(read.result,first.result);
 const retried=await call(mf,{body:bad,retry:true});assert.equal(retried.gets,1,'Retry fetches nothing');assert.equal(retried.decodes,1,'Retry decodes nothing');assert.deepEqual(retried.result,first.result);
});
test('4408596866: a kept decode row with valid identity but malformed evidence fails closed, never ready',async t=>{
 for(const [patch,drop] of [[{width:null},[]],[{},['pixelsSha256']],[{state:'ready',final:false},[]],[{decoder:{name:'other',version:'9'}},[]],[{width:2.5},[]],[{extra:1},[]],[{state:'unavailable',reason:'visual-unsupported',subReason:'x'},[]]]){
  const mf=await fixture(t),first=await call(mf);assert.equal(first.result.state,'ready');
  const n=await call(mf,{op:'corruptDecode',patch,drop});assert.equal(n.patched,1);
  for(const op of ['read',undefined]){const out=await call(mf,op?{op}:{});assert.notEqual(out.result.state,'ready',JSON.stringify({patch,drop,out:out.result}));assert.equal(out.result.reason,'retained-evidence-unavailable');assert.equal(out.result.subReason,'visual-decode-record-corrupt');assert.equal(out.result.final,false);assert.equal(out.gets,1);}
 }
});
test('4408649050: concurrent first decodes coalesce: N callers give exactly 1 readback and 1 decode, and the same verdict',async t=>{
 // Large enough (1024x1024 noise, about 3 MiB) that a decode spans many awaits, so request interleaving is real.
 const w=1024,h=1024,rows=Buffer.alloc(h*(1+w*3));for(let i=0;i<rows.length;i+=32)createHash('sha256').update('c'+i).digest().copy(rows,i);for(let y=0;y<h;y++)rows[y*(1+w*3)]=0;
 const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;const big=(z)=>Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ih),chunk('IDAT',z),chunk('IEND',Buffer.alloc(0))]).toString('base64');
 const good=big(deflateSync(rows,{level:1})),badZ=Buffer.from(deflateSync(rows,{level:1}));badZ[2]|=0x06;const bad=big(badZ);
 for(const body of [good,bad]){
  const mf=await fixture(t),first=await call(mf,{body});assert.equal(first.decodes,1);
  // Custody retained, decode row gone: the state a burst of first demands meets before the first decode row is written.
  // Every request constructs its own createVisualOriginalJob instance inside the DO handler, so the callers are separate factory
  // instances sharing one durable source identity; the large decode spans many awaits, so their interleaving is real.
  assert.equal((await call(mf,{op:'dropDecode'})).dropped,1);
  // Deterministic interleaving: hold every readback, issue the burst, let every caller reach its decode step, then release.
  await call(mf,{op:'holdReads'});const pending=[...Array(6)].map((_,i)=>call(mf,i%2?{op:'read'}:{body}));
  for(let n=0;n<300&&(await call(mf,{op:'heldReads'})).held<1;n++)await new Promise(r=>setTimeout(r,10));
  await new Promise(r=>setTimeout(r,300));assert.equal((await call(mf,{op:'heldReads'})).held,1,'exactly one readback is in flight; the others joined it');
  await call(mf,{op:'releaseReads'});const outs=await Promise.all(pending);
  const counts=await call(mf,{op:'read'});assert.equal(counts.decodes,1,`decodes after the burst: ${counts.decodes}`);assert.equal(counts.gets,1);
  for(const o of outs)assert.deepEqual(o.result,first.result);
 }
});
test('4408649050: a failed in-flight decode is non-final for every joined caller, and a later demand recovers it',async t=>{
 const mf=await fixture(t),first=await call(mf);assert.equal(first.result.state,'ready');
 await call(mf,{op:'dropDecode'});await call(mf,{op:'armFail'});
 // Each request below constructs its own job instance (the DO handler pattern); all join the one in-flight decode.
 const outs=await Promise.all([...Array(4)].map(()=>call(mf)));
 for(const o of outs){assert.equal(o.result.state,'unavailable',JSON.stringify(o.result));assert.equal(o.result.reason,'retained-evidence-unavailable');assert.equal(o.result.final,false);}
 assert.equal((await call(mf,{op:'counts'})).waiting,0);
 const later=await call(mf);assert.equal(later.result.state,'ready');assert.deepEqual(later.result,first.result);assert.equal(later.gets,1);assert.equal(later.decodes,2,'one failed attempt, then one recovering decode');
});
test('the in-flight decode gate never crosses source identity or Durable Object: identical bytes from two sources each decode once',async t=>{
 // One DO per source identity (the job marker binds it); two identities with identical bytes, in one isolate.
 const mf=await fixture(t),a={url:'https://publisher.invalid/maps/a.png'},b={url:'https://publisher.invalid/maps/b.png'};
 for(const [object,args] of [['one',a],['two',b]]){const r=await call(mf,args,object);assert.equal(r.result.state,'ready',JSON.stringify(r));}
 for(const object of ['one','two']){await call(mf,{op:'dropDecode'},object);await call(mf,{op:'holdReads'},object);}
 const pending=[call(mf,a,'one'),call(mf,{op:'read',...a},'one'),call(mf,b,'two'),call(mf,{op:'read',...b},'two')];
 const held=async o=>(await call(mf,{op:'heldReads'},o)).held;
 for(let n=0;n<300&&((await held('one'))<1||(await held('two'))<1);n++)await new Promise(r=>setTimeout(r,10));
 await new Promise(r=>setTimeout(r,200));
 assert.equal(await held('one'),1,'source a decodes once in its own DO');assert.equal(await held('two'),1,'source b decodes once in its own DO, never joining a');
 for(const object of ['one','two'])await call(mf,{op:'releaseReads'},object);
 const outs=await Promise.all(pending);for(const o of outs)assert.equal(o.result.state,'ready',JSON.stringify(o.result));
 assert.notEqual(outs[0].result.sourceIdentitySha256,outs[2].result.sourceIdentitySha256);assert.equal(outs[0].result.original.sha256,outs[2].result.original.sha256);
});
test('a Retry after a final visual-unsupported decode fetches 0 and decodes 0, and never overrides the verdict',async t=>{
 const mf=await fixture(t),first=await call(mf,{fixture:'interlaced'});assert.equal(first.result.reason,'visual-unsupported');assert.equal(first.result.subReason,'decode-not-streamable');assert.equal(first.result.final,true);assert.equal(first.decodes,1);
 const retried=await call(mf,{fixture:'interlaced',retry:true});assert.equal(retried.gets,1);assert.equal(retried.decodes,1);assert.deepEqual(retried.result,first.result);
});
for(const [name,args,reason] of [
 ['wrong MIME',{mime:'audio/mpeg'},'fresh-response-refused'],
 ['unlisted image MIME',{mime:'image/webp'},'fresh-response-refused'],
 ['signature mismatch (PNG bytes declared JPEG)',{mime:'image/jpeg'},'fresh-signature-mismatch'],
 ['signature mismatch (JPEG bytes declared PNG)',{fixture:'jpeg',mime:'image/png'},'fresh-signature-mismatch'],
 ['too short for a signature',{body:Buffer.from([0x89,0x50]).toString('base64')},'fresh-signature-mismatch'],
 ['declared oversize',{size:16,length:VISUAL_ORIGINAL_POLICY.maxBytes+1},'fresh-known-length-required'],
 ['actual oversize past cap',{size:VISUAL_ORIGINAL_POLICY.maxBytes+1,length:VISUAL_ORIGINAL_POLICY.maxBytes},'fresh-byte-limit'],
 ['missing length',{noLength:true},'fresh-known-length-required'],
 ['redirect',{redirect:true},'fresh-response-refused'],
])test(`fails closed: ${name}`,async t=>{
 const mf=await fixture(t),out=await call(mf,args);assert.equal(out.result.state,'unavailable',JSON.stringify(out));assert.equal(out.result.reason,'visual-unsupported');assert.equal(out.result.subReason,reason);assert.equal(out.result.final,true);assert.equal(out.result.custody,'none');
 assert.ok(!out.objects.some(k=>k.startsWith('originals/visual/sha256/')||k.startsWith('originals/observations/')),JSON.stringify(out.objects));
 if(args.body)assert.deepEqual(out.objects,[],'a body shorter than its signature leaves no quarantine object');
 const again=await call(mf,args);assert.equal(again.gets,out.gets,'a final refusal fetches nothing again');assert.equal(again.result.subReason,reason);
});
test('a failed fetch is interrupted, not a final verdict, and stores nothing',async t=>{const mf=await fixture(t),out=await call(mf,{fail:true});assert.equal(out.result.state,'unavailable');assert.equal(out.result.reason,'interrupted');assert.equal(out.result.final,false);assert.equal(out.result.custody,'none');assert.ok(!out.objects.some(k=>k.startsWith('originals/visual/sha256/')));});
test('an ineligible demand writes nothing and does not poison the shared job for a later eligible demand',async t=>{
 const mf=await fixture(t),refused=await call(mf,{ineligible:true});assert.equal(refused.result.reason,'visual-ineligible');assert.equal(refused.result.final,false);assert.equal(refused.gets,0);assert.deepEqual(refused.objects,[]);assert.deepEqual(refused.rows,[]);
 const ok=await call(mf);assert.equal(ok.gets,1,JSON.stringify(ok));assert.equal(ok.result.custody,'retained');assert.equal(ok.result.state,'ready');assert.equal(ok.result.decode.width,2);
});
test('a known-bad observed hash is refused at head promotion as non-final visual-ineligible',async t=>{
 const mf=await fixture(t),out=await call(mf,{badHash:sha(PNG)});assert.equal(out.gets,1);assert.equal(out.result.state,'unavailable');assert.equal(out.result.reason,'visual-ineligible',JSON.stringify(out.result));assert.equal(out.result.final,false);assert.notEqual(out.result.custody,'retained');
 const read=await call(mf,{op:'read',badHash:sha(PNG)});assert.equal(read.result.reason,'visual-not-requested');assert.equal(read.gets,1);
});
test('a known-bad hash found after retention is refused on read and on demand as non-final visual-ineligible',async t=>{
 const mf=await fixture(t),first=await call(mf);assert.equal(first.result.custody,'retained');
 const read=await call(mf,{op:'read',badHash:sha(PNG)});assert.equal(read.error,undefined,JSON.stringify(read));assert.equal(read.result.reason,'visual-ineligible');assert.equal(read.result.subReason,'fresh-ineligible');assert.equal(read.result.final,false);
 const demand=await call(mf,{badHash:sha(PNG)});assert.equal(demand.result.reason,'visual-ineligible');assert.equal(demand.result.final,false);assert.equal(demand.gets,1);
 const ineligibleRead=await call(mf,{op:'read',ineligible:true});assert.equal(ineligibleRead.result.reason,'visual-ineligible');
 const again=await call(mf,{op:'read'});assert.equal(again.result.custody,'retained');
});
test('a signature split across chunks is buffered: a match is stored intact, a mismatch leaves no quarantine object',async t=>{
 const mf=await fixture(t),ok=await call(mf,{split:[1,3,5]});assert.equal(ok.result.custody,'retained',JSON.stringify(ok));assert.equal(ok.result.original.sha256,sha(PNG));assert.equal(ok.result.original.bytes,PNG.length);
 const jpeg=await call(mf,{fixture:'jpeg',mime:'image/jpeg',url:'https://publisher.invalid/a.jpg',split:[1,2]},'jpeg');assert.equal(jpeg.result.original.sha256,sha(JPEG));
 const clean=await fixture(t),bad=Buffer.from(PNG);bad[5]=0;const out=await call(clean,{body:bad.toString('base64'),split:[4]});assert.equal(out.result.reason,'visual-unsupported');assert.equal(out.result.subReason,'fresh-signature-mismatch');assert.deepEqual(out.objects,[],JSON.stringify(out.objects));
});
test('an already-aborted demand writes nothing; a later normal demand fetches once and stores',async t=>{
 const mf=await fixture(t),aborted=await call(mf,{aborted:true});assert.equal(aborted.result.reason,'interrupted');assert.equal(aborted.result.subReason,'fresh-aborted');assert.equal(aborted.result.final,false);assert.equal(aborted.gets,0);assert.deepEqual(aborted.rows,[]);assert.deepEqual(aborted.objects,[]);
 const ok=await call(mf);assert.equal(ok.gets,1);assert.equal(ok.result.custody,'retained',JSON.stringify(ok.result));
});
for(const status of [503,500,429,408])test(`a transient ${status} is interrupted, not final; a plain demand fetches nothing and a deliberate Retry fetches once and stores`,async t=>{
 const mf=await fixture(t),down=await call(mf,{httpStatus:status});assert.equal(down.gets,1);assert.equal(down.result.reason,'interrupted');assert.equal(down.result.subReason,'fresh-response-status-transient');assert.equal(down.result.final,false);assert.ok(!down.objects.some(k=>k.startsWith('originals/visual/sha256/')));
 const plain=await call(mf);assert.equal(plain.gets,1,'no automatic refetch');assert.equal(plain.result.reason,'interrupted');
 const retried=await call(mf,{retry:true});assert.equal(retried.gets,2);assert.equal(retried.result.custody,'retained',JSON.stringify(retried.result));assert.equal(retried.result.original.sha256,sha(PNG));
 const again=await call(mf,{retry:true});assert.equal(again.gets,2,'Retry after retention fetches nothing');assert.equal(again.result.custody,'retained');
});
for(const status of [404,410,403])test(`a ${status} stays final visual-unsupported and even a Retry fetches nothing more`,async t=>{
 const mf=await fixture(t),gone=await call(mf,{httpStatus:status});assert.equal(gone.result.reason,'visual-unsupported');assert.equal(gone.result.subReason,'fresh-response-status');assert.equal(gone.result.final,true);
 const retried=await call(mf,{retry:true});assert.equal(retried.gets,1);assert.equal(retried.result.subReason,'fresh-response-status');
});
test('a Retry after a final signature refusal fetches nothing more',async t=>{const mf=await fixture(t),bad=await call(mf,{mime:'image/jpeg'});assert.equal(bad.result.final,true);const retried=await call(mf,{retry:true});assert.equal(retried.gets,1);assert.equal(retried.result.subReason,'fresh-signature-mismatch');});
test('a hash refused at promotion is reopened by a deliberate Retry once it is cleared',async t=>{
 const mf=await fixture(t),bad=await call(mf,{badHash:sha(PNG)});assert.equal(bad.result.reason,'visual-ineligible');assert.equal(bad.gets,1);
 const plain=await call(mf);assert.equal(plain.gets,1,'no automatic refetch');assert.equal(plain.result.reason,'visual-ineligible');
 const stillBad=await call(mf,{badHash:sha(PNG),retry:true});assert.equal(stillBad.result.reason,'visual-ineligible');assert.equal(stillBad.gets,2);
 const cleared=await call(mf,{retry:true});assert.equal(cleared.gets,3);assert.equal(cleared.result.custody,'retained',JSON.stringify(cleared.result));assert.equal(cleared.result.original.sha256,sha(PNG));
 const after=await call(mf,{retry:true});assert.equal(after.gets,3);assert.equal(after.result.custody,'retained');
});
test('query-string source is refused before any fetch',async t=>{const mf=await fixture(t),out=await call(mf,{url:'https://publisher.invalid/c4.png?sig=1'});assert.match(out.error,/visual-source/);assert.equal(out.gets,0);});
test('audio default is unchanged: same keys, no contentType or content binding',async()=>{
 const rows=new Map(),objects=new Map();const storage={get:async k=>structuredClone(rows.get(k)),async transaction(fn){return fn({get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v))});}};
 const bucket={get:async key=>{const b=objects.get(key);return b?{size:b.length,body:new Blob([b]).stream()}:null;},put:async(key,body)=>{const b=body instanceof Uint8Array?body.slice():new Uint8Array(await new Response(body).arrayBuffer());if(!objects.has(key))objects.set(key,b);return {};}};
 const task=createFreshSourceObservations({storage,bucket,source:{logicalId:'l',url:'https://publisher.invalid/a.mp3',sourceVersionKind:'discovery-snapshot',sourceVersion:'v',publisherVersion:null},policy:{revision:'p',maxBytes:1024,totalMs:1000,progressMs:100},admissions:[{checkId:'c',sequence:1,expectedPreviousObservationSha256:null,previousSourceSha256:null}],eligibility:()=>true,makeStream:()=>new TransformStream(),fetchSource:async()=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'audio/mpeg','content-length':'3'}})});
 assert.equal((await task.observe('c')).state,'completed');const head=await task.read();
 assert.equal(head.observation.sourceKey,`originals/sha256/${sha(Buffer.from([1,2,3]))}.mp3`);assert.equal('contentType' in head.observation,false);assert.deepEqual(Object.keys(head.observation.binding).sort(),['admission','policy','schema','source']);
 assert.ok([...objects.keys()].some(k=>/^originals\/quarantine\/checks\/.*\.mp3$/.test(k)));
});
test('no byte of a split signature reaches the quarantine stream until the whole signature matches; audio passes straight through',async()=>{
 async function run(content,mime,chunks){const rows=new Map(),objects=new Map(),written=[];const storage={get:async k=>structuredClone(rows.get(k)),async transaction(fn){return fn({get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v))});}};
  const bucket={get:async key=>{const b=objects.get(key);return b?{size:b.length,body:new Blob([b]).stream()}:null;},put:async(key,body)=>{const b=body instanceof Uint8Array?body.slice():new Uint8Array(await new Response(body).arrayBuffer());if(!objects.has(key))objects.set(key,b);return {};}};
  const total=chunks.reduce((n,c)=>n+c.length,0),task=createFreshSourceObservations({storage,bucket,content,source:{logicalId:'l',url:'https://publisher.invalid/x',sourceVersionKind:'discovery-snapshot',sourceVersion:'v',publisherVersion:null},policy:{revision:'p',maxBytes:1024,totalMs:1000,progressMs:100},admissions:[{checkId:'c',sequence:1,expectedPreviousObservationSha256:null,previousSourceSha256:null}],eligibility:()=>true,
   makeStream:()=>new TransformStream({transform(chunk,c){written.push([...chunk]);c.enqueue(chunk);}}),
   fetchSource:async()=>new Response(new ReadableStream({start(c){for(const x of chunks)c.enqueue(new Uint8Array(x));c.close();}}),{headers:{'content-type':mime,'content-length':String(total)}})});
  let error=null;try{await task.observe('c');}catch(e){error=e.message;}return {error,written:written.flat()};}
 const bad=[[0x89,0x50,0x4e,0x47],[0x0d,0x0a,0x1a,0x00,1,2,3]];const refused=await run(VISUAL_CONTENT,'image/png',bad);assert.equal(refused.error,'fresh-signature-mismatch');assert.deepEqual(refused.written,[]);
 const good=[[0x89,0x50],[0x4e,0x47,0x0d],[0x0a,0x1a,0x0a,9,9]];const stored=await run(VISUAL_CONTENT,'image/png',good);assert.equal(stored.error,null);assert.deepEqual(stored.written,good.flat());
 const audio=await run(AUDIO_CONTENT,'audio/mpeg',[[1],[2,3]]);assert.equal(audio.error,null);assert.deepEqual(audio.written,[1,2,3]);
});

function memory(){const rows=new Map(),objects=new Map();return {rows,objects,storage:{get:async k=>structuredClone(rows.get(k)),list:async()=>new Map(rows),async transaction(fn){return fn({get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v))});}},bucket:{get:async key=>{const b=objects.get(key);return b?{size:b.length,body:new Blob([b]).stream()}:null;},put:async(key,body)=>{const b=body instanceof Uint8Array?body.slice():new Uint8Array(await new Response(body).arrayBuffer());if(!objects.has(key))objects.set(key,b);return {};}}};}
test('a blank or whitespace version, or a source the primitive would refuse, writes nothing and is a typed refusal',async()=>{
 const {createVisualOriginalJob}=await import('../../server/fia/preparation/visual-original.mjs');
 for(const sourceVersion of ['',' ','\t\n'])assert.throws(()=>createVisualOriginalJob({...memory(),source:{kind:'map',url:'https://publisher.invalid/c4.png',sourceVersion},eligibility:()=>true}),/visual-source/);
 const m=memory();let gets=0;const job=createVisualOriginalJob({...m,source:{kind:'map',url:'https://publisher.invalid/'+'a'.repeat(990),sourceVersion:'r1'},eligibility:()=>true,fetchSource:async()=>{gets++;throw Error('no');}});
 const out=await job.demand();assert.equal(out.reason,'visual-unsupported');assert.equal(out.subReason,'fresh-text');assert.equal(out.final,true);assert.equal(m.rows.size,0);assert.equal(m.objects.size,0);assert.equal(gets,0);
});
test('a rejected eligibility promise is ineligible and never an unhandled rejection',async()=>{
 const {createVisualOriginalJob}=await import('../../server/fia/preparation/visual-original.mjs');const unhandled=[];const on=e=>unhandled.push(e);process.on('unhandledRejection',on);
 try{const m=memory(),job=createVisualOriginalJob({...m,source:{kind:'map',url:'https://publisher.invalid/c4.png',sourceVersion:'r1'},eligibility:()=>Promise.reject(Error('policy-down'))});
  const out=await job.demand();assert.equal(out.reason,'visual-ineligible');assert.equal(out.final,false);assert.equal(m.rows.size,0);
  const n=memory(),later=createVisualOriginalJob({...n,source:{kind:'map',url:'https://publisher.invalid/c4.png',sourceVersion:'r1'},makeStream:()=>new TransformStream(),fetchSource:async()=>{throw Error('must-not-fetch');},eligibility:c=>c.phase==='demand'?true:Promise.reject(Error('policy-down'))});
  const refused=await later.demand();assert.equal(refused.reason,'visual-ineligible');
  const r=await later.read();assert.equal(r.state,'unavailable');
  await new Promise(r=>setTimeout(r,20));assert.deepEqual(unhandled,[]);}finally{process.off('unhandledRejection',on);}
});
