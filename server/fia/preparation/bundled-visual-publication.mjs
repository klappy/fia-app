import review from './bundled-visual-review.json' with {type:'json'};
import payloads from './bundled-visual-payloads.json' with {type:'json'};
import {createHash} from 'node:crypto';
import {canonicalJSONString} from './contract.mjs';
import {VISUAL_ORIGINAL_RECIPE_SHA256} from './visual-original.mjs';
import {createVerifiedVisualVerifier,VISUAL_REQUEST_MS} from './verified-visual-publication.mjs';
export const BUNDLED_VISUAL_REVIEW_SHA256='2c121c2a18c6736967c272b4a3e91cfa9c62699d0ad97ca30e80ea8e6d87a988';
const REVIEW_CANONICAL='f4a501f0db1ee3cd0e6cb9c34b18a940e64c7fadc80f45de74213e010a88acfe';
const hash=value=>createHash('sha256').update(canonicalJSONString(value)).digest('hex');
if(hash(review)!==REVIEW_CANONICAL||review.rows.length!==46||payloads.length!==8)throw Error('bundled-review-pin');
const ROOT='/v1/bundled-visuals/',HASH=/^[a-f0-9]{64}$/;
const rows=review.rows.map(row=>{const p=payloads.find(p=>p.assetId===row.assetId);if(!p||p.sha256!==row.sha256||p.bytes!==row.bytes||p.pixelsSha256!==row.pixelsSha256||p.staticPath!==`/assets/mark-1-1-13/${row.assetId}.${p.mime==='image/png'?'png':'jpg'}`)throw Error('bundled-payload-review-mismatch');return Object.freeze({...row,...p,assetSha256:hash(row.asset),sourceEvidenceSha256:row.packId==='eng.MRK-1-1-13'?null:hash(row.asset.sourceEvidence),sourceKey:p.staticPath,recipeSha256:VISUAL_ORIGINAL_RECIPE_SHA256});});
if(new Set(rows.map(r=>r.packId+':'+r.assetId)).size!==46)throw Error('bundled-review-duplicate');
export function bundledVisualDescriptor(e){const ext=e.mime==='image/png'?'png':'jpg';return {path:`/packs/${e.packId}/visuals/${e.assetId}.${ext}`,group:'image',sha256:e.sha256,bytes:e.bytes,mime:e.mime,sourceSha256:e.sha256,sourceBytes:e.bytes,deliveryRevision:BUNDLED_VISUAL_REVIEW_SHA256,deliveryURL:`${ROOT}${e.packId}/${e.revision}/${BUNDLED_VISUAL_REVIEW_SHA256}/${e.assetId}/${e.sha256}`,visualPublication:{schema:'fia-bundled-visual@1',custody:'bundled-static',packId:e.packId,presentationRevision:e.revision,assetId:e.assetId,kind:e.asset.kind,reviewSha256:BUNDLED_VISUAL_REVIEW_SHA256,bindingKind:e.packId==='eng.MRK-1-1-13'?'approved-default':'canonical-source',approvedPublicationSha256:e.packId==='eng.MRK-1-1-13'?'ccd72f23c23f932651b500b730b285f32fabd37e50037b5af91d8881f1403975':null,assetSha256:e.assetSha256,rightsRecordSha256:e.rightsRecordSha256,sourceEvidenceSha256:e.sourceEvidenceSha256,recipeSha256:e.recipeSha256,pixelsSha256:e.pixelsSha256,width:e.width,height:e.height}};}
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const refuse=(status,reason)=>json(status,{status:'unavailable',reason});
const VERIFIERS=new WeakMap();
function verifierFor(assets,origin){let v=VERIFIERS.get(assets);if(v)return v;const bucket={async get(path){if(!payloads.some(p=>p.staticPath===path))throw Error('bundled-static-path');const response=await assets.fetch(new Request(new URL(path,origin),{redirect:'manual'}));const p=payloads.find(p=>p.staticPath===path);if(response.status!==200||response.headers.get('Content-Type')?.split(';')[0]!==p.mime||Number(response.headers.get('Content-Length'))!==p.bytes){response.body?.cancel().catch(()=>{});throw Error('bundled-static-response');}return {size:p.bytes,body:response.body};}};v=createVerifiedVisualVerifier({bucket});VERIFIERS.set(assets,v);return v;}
// Only fixed reviewed static paths are read through ASSETS. No publisher request or R2 custody is implied.
export async function serveBundledVisual(request,env,{currentRevision,currentPresentation}={}){
 const url=new URL(request.url);if(!url.pathname.startsWith(ROOT)&&url.pathname!==ROOT.slice(0,-1))return null;
 let response,timer;try{response=await Promise.race([serve(request,env,{url,currentRevision,currentPresentation}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('bundled-verification-timeout')),VISUAL_REQUEST_MS);})]);}catch{response=refuse(503,'bundled-visual-verification-unavailable');}finally{clearTimeout(timer);}
 return request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;
}
async function serve(request,env,{url,currentRevision,currentPresentation}){
 if(url.origin!==env.FIA_API_ORIGIN||request.headers.has('Origin')&&request.headers.get('Origin')!==env.FIA_API_ORIGIN)return refuse(403,'untrusted-origin');
 if(!['GET','HEAD'].includes(request.method))return refuse(405,'method-not-allowed');
 if(url.search||url.hash)return refuse(400,'invalid-request');
 if(request.headers.has('Range'))return refuse(416,'range-unsupported');
 const parts=url.pathname.slice(ROOT.length).split('/'),[packId,revision]=parts,manifest=parts.length===3&&parts[2]==='manifest';
 const [, ,reviewRevision,assetId,digest,...rest]=parts;
 if(rest.length||!manifest&&(parts.length!==5||reviewRevision!==BUNDLED_VISUAL_REVIEW_SHA256)||!/^(eng|spa)\.(MRK|LUK)-\d+(?:-\d+)+$/.test(packId)||!HASH.test(revision??'')||!manifest&&(!/^[a-zA-Z0-9_-]+$/.test(assetId??'')||!HASH.test(digest??'')))return refuse(404,'unknown-bundled-visual');
 if(typeof currentRevision!=='function'||await currentRevision(packId)!==revision)return refuse(409,'visual-revision-stale');
 const matches=rows.filter(r=>r.packId===packId&&r.revision===revision&&(manifest||r.assetId===assetId&&r.sha256===digest));if(!matches.length)return refuse(404,'bundled-visual-not-qualified');
 const p=await currentPresentation?.(packId);if(p?.revision!==revision||matches.some(r=>hash(p.assets?.[r.assetId]??null)!==r.assetSha256))return refuse(409,'bundled-visual-authored-asset-mismatch');
 if(!env.ASSETS?.fetch)return refuse(503,'bundled-static-unavailable');
 const verifier=verifierFor(env.ASSETS,env.FIA_API_ORIGIN),deadline=Date.now()+VISUAL_REQUEST_MS;let bytes;
 // Serial verification bounds retained buffers and codec work; shared verifier enforces isolate limits.
 for(const row of matches){const result=await verifier.verify(row,{deadline,retainBytes:!manifest});if(!result.valid)return refuse(409,'bundled-visual-integrity');if(!manifest)bytes=result.bytes;}
 if(await currentRevision(packId)!==revision)return refuse(409,'visual-revision-stale');
 if(manifest)return json(200,{schema:'fia-bundled-visual-manifest@1',custody:'bundled-static',packId,presentationRevision:revision,deliveryRevision:BUNDLED_VISUAL_REVIEW_SHA256,files:matches.map(bundledVisualDescriptor)});
 const row=matches[0];return new Response(bytes,{headers:{'Content-Type':row.mime,'Content-Length':String(row.bytes),'Cache-Control':'private, no-store','ETag':`"${row.sha256}"`,'X-Content-Type-Options':'nosniff','Accept-Ranges':'none'}});
}
