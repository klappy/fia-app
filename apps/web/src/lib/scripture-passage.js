import {validatePlaybackRange} from './media-delivery.js';
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export const scripturePassagePins=['scriptureLedgerEntryId','scriptureLedgerSha256','scriptureAssetId','scripturePlaybackMode','scriptureHighlighting','scriptureRangeReviewSha256','scriptureCanonicalTextSha256','scriptureSourceEvidenceSha256','scriptureSourceRangeReviewSha256'];
export function validateScripturePassageFile(file,packId){
 if(file.scripturePlaybackMode!=='passage-only'||file.scriptureHighlighting!=='disabled'||file.scriptureAlignment!==null||file.scriptureAlignmentSha256!==undefined||file.logicalSourceSha256!==undefined||file.logicalSourceBytes!==undefined||file.recordingLedgerEntryId!==undefined||file.recordingLedgerSha256!==undefined||typeof file.scriptureLedgerEntryId!=='string'||!file.scriptureLedgerEntryId||typeof file.scriptureAssetId!=='string'||!/^[-\w]+$/.test(file.scriptureAssetId)||file.path!==`/audio/scripture/${packId}/${file.scriptureAssetId}.opus`||file.group!=='audio'||file.mime!=='audio/ogg')throw Error('Invalid passage-only Scripture descriptor.');
 for(const key of ['sha256','sourceSha256','deliveryRevision',...scripturePassagePins.filter(k=>k.endsWith('Sha256'))])if(!hash(file[key]))throw Error('Missing Scripture identity pin.');
 for(const key of ['bytes','sourceBytes'])if(!Number.isSafeInteger(file[key])||file[key]<=0)throw Error('Invalid Scripture byte identity.');
 const url=new URL(file.deliveryURL);if(url.origin!=='https://transcode.klappy.dev'||!url.pathname.startsWith('/audio/')||url.username||url.password||url.hash)throw Error('Invalid Scripture delivery origin.');
 validatePlaybackRange(file.playbackRange,file.duration);const t=file.timing;
 if(t?.status!=='verified'||t.sourceAudioSha256!==file.sourceSha256||t.deliveryAudioSha256!==file.sha256||!hash(t.mappingEvidenceSha256)||!Number.isFinite(t.mapping?.scale)||t.mapping.scale<=0||!Number.isFinite(t.mapping?.offsetSeconds)||t.alignment!==undefined||t.alignmentSha256!==undefined)throw Error('Invalid passage-only Scripture clock.');return file;
}
async function digest(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('');}
export async function verifyScripturePassageFile(file,packId,assets){
 validateScripturePassageFile(file,packId);const asset=assets[file.scriptureAssetId];
 if(asset?.kind!=='scripture'||asset.descriptionAudio||typeof asset.text!=='string'||!Array.isArray(asset.verses)||!asset.verses.length||!asset.sourceEvidence||typeof asset.sourceEvidence!=='object')throw Error('Scripture source text is unavailable.');
 if(await digest(JSON.stringify({text:asset.text,verses:asset.verses}))!==file.scriptureCanonicalTextSha256||await digest(JSON.stringify(asset.sourceEvidence))!==file.scriptureSourceEvidenceSha256)throw Error('Scripture passage text or source changed.');return file;
}
export function sameScripturePassageFile(a,b){return ['path','sha256','bytes','sourceSha256','sourceBytes','mime','deliveryURL','deliveryRevision','duration',...scripturePassagePins].every(k=>a?.[k]===b?.[k])&&JSON.stringify(a.timing)===JSON.stringify(b.timing)&&JSON.stringify(a.playbackRange)===JSON.stringify(b.playbackRange)&&a.scriptureAlignment===b.scriptureAlignment;}
