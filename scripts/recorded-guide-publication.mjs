import {createHash} from 'node:crypto';
import {validateRecordedAudioEntry} from '../apps/web/src/lib/media-delivery.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const digest=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const positive=n=>Number.isSafeInteger(n)&&n>0;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=(o,n)=>{if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).sort().join(',')!==n.split(',').sort().join(','))throw Error('Unknown or missing recorded guide field.');};
const text=s=>typeof s==='string'&&s.length>0;
const https=s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash;}catch{return false;}};
// This is a publication verifier. Recognition evidence alone never accepts a range.
export function verifyRecordedGuideReplacement({entry,ledger,pack,descriptor,file,readEvidence}){
 validateRecordedAudioEntry(entry);
 keys(ledger,'schema,packId,presentationRevision,script,recording,transcript,drift,mappings');
 if(ledger.schema!=='fia-recorded-guide-ranges@1'||ledger.packId!==descriptor.id||ledger.presentationRevision!==descriptor.revision||!Array.isArray(ledger.mappings)||!ledger.mappings.length)throw Error('Recorded guide ledger identity mismatch.');
 const {script,recording,transcript,drift}=ledger;
 keys(script,'fileSha256,contentSha256,repository,commit,path');keys(recording,'url,sha256,bytes,duration,publisherStepVersion,rightsEvidenceSha256');keys(transcript,'sha256,wordTimestampsSha256,method,modelRevision,clockDomain,verbatim');keys(drift,'reportSha256,scriptSha256,transcriptSha256,reviewEvidenceSha256');
 if(!digest(script.fileSha256)||!digest(script.contentSha256)||!text(script.repository)||!/^[a-f0-9]{40}$/.test(script.commit)||!text(script.path)||script.path.startsWith('/')||script.path.split('/').includes('..')||!https(recording.url)||!digest(recording.sha256)||!positive(recording.bytes)||!Number.isFinite(recording.duration)||recording.duration<=0||!text(recording.publisherStepVersion)||!digest(recording.rightsEvidenceSha256)||!digest(transcript.sha256)||!digest(transcript.wordTimestampsSha256)||!text(transcript.method)||!text(transcript.modelRevision)||!text(transcript.clockDomain)||transcript.verbatim!==true||!digest(drift.reportSha256)||!digest(drift.reviewEvidenceSha256)||drift.scriptSha256!==script.contentSha256||drift.transcriptSha256!==transcript.sha256)throw Error('Invalid recorded guide provenance.');
 const raw=sha=>{if(!digest(sha))throw Error('Invalid recording evidence hash.');const bytes=readEvidence(sha);if(hash(bytes)!==sha)throw Error('Recording evidence hash mismatch.');return bytes;};
 const evidence=sha=>JSON.parse(raw(sha));
 raw(script.fileSha256);raw(script.contentSha256);raw(transcript.sha256);raw(drift.reportSha256);
 const words=evidence(transcript.wordTimestampsSha256);
 if(words.recordingSha256!==recording.sha256||words.transcriptSha256!==transcript.sha256||words.clockDomain!==transcript.clockDomain||!Array.isArray(words.words)||!words.words.length)throw Error('Word timestamp evidence mismatch.');
 let previous=-1;for(const word of words.words){if(!text(word.text)||!Number.isFinite(word.startSeconds)||!Number.isFinite(word.endSeconds)||word.startSeconds<previous||word.startSeconds<0||word.endSeconds<=word.startSeconds||word.endSeconds>recording.duration)throw Error('Invalid recognized word timestamp.');previous=word.startSeconds;}
 const rights=evidence(recording.rightsEvidenceSha256),review=evidence(drift.reviewEvidenceSha256);
 if(rights.status!=='accepted'||rights.recordingSha256!==recording.sha256||rights.recordingUrl!==recording.url||review.status!=='accepted'||review.reportSha256!==drift.reportSha256||review.scriptSha256!==script.contentSha256||review.transcriptSha256!==transcript.sha256)throw Error('Recorded guide rights or drift review incomplete.');
 const ids=new Set(),activities=new Set(),paths=new Set();let previousRangeEnd=0,previousWordEnd=0;
 for(const row of ledger.mappings){
  keys(row,'id,activityId,sourceTextSha256,logicalAudio,wordSpan,sourceRange,acceptance');keys(row.logicalAudio,'path,sha256,bytes');keys(row.wordSpan,'first,lastExclusive');keys(row.sourceRange,'startSeconds,endSeconds,clockDomain');keys(row.acceptance,'recipeRevision,evidenceSha256,status');
  const activity=pack.activities.find(a=>a.id===row.activityId),r=row.sourceRange,w=row.wordSpan;
  if(!text(row.id)||ids.has(row.id)||activities.has(row.activityId)||paths.has(row.logicalAudio.path)||!activity||!['guide','discussion'].includes(activity.kind)||!text(activity.sourceUnitId)||activity.audioSrc!==row.logicalAudio.path||!digest(row.sourceTextSha256)||hash(activity.sourceText||'')!==row.sourceTextSha256||!digest(row.logicalAudio.sha256)||!positive(row.logicalAudio.bytes)||!Number.isSafeInteger(w.first)||!Number.isSafeInteger(w.lastExclusive)||w.first<0||w.lastExclusive<=w.first||w.lastExclusive>words.words.length||r.clockDomain!==transcript.clockDomain||!Number.isFinite(r.startSeconds)||!Number.isFinite(r.endSeconds)||r.startSeconds<previousRangeEnd||w.first<previousWordEnd||r.startSeconds<0||r.endSeconds<=r.startSeconds||r.endSeconds>recording.duration||words.words.slice(w.first,w.lastExclusive).some(word=>word.startSeconds<r.startSeconds||word.endSeconds>r.endSeconds)||row.acceptance.status!=='accepted'||!text(row.acceptance.recipeRevision)||!digest(row.acceptance.evidenceSha256))throw Error('Invalid or unaccepted recorded guide range.');
  const accepted=evidence(row.acceptance.evidenceSha256),{acceptance,...mapping}=row;
  if(accepted.status!=='accepted'||accepted.recipeRevision!==acceptance.recipeRevision||accepted.packId!==descriptor.id||accepted.presentationRevision!==descriptor.revision||!equal(accepted.mapping,mapping)||!equal(accepted.script,script)||!equal(accepted.recording,recording)||!equal(accepted.transcript,transcript)||!equal(accepted.drift,drift))throw Error('Recorded range acceptance evidence mismatch.');
  ids.add(row.id);activities.add(row.activityId);paths.add(row.logicalAudio.path);previousRangeEnd=r.endSeconds;previousWordEnd=w.lastExclusive;
 }
 const row=ledger.mappings.find(r=>r.id===entry.audioReplacement.ledgerEntryId),logical=entry.audioReplacement.logicalSource;
 if(!row||row.logicalAudio.path!==entry.path||file.group!=='audio'||file.path!==entry.path||file.sha256!==logical.sha256||file.bytes!==logical.bytes||row.logicalAudio.sha256!==file.sha256||row.logicalAudio.bytes!==file.bytes||entry.source.url!==recording.url||entry.source.sha256!==recording.sha256||entry.source.bytes!==recording.bytes)throw Error('Recorded guide logical/source binding mismatch.');
 const t=entry.timing,d=entry.delivery,m=t.mapping;
 const measured=evidence(t.mappingEvidenceSha256);
 if(measured.status!=='accepted'||measured.sourceAudioSha256!==recording.sha256||measured.deliveryAudioSha256!==d.sha256||!equal(measured.mapping,m)||measured.sourceClockDomain!==transcript.clockDomain||measured.deliveryDuration!==d.duration)throw Error('Recorded guide clock mapping is not measured.');
 const range={startSeconds:row.sourceRange.startSeconds*m.scale+m.offsetSeconds,endSeconds:row.sourceRange.endSeconds*m.scale+m.offsetSeconds};
 if(!equal(entry.playbackRange,range))throw Error('Recorded guide playback range mapping mismatch.');
 return {logicalSourceSha256:logical.sha256,logicalSourceBytes:logical.bytes,sourceBytes:recording.bytes,recordingLedgerEntryId:row.id,duration:d.duration,playbackRange:range};
}
