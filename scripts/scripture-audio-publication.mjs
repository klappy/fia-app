import {createHash} from 'node:crypto';
import {validateScriptureAudioEntry,validateScriptureAlignment,validateScriptureRangeOnlyEntry} from '../apps/web/src/lib/media-delivery.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
const digest=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=(o,k)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).sort().join(',')!==k.split(',').sort().join(','))throw Error('Unknown Scripture publication field.');};
export function verifyScriptureAudioReplacement({entry,ledger,pack,descriptor,file,readEvidence,readAlignment}){
 validateScriptureAudioEntry(entry);keys(ledger,'schema,packId,presentationRevision,entries');
 if(ledger.schema!=='fia-scripture-audio-sources@1'||ledger.packId!==descriptor.id||ledger.presentationRevision!==descriptor.revision||!Array.isArray(ledger.entries)||!ledger.entries.length)throw Error('Scripture ledger identity mismatch.');
 const raw=h=>{if(!digest(h))throw Error('Invalid Scripture evidence hash.');const b=readEvidence(h);if(hash(b)!==h)throw Error('Scripture evidence hash mismatch.');return b;};
 const evidence=h=>JSON.parse(raw(h));const ids=new Set(),assets=new Set();
 for(const row of ledger.entries){keys(row,'id,assetId,logicalAudio,recording,sourceRange,review');keys(row.logicalAudio,'path,sha256,bytes');keys(row.recording,'url,sha256,bytes,duration,rightsEvidenceSha256');keys(row.sourceRange,'startSeconds,endSeconds');keys(row.review,'recipeRevision,evidenceSha256');
  const asset=pack.assets[row.assetId],r=row.recording,s=row.sourceRange;
  if(!row.id||ids.has(row.id)||assets.has(row.assetId)||asset?.kind!=='scripture'||asset.descriptionAudio!==row.logicalAudio.path||!digest(row.logicalAudio.sha256)||!Number.isSafeInteger(row.logicalAudio.bytes)||row.logicalAudio.bytes<=0||!digest(r.sha256)||!Number.isSafeInteger(r.bytes)||r.bytes<=0||!Number.isFinite(r.duration)||r.duration<=0||!/^https:\/\//.test(r.url)||!Number.isFinite(s.startSeconds)||!Number.isFinite(s.endSeconds)||s.startSeconds<0||s.endSeconds<=s.startSeconds||s.endSeconds>r.duration||!row.review.recipeRevision)throw Error('Invalid Scripture source row.');
  const rights=evidence(r.rightsEvidenceSha256),accepted=evidence(row.review.evidenceSha256),{review,...binding}=row;
  if(rights.status!=='accepted'||rights.recordingSha256!==r.sha256||rights.recordingUrl!==r.url||accepted.status!=='accepted'||accepted.packId!==descriptor.id||accepted.presentationRevision!==descriptor.revision||accepted.recipeRevision!==review.recipeRevision||!equal(accepted.entry,binding))throw Error('Scripture source acceptance mismatch.');
  // Accepted review names immutable raw recognition, exact displayed text and drift/range reports.
  for(const name of ['transcriptSha256','textSha256','driftReportSha256','rangeEvidenceSha256'])raw(accepted[name]);
  ids.add(row.id);assets.add(row.assetId);
 }
 const ref=entry.scriptureReplacement,row=ledger.entries.find(r=>r.id===ref.ledgerEntryId),logical=ref.logicalSource;
 if(!row||row.assetId!==ref.assetId||row.logicalAudio.path!==entry.path||file.group!=='audio'||file.path!==entry.path||file.sha256!==logical.sha256||file.bytes!==logical.bytes||row.logicalAudio.sha256!==file.sha256||row.logicalAudio.bytes!==file.bytes||entry.source.url!==row.recording.url||entry.source.sha256!==row.recording.sha256||entry.source.bytes!==row.recording.bytes)throw Error('Scripture logical/source binding mismatch.');
 const t=entry.timing,d=entry.delivery,m=t.mapping,clock=evidence(t.mappingEvidenceSha256);
 if(clock.status!=='accepted'||clock.sourceAudioSha256!==entry.source.sha256||clock.deliveryAudioSha256!==d.sha256||clock.deliveryDuration!==d.duration||clock.sourceClockDomain!=='decoded-pcm-seconds'||!equal(clock.mapping,m))throw Error('Scripture measured clock mismatch.');
 const range={startSeconds:row.sourceRange.startSeconds*m.scale+m.offsetSeconds,endSeconds:row.sourceRange.endSeconds*m.scale+m.offsetSeconds};if(!equal(range,entry.playbackRange))throw Error('Scripture range mapping mismatch.');
 const aRef=entry.scriptureAlignment,bytes=readAlignment(aRef.url);if(bytes.length!==aRef.bytes||hash(bytes)!==aRef.sha256)throw Error('Scripture alignment hash mismatch.');
 const alignment=JSON.parse(bytes);validateScriptureAlignment(alignment,{audioSha256:d.sha256,duration:d.duration,assetId:ref.assetId});
 const asset=pack.assets[ref.assetId];
 if(alignment.sourceSha256!==asset.alignment?.sourceSha256||alignment.verses.length!==asset.alignment.verses.length||alignment.verses.some((v,i)=>v.verse!==asset.alignment.verses[i].verse||v.text!==asset.alignment.verses[i].text||v.sourceId!==asset.alignment.verses[i].sourceId||v.start<range.startSeconds||v.end>range.endSeconds))throw Error('Scripture displayed text or range changed.');
 const qualified=evidence(aRef.evidenceSha256);
 if(qualified.status!=='accepted'||qualified.sourceAudioSha256!==entry.source.sha256||qualified.deliveryAudioSha256!==d.sha256||qualified.alignmentSha256!==aRef.sha256||qualified.clockEvidenceSha256!==t.mappingEvidenceSha256||!equal(qualified.playbackRange,range)||!equal(qualified.mapping,m))throw Error('Scripture alignment qualification mismatch.');
 return {logicalSourceSha256:logical.sha256,logicalSourceBytes:logical.bytes,sourceBytes:entry.source.bytes,scriptureLedgerEntryId:row.id,scriptureAssetId:row.assetId,duration:d.duration,playbackRange:range,scriptureAlignment:alignment,scriptureAlignmentSha256:aRef.sha256};
}

export function scriptureCanonicalTextBytes(asset){if(typeof asset?.text!=='string'||!Array.isArray(asset.verses)||!asset.verses.length)throw Error('Scripture canonical text missing.');return Buffer.from(JSON.stringify({text:asset.text,verses:asset.verses}));}
export function scriptureSourceEvidenceBytes(asset){if(!asset?.sourceEvidence||typeof asset.sourceEvidence!=='object')throw Error('Scripture source evidence missing.');return Buffer.from(JSON.stringify(asset.sourceEvidence));}
// Like the existing replacement verifier, authority is the independently reviewed
// release input set. Hash joins detect substitutions; these functions do not mint
// reviewer authority or admit unreviewed browser evidence.
export function verifyScriptureRangeOnly({entry,ledger,pack,descriptor,readEvidence}){
 validateScriptureRangeOnlyEntry(entry);keys(ledger,'schema,packId,presentationRevision,entries');
 if(ledger.schema!=='fia-scripture-range-sources@1'||ledger.packId!==descriptor.id||ledger.presentationRevision!==descriptor.revision||!Array.isArray(ledger.entries)||!ledger.entries.length)throw Error('Scripture range ledger identity mismatch.');
 const raw=h=>{if(!digest(h))throw Error('Invalid Scripture evidence hash.');const bytes=readEvidence(h);if(hash(bytes)!==h)throw Error('Scripture evidence hash mismatch.');return bytes;},evidence=h=>JSON.parse(raw(h));
 const ids=new Set(),assets=new Set();for(const row of ledger.entries){keys(row,'id,assetId,canonicalTextSha256,sourceEvidenceSha256,recording,sourceRange,review');keys(row.recording,'url,sha256,bytes,duration,rightsEvidenceSha256');keys(row.sourceRange,'startSeconds,endSeconds');keys(row.review,'recipeRevision,evidenceSha256');const asset=pack.assets[row.assetId],r=row.recording,range=row.sourceRange;
 if(typeof row.id!=='string'||!row.id||ids.has(row.id)||assets.has(row.assetId)||asset?.kind!=='scripture'||asset.descriptionAudio||asset.alignment||typeof asset.text!=='string'||!Array.isArray(asset.verses)||!asset.verses.length||!asset.sourceEvidence||hash(scriptureCanonicalTextBytes(asset))!==row.canonicalTextSha256||hash(scriptureSourceEvidenceBytes(asset))!==row.sourceEvidenceSha256||!digest(r.sha256)||!Number.isSafeInteger(r.bytes)||r.bytes<=0||!Number.isFinite(r.duration)||r.duration<=0||!/^https:\/\//.test(r.url)||!Number.isFinite(range.startSeconds)||!Number.isFinite(range.endSeconds)||range.startSeconds<0||range.endSeconds<=range.startSeconds||range.endSeconds>r.duration||typeof row.review.recipeRevision!=='string'||!row.review.recipeRevision)throw Error('Invalid range-only Scripture source binding.');
 const rights=evidence(r.rightsEvidenceSha256),accepted=evidence(row.review.evidenceSha256),{review,...binding}=row;
 if(rights.status!=='accepted'||rights.recordingSha256!==r.sha256||rights.recordingUrl!==r.url||accepted.schema!=='fia-scripture-source-range-review@1'||accepted.status!=='accepted'||accepted.packId!==descriptor.id||accepted.presentationRevision!==descriptor.revision||accepted.recipeRevision!==review.recipeRevision||!equal(accepted.entry,binding)||accepted.textSha256!==row.canonicalTextSha256)throw Error('Scripture source range acceptance mismatch.');
 for(const name of ['transcriptSha256','textSha256','driftReportSha256','rangeEvidenceSha256'])raw(accepted[name]);ids.add(row.id);assets.add(row.assetId);}
 const ref=entry.scriptureRangeOnly,row=ledger.entries.find(r=>r.id===ref.ledgerEntryId);if(!row||row.assetId!==ref.assetId||entry.path!==`/audio/scripture/${descriptor.id}/${ref.assetId}.opus`||!equal(entry.source,{url:row.recording.url,sha256:row.recording.sha256,bytes:row.recording.bytes}))throw Error('Scripture range source mismatch.');
 const mapping=entry.timing.mapping,clock=evidence(entry.timing.mappingEvidenceSha256),d=entry.delivery;
 if(clock.status!=='accepted'||clock.sourceAudioSha256!==entry.source.sha256||clock.deliveryAudioSha256!==d.sha256||clock.deliveryDuration!==d.duration||clock.sourceClockDomain!=='decoded-pcm-seconds'||!equal(clock.mapping,mapping))throw Error('Scripture measured clock mismatch.');
 const range={startSeconds:row.sourceRange.startSeconds*mapping.scale+mapping.offsetSeconds,endSeconds:row.sourceRange.endSeconds*mapping.scale+mapping.offsetSeconds};if(!equal(range,entry.playbackRange))throw Error('Scripture passage range mapping mismatch.');
 const qualified=evidence(entry.rangeReviewSha256);
 if(qualified.schema!=='fia-scripture-passage-review@1'||qualified.status!=='accepted'||qualified.packId!==descriptor.id||qualified.presentationRevision!==descriptor.revision||qualified.assetId!==ref.assetId||qualified.sourceReviewSha256!==row.review.evidenceSha256||qualified.canonicalTextSha256!==row.canonicalTextSha256||qualified.sourceEvidenceSha256!==row.sourceEvidenceSha256||!equal(qualified.source,entry.source)||!equal(qualified.delivery,d)||qualified.clockEvidenceSha256!==entry.timing.mappingEvidenceSha256||!equal(qualified.playbackRange,range)||qualified.verseHighlighting!==false||qualified.wordHighlighting!==false)throw Error('Scripture passage qualification mismatch.');
 raw(qualified.browserEvidenceSha256);
 return {sourceBytes:entry.source.bytes,scriptureLedgerEntryId:row.id,scriptureAssetId:row.assetId,scripturePlaybackMode:'passage-only',scriptureHighlighting:'disabled',scriptureAlignment:null,scriptureRangeReviewSha256:entry.rangeReviewSha256,scriptureCanonicalTextSha256:row.canonicalTextSha256,scriptureSourceEvidenceSha256:row.sourceEvidenceSha256,scriptureSourceRangeReviewSha256:row.review.evidenceSha256,duration:d.duration,playbackRange:range};
}
