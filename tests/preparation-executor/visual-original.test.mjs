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
export class Job {constructor(ctx,env){this.ctx=ctx;this.env=env;this.gets=0;this.gates=[];}
 async fetch(request){const args=await request.json();if(args.op==='corrupt'){for(const o of (await this.env.ORIGINALS.list({prefix:'originals/visual/sha256/'})).objects)await this.env.ORIGINALS.put(o.key,new Uint8Array(o.size).fill(1));return Response.json({corrupted:true});}if(args.op==='counts')return Response.json({gets:this.gets,waiting:this.gates.length});if(args.op==='release'){for(const r of this.gates.splice(0))r();return Response.json({released:true});}
  const source={kind:args.kind||'map',url:args.url||'https://publisher.invalid/maps/c4.png',sourceVersion:'fixture-revision-1'};
  try{const job=createVisualOriginalJob({storage:this.ctx.storage,bucket:this.env.ORIGINALS,source,eligibility:c=>!args.ineligible&&!(args.badHash&&c.observedContent?.sha256===args.badHash),now:()=>1000,fetchSource:async(url,options)=>{this.gets++;if(args.fail)throw null;if(options.redirect!=='manual')throw Error('wrong-redirect');if(args.gate)await new Promise(r=>this.gates.push(r));
    if(args.redirect)return new Response(null,{status:302,headers:{location:'https://elsewhere.invalid/x.png'}});
    const bytes=args.body?decode(args.body):args.size?new Uint8Array(args.size).fill(7).map((v,i)=>i<8?[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a][i]:v):decode(fixtures[args.fixture||'png']);
    const headers={'content-type':args.mime||'image/png'};if(!args.noLength)headers['content-length']=String(args.length??bytes.length);
    let sent=false;const cuts=args.split?[0,...args.split,bytes.length]:null;return new Response(new ReadableStream({pull(c){if(sent){c.close();return;}sent=true;if(cuts){for(let i=0;i<cuts.length-1;i++)c.enqueue(bytes.slice(cuts[i],cuts[i+1]));return;}for(let n=0;n<bytes.length;n+=65536)c.enqueue(bytes.slice(n,n+65536));}}),{status:200,headers});}});
   const result=args.op==='read'?await job.read():await job.demand();
   const objects=(await this.env.ORIGINALS.list()).objects;return Response.json({result,gets:this.gets,objects:objects.map(o=>o.key),rows:[...(await this.ctx.storage.list()).keys()]});}catch(error){return Response.json({error:error.message,gets:this.gets});}}
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
