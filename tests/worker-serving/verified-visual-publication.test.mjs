import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import vm from 'node:vm';
import {planProxyDownload,downloadSelectionIncludes} from '../../apps/web/src/lib/proxy-request.js';
import {readVerifiedMedia,validateVideoSize} from '../../apps/web/src/lib/media-delivery.js';
import {sha256 as hash,canonicalJSONString} from '../../server/fia/preparation/contract.mjs';
import {decodeRetained,VISUAL_ORIGINAL_RECIPE_SHA256} from '../../server/fia/preparation/visual-original.mjs';
import {serveVerifiedVisual,verifiedVisualDescriptor,validVerifiedVisualAdmission,createVerifiedVisualVerifier,VISUAL_REQUEST_MS} from '../../server/fia/preparation/verified-visual-publication.mjs';
const bytes=new Uint8Array(readFileSync(new URL('../preparation-executor/fixtures/visual/rgb-31x17.png',import.meta.url))),sha=createHash('sha256').update(bytes).digest('hex'),revision='a'.repeat(64),delivery='b'.repeat(64),packId='spa.LUK-1-1-4',origin='https://fiaguide.app';
let gets=0;const bucket={get:async()=>{gets++;return {size:bytes.length,arrayBuffer:async()=>bytes.slice().buffer};}};
const decoded=await decodeRetained(bucket,{sha256:sha,bytes:bytes.length,contentType:'image/png',sourceKey:'fixture'});
const sourceEvidence={id:'c211',kind:'map',url:'https://publisher.invalid/c211.png'};
const entry={sourceEvidenceSha256:await hash(canonicalJSONString(sourceEvidence)),status:'verified',packId,presentationRevision:revision,deliveryRevision:delivery,assetId:'c211',kind:'map',sha256:sha,bytes:bytes.length,mime:'image/png',width:decoded.width,height:decoded.height,pixelsSha256:decoded.pixelsSha256,recipeSha256:VISUAL_ORIGINAL_RECIPE_SHA256,sourceKey:`originals/visual/sha256/${sha}.png`,path:`/packs/${packId}/visuals/c211.png`};
const base=`/v1/verified-visuals/${packId}/${revision}/${delivery}`,env={FIA_API_ORIGIN:origin},options={entries:[entry],bucket,currentRevision:()=>revision,currentPresentation:async()=>({revision,assets:{c211:{kind:'map',sourceEvidence}}})};
const request=(path=base+'/manifest',init={},opts=options)=>serveVerifiedVisual(new Request(origin+path,init),env,opts);
function sw(){const handlers={};const source=readFileSync(new URL('../../apps/web/public/sw.js',import.meta.url),'utf8');const context=vm.createContext({self:{addEventListener(type,handler){handlers[type]=handler;}},AbortController,readVerifiedMedia,validateVideoSize,Response,Headers,URL,Set,Map,console,TextEncoder,TextDecoder,crypto:globalThis.crypto,permittedRecordings:f=>f,generatedRecordingPaths:[],downloadSelectionIncludes,planProxyDownload});vm.runInContext(source,context);context.handlers=handlers;return context;}
test('verified original publishes a revision-bound descriptor and serves exact decoded bytes, GET and HEAD',async()=>{
 const manifest=await(await request()).json();assert.equal(manifest.files.length,1);assert.equal(manifest.files[0].visualPublication.assetId,'c211');assert.deepEqual(manifest.files[0],verifiedVisualDescriptor(entry));
 const response=await request(manifest.files[0].deliveryURL);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(createHash('sha256').update(new Uint8Array(await response.arrayBuffer())).digest('hex'),sha);
 const head=await request(manifest.files[0].deliveryURL,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(bytes.length));assert.equal((await head.arrayBuffer()).byteLength,0);
});
test('route refuses unknown/stale/cross-pack/wrong-asset/query/range/origin and mutation without acquisition',async()=>{
 for(const [path,init,status,opts] of [[base+'/wrong/'+sha,{},404],[base.replace(packId,'eng.MRK-1-1-13')+'/manifest',{},404],[base+'/c211/'+'0'.repeat(64),{},404],[base+'/manifest?url=https://evil.invalid',{},400],[base+'/manifest',{headers:{Range:'bytes=0-2'}},416],[base+'/manifest',{headers:{Origin:'https://evil.invalid'}},403],[base+'/manifest',{method:'POST'},405],[base+'/manifest',{},409,{...options,currentRevision:()=> 'c'.repeat(64)}]]){const before=gets;assert.equal((await request(path,init,opts)).status,status);assert.equal(gets,before,'no bucket work before admission');}
});
test('zero hashes, pending transcodes, bad recipe/dimensions/path and retained corruption never become ready',async()=>{
 for(const patch of [{status:'pending-transcode'},{sha256:'0'.repeat(64)},{pixelsSha256:'0'.repeat(64)},{recipeSha256:'e'.repeat(64)},{width:9000},{path:'/packs/eng.MRK-1-1-13/visuals/c211.png'},{sourceKey:'arbitrary'}]){const e={...entry,...patch};assert.equal(validVerifiedVisualAdmission(e),false);assert.equal((await request(base+'/manifest',{}, {...options,entries:[e]})).status,503);}
 assert.equal((await request(base+'/manifest',{}, {...options,currentPresentation:async()=>({revision,assets:{c211:{kind:'image',sourceEvidence}}})})).status,409);
 const corrupt={get:async()=>({size:bytes.length,arrayBuffer:async()=>new Uint8Array(bytes.length).buffer})};assert.equal((await request(base+'/manifest',{}, {...options,bucket:corrupt})).status,503);
});
test('actual SW merges only exact verified descriptors and rejects forged route/consumer bindings',async()=>{
 const context=sw(),manifest={schema:1,packId,presentationRevision:revision,deliveryRevision:delivery,revision:'build',files:[{path:'/index.html',group:'core',bytes:1,sha256:'d'.repeat(64)}]},file=verifiedVisualDescriptor(entry);
 context.manifest=manifest;context.file=file;vm.runInContext('validateVerifiedVisual(file,manifest)',context);
 for(const patch of [{deliveryURL:'https://evil.invalid/image/a'},{deliveryURL:'/v1/arbitrary/'+sha},{sourceSha256:'0'.repeat(64)},{bytes:0},{path:'/packs/eng.MRK-1-1-13/visuals/c211.png'},{visualPublication:{...file.visualPublication,assetId:'c212'}},{visualPublication:{...file.visualPublication,presentationRevision:'c'.repeat(64)}}]){context.file={...file,...patch};assert.throws(()=>vm.runInContext('validateVerifiedVisual(file,manifest)',context));}
 context.file=file;context.request=async path=>request(path);const result=await vm.runInContext('mergeVerifiedVisuals(manifest,request)',context);assert.equal(result.files.length,2);assert.equal(result.files[1].path,entry.path);
 context.combined=result;for(const choice of ['visual','all'])for(const size of [null,'prepared']){context.choice=choice;context.sizes={image:size};const original=vm.runInContext('planVerifiedVisualDownload(combined,choice,sizes)',context);assert.equal(original.files[1].sha256,file.sha256);assert.equal(original.mediaSizes.image,'prepared');}
 context.combined=result;const planned=vm.runInContext("planVerifiedVisualDownload(combined,'visual',{})",context);assert.equal(planned.files[1].deliveryURL,file.deliveryURL);assert.throws(()=>vm.runInContext("planVerifiedVisualDownload(combined,'visual',{image:'small'})",context));
});

