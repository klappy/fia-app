import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {decodeVisual,sniffRaster} from './visual-decode.mjs';
import {VISUAL_ORIGINAL_RECIPE,VISUAL_ORIGINAL_RECIPE_SHA256} from './visual-original.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const BUNDLED_VISUAL_AUTHORITY=Object.freeze({
 runtimeAllowlistSha256:'1d7558926207d15ee800079182596c49939a9939631e2c43de37afb13680c495',
 approvedPublicationSha256:'ccd72f23c23f932651b500b730b285f32fabd37e50037b5af91d8881f1403975',
 markArchiveSha256:'48f8c768b108f2b9977048db26fa54c82af4eea7f54c66fa650ef84f7d61ecd7',
 lukeArchiveSha256:'98537437857e748d48ce8ad639c95a6b9a8b61b315594ffc1b94328fc0df0283'});
function pinned(bytes,pin){if(!(bytes instanceof Uint8Array)||hash(bytes)!==pin)throw Error('bundled-visual-authority-pin');return JSON.parse(Buffer.from(bytes));}
function archive(bytes,pin){if(!(bytes instanceof Uint8Array)||hash(bytes)!==pin)throw Error('bundled-visual-archive-pin');return JSON.parse(gunzipSync(bytes,{maxOutputLength:134217728}));}
function identity(resource){const revision=resource?.titleProvenance?.revision;if(!resource?.url?.startsWith('https://')||!resource.sourceFile||!/^[a-f0-9]{64}$/.test(resource.sourceFileSha256)||!/^[a-f0-9]{40}$/.test(revision))return null;return {url:resource.url,sourceFile:resource.sourceFile,sourceFileSha256:resource.sourceFileSha256,revision};}
/** Read-only evidence builder. No receipt, original-store write or publication admission is created.
 * Pinned publication proves the local payload's existing use, not a new source-to-screen reuse review.
 */
export async function buildBundledVisualEvidence({allowlistBytes,publicationBytes,markArchiveBytes,lukeArchiveBytes,payloads}){
 const allowlist=pinned(allowlistBytes,BUNDLED_VISUAL_AUTHORITY.runtimeAllowlistSha256),publication=pinned(publicationBytes,BUNDLED_VISUAL_AUTHORITY.approvedPublicationSha256);
 const mark=archive(markArchiveBytes,BUNDLED_VISUAL_AUTHORITY.markArchiveSha256),luke=archive(lukeArchiveBytes,BUNDLED_VISUAL_AUTHORITY.lukeArchiveSha256);
 if(mark.revision!==luke.revision)throw Error('bundled-visual-source-revision');
 const packs={...mark.packs,...luke.packs};if(Object.keys(packs).length!==330)throw Error('bundled-visual-corpus');
 const entries=[];
 for(const asset of Object.values(publication.assets).filter(a=>['image','map'].includes(a.kind)&&a.src?.startsWith('/assets/mark-1-1-13/'))){
  const pin=allowlist.files.find(f=>f.group==='pack-media'&&'/'+f.path===asset.src),bytes=payloads?.[asset.src];
  if(!pin||!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>VISUAL_ORIGINAL_RECIPE.limits.maxBytes||hash(bytes)!==pin.sha256)throw Error('bundled-visual-byte-pin');
  const mime=sniffRaster(bytes);if((asset.src.endsWith('.jpg')&&mime!=='image/jpeg')||(asset.src.endsWith('.png')&&mime!=='image/png'))throw Error('bundled-visual-mime');
  const decoded=await decodeVisual(bytes,{mime,limits:{...VISUAL_ORIGINAL_RECIPE.limits,formats:VISUAL_ORIGINAL_RECIPE.formats}});
  const collection=asset.kind==='map'?'maps':'images',source=packs['eng.MRK-1-1-13'].resources[collection].find(r=>r.id===asset.id),sourceIdentity=identity(source);
  if(!sourceIdentity)throw Error('bundled-visual-source-identity');
  const rights=packs['eng.MRK-1-1-13'].rights.sources.find(r=>r.collection===(asset.kind==='map'?'FIAMaps':'FIAImages'));
  if(!rights?.licence?.url?.startsWith('https://')||!rights.holders?.length||rights.revision!==sourceIdentity.revision)throw Error('bundled-visual-rights-lineage');
  const candidatePackIds=Object.entries(packs).filter(([,p])=>p.resources[collection].some(r=>JSON.stringify(identity(r))===JSON.stringify(sourceIdentity))).map(([id])=>id).sort();
  entries.push({assetId:asset.id,kind:asset.kind,path:asset.src,sha256:pin.sha256,bytes:bytes.length,mime,
   evidenceKind:'verified-existing-published-bundle',publicationSha256:BUNDLED_VISUAL_AUTHORITY.approvedPublicationSha256,
   custody:{kind:'existing-static-payload',freshPublisherObservation:false},
   decode:{recipeSha256:VISUAL_ORIGINAL_RECIPE_SHA256,...decoded},sourceIdentity,rights:{sourceSnapshot:mark.revision,recordSha256:hash(JSON.stringify(rights)),record:rights},
   review:{status:'missing',required:'independent exact-source-to-screen bundled reuse review'},candidatePackIds,
   reuse:{state:'blocked',reason:'bundled-reuse-review-missing'},grantsFreshOriginalCustody:false,grantsPublicationAdmission:false});
 }
 if(entries.length!==8)throw Error('bundled-visual-payload-set');
 return {schema:'fia-bundled-visual-evidence@1',authority:BUNDLED_VISUAL_AUTHORITY,entries,verifiedBundlePayloads:entries.length,candidateBindings:entries.reduce((n,e)=>n+e.candidatePackIds.length,0),newReuseAdmissions:0};
}
