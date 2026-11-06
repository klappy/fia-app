import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import vm from 'node:vm';
import {planProxyDownload,downloadSelectionIncludes} from '../../apps/web/src/lib/proxy-request.js';
import {readVerifiedMedia,validateVideoSize} from '../../apps/web/src/lib/media-delivery.js';
import {sha256 as hash,canonicalJSONString} from '../../server/fia/preparation/contract.mjs';
import {decodeRetained,VISUAL_ORIGINAL_RECIPE_SHA256} from '../../server/fia/preparation/visual-original.mjs';
import {serveVerifiedVisual,verifiedVisualDescriptor,validVerifiedVisualAdmission} from '../../server/fia/preparation/verified-visual-publication.mjs';
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