for(const classic of [true,false])test(`actual SW MEDIA_STATUS and MEDIA_PLAY traverse verified visuals ${classic?'with':'without'} classic delivery sidecar`,async()=>{
 const context=sw(),manifest={schema:1,packId,presentationRevision:revision,deliveryRevision:delivery,revision:'build',files:[{path:'/index.html',group:'core',bytes:1,sha256:'d'.repeat(64)}]};
 if(!classic)delete manifest.deliveryRevision;
 context.caches={open:async()=>({match:async()=>null})};
 context.fetch=async path=>path===`/offline/${packId}.json`?Response.json(manifest):request(path);
 async function message(type,extra={}){let result,pending;context.handlers.message({data:{type,packId,revision,deliveryRevision:delivery,...extra},source:{id:'fixture'},ports:[{postMessage(value){result=value;}}],waitUntil(promise){pending=promise;}});await pending;return result;}
 const status=await message('MEDIA_STATUS');assert.equal(status.ok,true,JSON.stringify(status));assert.equal(status.files[0].path,entry.path);
 const play=await message('MEDIA_PLAY',{path:entry.path,requestId:'exact-image'});assert.equal(play.ok,true,JSON.stringify(play));assert.equal(play.mime,'image/png');assert.equal(createHash('sha256').update(new Uint8Array(play.bytes)).digest('hex'),sha);
});

