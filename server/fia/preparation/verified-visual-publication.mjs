import admissions from './verified-visuals.json' with {type:'json'};
import {decodeRetained,VISUAL_ORIGINAL_RECIPE,VISUAL_ORIGINAL_RECIPE_SHA256} from './visual-original.mjs';
import {sha256,canonicalJSONString} from './contract.mjs';
// Reviewed, build-pinned prebuilt originals only. GET never acquires, writes, or admits caller metadata.
// Empty by default: publisher metadata, pending transcodes and zero hashes are not media evidence.
const ROOT='/v1/verified-visuals/',HASH=/^(?!0{64}$)[a-f0-9]{64}$/;
const pack=v=>typeof v==='string'&&/^(eng|spa)\.(MRK|LUK)-\d+(?:-\d+)+$/.test(v);
const asset=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const refuse=(status,reason)=>json(status,{status:'unavailable',reason});
export function validVerifiedVisualAdmission(e){
 if(!e||e.status!=='verified'||!pack(e.packId)||!asset(e.assetId)||!['image','map'].includes(e.kind)||![e.presentationRevision,e.deliveryRevision,e.sha256,e.pixelsSha256,e.sourceEvidenceSha256].every(h=>HASH.test(h??''))||e.recipeSha256!==VISUAL_ORIGINAL_RECIPE_SHA256||!Number.isSafeInteger(e.bytes)||e.bytes<1||e.bytes>VISUAL_ORIGINAL_RECIPE.limits.maxBytes)return false;
 if(!['image/png','image/jpeg'].includes(e.mime)||!Number.isSafeInteger(e.width)||!Number.isSafeInteger(e.height)||e.width<1||e.height<1||e.width>8192||e.height>8192||e.width*e.height>VISUAL_ORIGINAL_RECIPE.limits.maxPixels||e.mime==='image/jpeg'&&e.width*e.height>VISUAL_ORIGINAL_RECIPE.limits.maxJpegPixels)return false;
 const ext=e.mime==='image/png'?'png':'jpg';
 return e.sourceKey===`originals/visual/sha256/${e.sha256}.${ext}`&&e.path===`/packs/${e.packId}/visuals/${e.assetId}.${ext}`;
}
const route=e=>`${ROOT}${e.packId}/${e.presentationRevision}/${e.deliveryRevision}/${e.assetId}/${e.sha256}`;
export function verifiedVisualDescriptor(e){
 if(!validVerifiedVisualAdmission(e))throw Error('visual-admission-invalid');
 return {path:e.path,group:'image',sha256:e.sha256,bytes:e.bytes,mime:e.mime,sourceSha256:e.sha256,sourceBytes:e.bytes,deliveryRevision:e.deliveryRevision,deliveryURL:route(e),visualPublication:{schema:'fia-verified-visual@1',packId:e.packId,presentationRevision:e.presentationRevision,assetId:e.assetId,kind:e.kind,sourceEvidenceSha256:e.sourceEvidenceSha256,recipeSha256:e.recipeSha256,pixelsSha256:e.pixelsSha256,width:e.width,height:e.height}};
}
function bounded(promise,ms=15000){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('visual-readback-timeout')),ms);})]).finally(()=>clearTimeout(timer));}
export const VISUAL_REQUEST_MS=40000; // below the SW adapter's45s inactivity deadline.
const VERIFIERS=new WeakMap(),CACHE_LIMIT=128;
function gate(limit){
 let active=0;const waiting=[];
 return async run=>{if(active>=limit){if(waiting.length>=128)throw Error('visual-verification-busy');await new Promise(resolve=>waiting.push(resolve));}else active++;
  try{return await run();}finally{const next=waiting.shift();if(next)next();else active--;}
 };
}
const READS=gate(2),DECODES=gate(1);
// Trusted composition port; never request data. Proof cache contains no source bytes. At most two
// byte buffers and one codec run are live in this isolate, even across separate bucket objects.
export function createVerifiedVisualVerifier({bucket,decode=decodeRetained,now=()=>Date.now()}){
 const reads=READS,decodes=DECODES,proofs=new Map();
 const check=deadline=>{if(now()>deadline)throw Error('visual-verification-timeout');};
 async function wait(promise,deadline){check(deadline);const result=await bounded(promise,Math.max(1,deadline-now()));check(deadline);return result;}
 async function read(e,deadline){
  const until=Math.min(deadline,now()+VISUAL_ORIGINAL_RECIPE.limits.progressMs),object=await wait(bucket.get(e.sourceKey),until);
  if(!object||object.size!==e.bytes)throw Error('visual-retained-size');
  let bytes;
  if(object.body?.getReader){
   bytes=new Uint8Array(e.bytes);const reader=object.body.getReader();let offset=0;
   try{for(;;){const {done,value}=await wait(reader.read(),until);if(done)break;if(!(value instanceof Uint8Array)||offset+value.length>e.bytes)throw Error('visual-retained-size');bytes.set(value,offset);offset+=value.length;}if(offset!==e.bytes)throw Error('visual-retained-size');}
   finally{reader.cancel().catch(()=>{});reader.releaseLock();}
  }else bytes=new Uint8Array(await wait(object.arrayBuffer(),until));
  if(bytes.length!==e.bytes||await sha256(bytes)!==e.sha256)throw Error('visual-retained-hash');check(deadline);return bytes;
 }
 async function verify(e,{deadline,retainBytes=false}){return reads(async()=>{
  check(deadline);const bytes=await read(e,deadline),key=canonicalJSONString([e.recipeSha256,e.sha256,e.bytes,e.mime]);let proof=proofs.get(key);
  if(!proof){proof=await decodes(async()=>{
   check(deadline);const warm=proofs.get(key);if(warm)return warm;
   // A synchronous JPEG cannot be pre-empted: reserve its entire20s recipe budget before starting.
   if(deadline-now()<VISUAL_ORIGINAL_RECIPE.limits.decodeMs)throw Error('visual-verification-timeout');
   // Decode the SAME bytes just read and hashed, not a second R2 read that can race or consume another15s.
   const memory={get:async key=>key===e.sourceKey?{size:bytes.length,arrayBuffer:async()=>bytes.buffer}:null};
   const d=await decode(memory,{sha256:e.sha256,bytes:e.bytes,contentType:e.mime,sourceKey:e.sourceKey});check(deadline);
   if(d.state!=='ready'||d.recipeSha256!==VISUAL_ORIGINAL_RECIPE_SHA256||d.originalSha256!==e.sha256||d.bytes!==e.bytes||d.mime!==e.mime||!HASH.test(d.pixelsSha256??''))return null;
   const p=Object.freeze({recipeSha256:d.recipeSha256,width:d.width,height:d.height,pixelsSha256:d.pixelsSha256});
   proofs.set(key,p);if(proofs.size>CACHE_LIMIT)proofs.delete(proofs.keys().next().value);return p;
  });}
  check(deadline);
  if(!proof||proof.recipeSha256!==e.recipeSha256||proof.width!==e.width||proof.height!==e.height||proof.pixelsSha256!==e.pixelsSha256)return {valid:false};
  // LRU proof only. Warm use still read and rehashed all current retained bytes above.
  proofs.delete(key);proofs.set(key,proof);if(retainBytes&&await sha256(bytes)!==e.sha256)throw Error('visual-retained-hash');check(deadline);return {valid:true,...(retainBytes?{bytes}:{})};
 });}
 return Object.freeze({verify});
}
function verifierFor(bucket){let verifier=VERIFIERS.get(bucket);if(!verifier){verifier=createVerifiedVisualVerifier({bucket});VERIFIERS.set(bucket,verifier);}return verifier;}
async function verifyMatches(matches,verifier,deadline,retainBytes){
 let next=0,failure=null,body=null;
 async function run(){while(!failure&&next<matches.length){const e=matches[next++];try{const result=await verifier.verify(e,{deadline,retainBytes});if(!result.valid){failure=Error('visual-integrity');return;}if(retainBytes)body=result.bytes;}catch(error){failure=error;}}}
 await Promise.all(Array.from({length:Math.min(2,matches.length)},run));if(failure)throw failure;return body;
}
// entries and bucket are trusted composition ports. Neither can come from request JSON or query parameters.
async function serve(request,env,{entries=admissions,bucket=env.FIA_ORIGINALS,currentRevision,currentPresentation,deadline=Date.now()+VISUAL_REQUEST_MS,verifier}={}){
 const url=new URL(request.url);if(!url.pathname.startsWith(ROOT)&&url.pathname!==ROOT.slice(0,-1))return null;
 if(url.origin!==env.FIA_API_ORIGIN||request.headers.has('Origin')&&request.headers.get('Origin')!==env.FIA_API_ORIGIN)return refuse(403,'untrusted-origin');
 if(!['GET','HEAD'].includes(request.method))return refuse(405,'method-not-allowed');
 if(url.search||url.hash)return refuse(400,'invalid-request');
 const parts=url.pathname.slice(ROOT.length).split('/'),[packId,presentationRevision]=parts,discovery=parts.length===3&&parts[2]==='manifest';
 let [, ,deliveryRevision,id,digest]=parts;
 if(!pack(packId)||!HASH.test(presentationRevision??'')||!discovery&&(!HASH.test(deliveryRevision??'')||!(parts.length===4&&id==='manifest'||parts.length===5&&asset(id)&&HASH.test(digest??''))))return refuse(404,'unknown-visual');
 if(request.headers.has('Range'))return new Response(null,{status:416,headers:{'Cache-Control':'no-store','Accept-Ranges':'none'}});
 if(typeof currentRevision!=='function'||await currentRevision(packId)!==presentationRevision)return refuse(409,'visual-revision-stale');
 if(!Array.isArray(entries)||entries.length>4096)return refuse(503,'visual-admissions-invalid');
 if(discovery){
  const candidates=entries.filter(e=>e?.packId===packId&&e.presentationRevision===presentationRevision);
  if(!candidates.length)return refuse(404,'visual-not-published');
  if(candidates.some(e=>!validVerifiedVisualAdmission(e))||new Set(candidates.map(e=>e.deliveryRevision)).size!==1)return refuse(503,'visual-generation-ambiguous');
  deliveryRevision=candidates[0].deliveryRevision;id='manifest';
 }
 const selected=entries.filter(e=>e?.packId===packId&&e.presentationRevision===presentationRevision&&e.deliveryRevision===deliveryRevision);
 if(selected.length>64||selected.some(e=>!validVerifiedVisualAdmission(e))||new Set(selected.map(e=>e.assetId)).size!==selected.length||new Set(selected.map(e=>e.path)).size!==selected.length)return refuse(503,'visual-admissions-invalid');
 const matches=id==='manifest'?selected:selected.filter(e=>e.assetId===id&&e.sha256===digest);
 if(!matches.length)return refuse(404,'visual-not-published');
 if(typeof currentPresentation!=='function')return refuse(503,'visual-authority-unavailable');
 const presentation=await currentPresentation(packId);
 if(presentation?.revision!==presentationRevision)return refuse(409,'visual-revision-stale');
 for(const e of matches){const a=presentation.assets?.[e.assetId];if(!a||a.kind!==e.kind||!a.sourceEvidence||await sha256(canonicalJSONString(a.sourceEvidence))!==e.sourceEvidenceSha256)return refuse(409,'visual-asset-binding');}
 if(!bucket)return refuse(503,'visual-storage-unavailable');
 try{
  const bytes=await verifyMatches(matches,verifier??verifierFor(bucket),deadline,id!=='manifest');
  if(Date.now()>deadline)return refuse(503,'visual-verification-timeout');
  if(await currentRevision(packId)!==presentationRevision||matches.some(e=>!entries.includes(e)||!validVerifiedVisualAdmission(e)))return refuse(409,'visual-revision-stale');
  if(id==='manifest'){
   const response=json(200,{schema:'fia-verified-visual-manifest@1',packId,presentationRevision,deliveryRevision,files:matches.map(verifiedVisualDescriptor)});
   return request.method==='HEAD'?new Response(null,{status:200,headers:response.headers}):response;
  }
  const e=matches[0];
  return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':e.mime,'Content-Length':String(e.bytes),'ETag':`"${e.sha256}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'none'}});
 }catch(error){const timeout=['visual-verification-timeout','visual-readback-timeout'].includes(error?.message);return refuse(error?.message==='visual-integrity'?409:503,timeout?'visual-verification-timeout':error?.message==='visual-integrity'?'visual-integrity':'visual-verification-unavailable');}
}

export async function serveVerifiedVisual(request,env,options){
 let response;try{response=await bounded(serve(request,env,{...options,deadline:Date.now()+VISUAL_REQUEST_MS}),VISUAL_REQUEST_MS);}catch(error){response=refuse(503,error?.message==='visual-readback-timeout'?'visual-verification-timeout':'visual-authority-unavailable');}
 return response&&request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;
}
