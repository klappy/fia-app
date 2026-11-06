import {canonicalPreparationJSON,preparationHash} from './prepared-audio.js';
const hash=v=>typeof v==='string'&&/^(?!0{64}$)[a-f0-9]{64}$/.test(v);
// The download planner adds selectedSize after verification; it does not change
// the publication binding. Retain every other field in conflict detection.
const bindingIdentity=({selectedSize,...binding})=>canonicalPreparationJSON(binding);
/** Bind only SW-verified, current presentation descriptors to their authored asset.
 * Publisher URLs and source-only/pending metadata never supply a display path. */
export async function bindVerifiedVisuals(files,pack,assets,deliveryRevision){
 const identity=pack.mediaIdentity||{packId:pack.id,revision:pack.revision},result=new Map();
 for(const file of files){
  const p=file?.visualPublication;if(!p)continue;
  const a=assets[p.assetId],ext=file.mime==='image/png'?'png':file.mime==='image/jpeg'?'jpg':null;
  if(p.schema!=='fia-verified-visual@1'||p.packId!==identity.packId||p.presentationRevision!==identity.revision||!a||a.kind!==p.kind||!['image','map'].includes(a.kind)||!a.sourceEvidence||!ext||file.group!=='image'||!hash(file.sha256)||file.sha256!==file.sourceSha256||!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>12582912||file.sourceBytes!==file.bytes||!hash(deliveryRevision)||file.deliveryRevision!==deliveryRevision||!hash(p.sourceEvidenceSha256)||!hash(p.recipeSha256)||!hash(p.pixelsSha256)||!Number.isSafeInteger(p.width)||!Number.isSafeInteger(p.height)||p.width<1||p.height<1||p.width>8192||p.height>8192||p.width*p.height>(ext==='jpg'?2000000:17000000)||file.path!==`/packs/${identity.packId}/visuals/${p.assetId}.${ext}`||file.deliveryURL!==`/v1/verified-visuals/${identity.packId}/${identity.revision}/${deliveryRevision}/${p.assetId}/${file.sha256}`||await preparationHash(canonicalPreparationJSON(a.sourceEvidence))!==p.sourceEvidenceSha256)throw Error('The verified visual binding changed.');
  const previous=result.get(p.assetId);
  if(previous&&bindingIdentity(previous)!==bindingIdentity(file))throw Error('Conflicting verified visual bindings.');
  result.set(p.assetId,file);
 }
 return result;
}
export const visualSourcePath=(assetId,asset,files)=>files.get(assetId)?.path||asset?.src;