test('discovery is read-only and fails closed for empty/default, stale, cross-pack and mixed generations',async()=>{
 const discover=`/v1/verified-visuals/${packId}/${revision}/manifest`;
 const response=await request(discover);assert.equal(response.status,200);assert.equal((await response.json()).deliveryRevision,delivery);
 const before=gets;
 for(const opts of [{...options,entries:[]},{...options,entries:[{...entry,packId:'eng.MRK-1-1-13'}]}])assert.equal((await request(discover,{},opts)).status,404);
 assert.equal((await request(discover,{}, {...options,currentRevision:()=> 'e'.repeat(64)})).status,409);
 assert.equal((await request(discover,{}, {...options,entries:[entry,{...entry,deliveryRevision:'c'.repeat(64)}]})).status,503);
 assert.equal((await request(discover,{method:'POST'})).status,405);assert.equal(gets,before,'refusals perform no source or bucket acquisition');
 assert.equal((await serveVerifiedVisual(new Request(origin+discover),env,{currentRevision:()=>revision})).status,404,'shipped empty registry never implies readiness');
});
test('SW discovery preserves classic generation, rejects empty/foreign/refused results and never mixes delivery families',async()=>{
 const context=sw(),manifest={schema:1,packId,presentationRevision:revision,revision:'build',files:[{path:'/index.html',group:'core',bytes:1,sha256:'d'.repeat(64)}]};context.manifest=manifest;
 context.request=async()=>new Response(null,{status:404});assert.equal((await vm.runInContext('mergeVerifiedVisuals(manifest,request)',context)).deliveryRevision,undefined);
 for(const body of [{schema:'fia-verified-visual-manifest@1',packId,presentationRevision:revision,deliveryRevision:delivery,files:[]},{schema:'fia-verified-visual-manifest@1',packId:'eng.MRK-1-1-13',presentationRevision:revision,deliveryRevision:delivery,files:[verifiedVisualDescriptor(entry)]}]){context.request=async()=>Response.json(body);await assert.rejects(vm.runInContext('mergeVerifiedVisuals(manifest,request)',context));}
 context.request=async()=>new Response(null,{status:403});await assert.rejects(vm.runInContext('mergeVerifiedVisuals(manifest,request)',context));
 context.manifest={...manifest,files:[...manifest.files,{...verifiedVisualDescriptor(entry),visualPublication:undefined}]};await assert.rejects(vm.runInContext('mergeVerifiedVisuals(manifest,request)',context));
 context.manifest={...manifest,deliveryRevision:'c'.repeat(64)};context.request=async()=>Response.json({schema:'fia-verified-visual-manifest@1',packId,presentationRevision:revision,deliveryRevision:delivery,files:[verifiedVisualDescriptor(entry)]});await assert.rejects(vm.runInContext('mergeVerifiedVisuals(manifest,request)',context));
});

