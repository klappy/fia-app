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
async function verify(bucket,e){
 const d=await decodeRetained(bucket,{sha256:e.sha256,bytes:e.bytes,contentType:e.mime,sourceKey:e.sourceKey});
 return d.state==='ready'&&d.recipeSha256===e.recipeSha256&&d.width===e.width&&d.height===e.height&&d.pixelsSha256===e.pixelsSha256;
}
// entries and bucket are trusted composition ports. Neither can come from request JSON or query parameters.
async function serve(request,env,{entries=admissions,bucket=env.FIA_ORIGINALS,currentRevision,currentPresentation,deadline=Date.now()+30000}={}){
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
  for(const e of matches){if(Date.now()>deadline)return refuse(503,'visual-verification-timeout');if(!await verify(bucket,e))return refuse(409,'visual-integrity');}
  if(Date.now()>deadline)return refuse(503,'visual-verification-timeout');
  if(id==='manifest'){
   const response=json(200,{schema:'fia-verified-visual-manifest@1',packId,presentationRevision,deliveryRevision,files:matches.map(verifiedVisualDescriptor)});
   return request.method==='HEAD'?new Response(null,{status:200,headers:response.headers}):response;
  }
  const e=matches[0],object=await bounded(bucket.get(e.sourceKey));
  if(!object||object.size!==e.bytes)return refuse(409,'visual-integrity');
  // The decode just verified this immutable content-addressed key; verify readback again against a replacement race.
  const bytes=new Uint8Array(await bounded(object.arrayBuffer()));
  if(bytes.length!==e.bytes||await sha256(bytes)!==e.sha256)return refuse(409,'visual-integrity');
  return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':e.mime,'Content-Length':String(e.bytes),'ETag':`"${e.sha256}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'none'}});
 }catch{return refuse(503,'visual-verification-unavailable');}
}

export async function serveVerifiedVisual(request,env,options){
 let response;try{response=await bounded(serve(request,env,{...options,deadline:Date.now()+30000}),30000);}catch{response=refuse(503,'visual-authority-unavailable');}
 return response&&request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;
}
