import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
// remuxSha256 maps a reviewed delivery file's sha256 to the sha256 of its exact Ogg Opus -> WebM remux (apps/web/src/lib/opus-webm.js,
// #333): the app plays a ranged Ogg Opus clip as the same packets in WebM, so the native Blob is either the reviewed bytes or that remux.
// The caller computes it from the reviewed bytes it fetched and verified; nothing here trusts the page for it.
export function scriptureBinding({manifest,pack,descriptor,activityId,blobSha256,remuxSha256={}}){
 if(manifest.packId!==descriptor.id||manifest.presentationRevision!==descriptor.revision)throw Error('Scripture manifest belongs to another pack');
 const unit=pack.activities.find(a=>a.id===activityId),asset=pack.assets[unit?.assetId];if(unit?.kind!=='scripture'||asset?.kind!=='scripture'||unit.assetId!=='scripture-BereanStandardBible')throw Error('Wrong canonical Scripture activity');
 const root=manifest.files.find(f=>f.scriptureAssetId===asset.id&&f.scripturePlaybackMode==='passage-only');if(!root)throw Error('No reviewed passage-only Scripture delivery');
 if(!/^[a-f0-9]{64}$/.test(blobSha256||''))throw Error('Native Blob is not the selected Scripture delivery');
 const candidates=[root,...Object.values(root.variants||{})],exact=candidates.find(f=>f.sha256===blobSha256),remuxed=exact?null:candidates.find(f=>/^[a-f0-9]{64}$/.test(remuxSha256[f.sha256]||'')&&remuxSha256[f.sha256]!==f.sha256&&remuxSha256[f.sha256]===blobSha256);
 const selected=exact||remuxed;if(!selected)throw Error('Native Blob is not the selected Scripture delivery');
 const textHash=hash(JSON.stringify({text:asset.text,verses:asset.verses})),sourceHash=hash(JSON.stringify(asset.sourceEvidence));
 if(selected.scriptureCanonicalTextSha256!==textHash||selected.scriptureSourceEvidenceSha256!==sourceHash||selected.scriptureHighlighting!=='disabled'||selected.scriptureAlignment!==null)throw Error('Scripture canonical source or presentation mode changed');
 for(const name of ['sourceSha256','scriptureRangeReviewSha256','scriptureSourceRangeReviewSha256','scriptureLedgerSha256'])if(!/^[a-f0-9]{64}$/.test(selected[name]||''))throw Error('Missing Scripture source/range review');
 const range=selected.playbackRange;if(!range||![range.startSeconds,range.endSeconds,selected.duration].every(Number.isFinite)||range.startSeconds<0||range.endSeconds<=range.startSeconds||range.endSeconds>selected.duration)throw Error('Invalid Scripture range');
 return {activityId,sourceUnitId:asset.id,sourceTextSha256:textHash,sourceEvidenceSha256:sourceHash,sourceAudioSha256:selected.sourceSha256,sha256:selected.sha256,playedSha256:blobSha256,played:remuxed?'webm-remux':'reviewed-bytes',range,rangeReviewSha256:selected.scriptureRangeReviewSha256,highlighting:'disabled'};
}