test('one admitted original may spend14s reading and19s decoding without exceeding the SW45s inactivity budget',async()=>{
 const originalNow=Date.now;let elapsed=0;Date.now=()=>originalNow()+elapsed;
 try{
  const slow={get:async()=>{elapsed+=14000;return {size:bytes.length,arrayBuffer:async()=>bytes.slice().buffer};}};
  const verifier=createVerifiedVisualVerifier({bucket:slow,decode:async(...args)=>{const result=await decodeRetained(...args);elapsed+=19000;return result;}});
  const result=await request(base+'/manifest',{}, {...options,bucket:slow,verifier});assert.equal(result.status,200,JSON.stringify(await result.clone().json()));assert.equal(elapsed,33000);
  assert.ok(VISUAL_REQUEST_MS>=35000&&VISUAL_REQUEST_MS<45000);
 }finally{Date.now=originalNow;}
});
async function corpus(){
 const files=[['c211','rgb-31x17.png','image/png'],['c212','palette-20x9.png','image/png'],['a1400','baseline-37x23.jpg','image/jpeg']],store=new Map(),entries=[],assets={};
 for(const [assetId,name,mime]of files){
  const content=new Uint8Array(readFileSync(new URL('../preparation-executor/fixtures/visual/'+name,import.meta.url))),sha256=await hash(content),ext=mime==='image/png'?'png':'jpg',sourceKey=`originals/visual/sha256/${sha256}.${ext}`;
  const d=await decodeRetained({get:async()=>({size:content.length,arrayBuffer:async()=>content.slice().buffer})},{sha256,bytes:content.length,contentType:mime,sourceKey});
  const evidence={id:assetId,kind:'map',url:'https://publisher.invalid/'+assetId+'.'+ext};assets[assetId]={kind:'map',sourceEvidence:evidence};store.set(sourceKey,content);
  entries.push({...entry,assetId,mime,sourceKey,sha256,bytes:content.length,width:d.width,height:d.height,pixelsSha256:d.pixelsSha256,sourceEvidenceSha256:await hash(canonicalJSONString(evidence)),path:`/packs/${packId}/visuals/${assetId}.${ext}`});
 }
 return {entries,store,currentPresentation:async()=>({revision,assets})};
}
test('parallel requests bound live reads to2 and codecs to1, reuse only byte-checked proof, and retain no source payloads',async()=>{
 const fixture=await corpus();let liveReads=0,maxReads=0,liveDecodes=0,maxDecodes=0,decodeCalls=0,gets=0;
 const bucket={get:async key=>{gets++;liveReads++;maxReads=Math.max(maxReads,liveReads);const content=fixture.store.get(key);return {size:content.length,arrayBuffer:async()=>{await new Promise(resolve=>setTimeout(resolve,3));liveReads--;return content.slice().buffer;}};}};
 const verifier=createVerifiedVisualVerifier({bucket,decode:async(...args)=>{decodeCalls++;liveDecodes++;maxDecodes=Math.max(maxDecodes,liveDecodes);try{return await decodeRetained(...args);}finally{liveDecodes--;}}}),opts={...options,...fixture,bucket,verifier};
 const responses=await Promise.all([request(base+'/manifest',{},opts),request(base+'/manifest',{},opts)]);assert.ok(responses.every(r=>r.status===200));assert.equal(maxReads,2);assert.equal(maxDecodes,1);assert.equal(decodeCalls,3);
 const before=gets;assert.equal((await request(base+'/manifest',{},opts)).status,200);assert.equal(gets,before+3,'every warm proof still re-reads the retained bytes');assert.equal(decodeCalls,3,'verified identical source/recipe avoids repeated codec work');
 const first=fixture.entries[0],original=fixture.store.get(first.sourceKey);fixture.store.set(first.sourceKey,new Uint8Array(original.length));assert.equal((await request(base+'/manifest',{},opts)).status,503,'cached proof cannot hide corruption');fixture.store.set(first.sourceKey,original);
 assert.equal((await request(base+'/manifest',{}, {...opts,entries:[{...first,pixelsSha256:'c'.repeat(64)}]})).status,409,'cached proof cannot bless different declared pixels');
});
test('bounded attempts keep only completed decode proofs, resume a cold collection, and fence revocation after IO',async()=>{
 const fixture=await corpus(),originalNow=Date.now;let elapsed=0,calls=0;Date.now=()=>originalNow()+elapsed;
 try{
  const bucket={get:async key=>{const content=fixture.store.get(key);return {size:content.length,arrayBuffer:async()=>content.slice().buffer};}};
  const verifier=createVerifiedVisualVerifier({bucket,decode:async(...args)=>{calls++;const d=await decodeRetained(...args);elapsed+=19000;return d;}}),opts={...options,...fixture,bucket,verifier};
  assert.equal((await request(base+'/manifest',{},opts)).status,503,'three cold19s decodes cannot fit within a40s request');assert.equal(calls,2,'do not start a codec without its full20s budget');
  assert.equal((await request(base+'/manifest',{},opts)).status,200,'completed proofs survive; remaining source is decoded in the next bounded attempt');assert.equal(calls,3);
  let reads=0;assert.equal((await request(base+'/manifest',{}, {...opts,currentRevision:()=>++reads===1?revision:'d'.repeat(64)})).status,409,'a pointer revoked during byte verification cannot serve');
 }finally{Date.now=originalNow;}
});

test('an unexpectedly late codec result never enters the verified proof cache',async()=>{
 const originalNow=Date.now;let elapsed=0,calls=0;Date.now=()=>originalNow()+elapsed;
 try{
  const verifier=createVerifiedVisualVerifier({bucket,decode:async(...args)=>{calls++;const d=await decodeRetained(...args);if(calls===1)elapsed+=41000;return d;}}),opts={...options,verifier};
  assert.equal((await request(base+'/manifest',{},opts)).status,503);assert.equal((await request(base+'/manifest',{},opts)).status,200);assert.equal(calls,2,'late result is not reusable evidence');
 }finally{Date.now=originalNow;}
});

test('streamed retained readback is bounded, verifies all bytes and cancels an oversized body',async()=>{
 let canceled=0;
 const streamed={get:async()=>({size:bytes.length,body:new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=17)controller.enqueue(bytes.slice(i,i+17));controller.close();}})})};
 assert.equal((await request(base+'/manifest',{}, {...options,bucket:streamed})).status,200);
 const excess={get:async()=>({size:bytes.length,body:new ReadableStream({start(controller){controller.enqueue(new Uint8Array(bytes.length+1));},cancel(){canceled++;}})})};
 assert.equal((await request(base+'/manifest',{}, {...options,bucket:excess})).status,503);assert.equal(canceled,1);
});
