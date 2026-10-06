import assert from 'node:assert/strict';
import {verifyScriptureRangeOnly} from '../../scripts/scripture-audio-publication.mjs';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
// The local artifact is immutable source; transformed bytes are identified by the
// exact independently reviewed sidecar, not falsely compared to the raw file.
export function verifyManifestFile(file,raw,sidecar,revision,readAlignment,publication){
 if(!file.deliveryURL){assert.equal(raw.length,file.bytes);assert.equal(hash(raw),file.sha256);return;}
 assert.ok(sidecar,'Missing reviewed delivery sidecar');
 const entry=sidecar.entries.find(e=>e.path===file.path);assert.ok(entry,'Unreviewed derivative path');
 if(file.variants){
  assert.ok([3,4,5,6].includes(sidecar.schema));assert.equal(file.defaultSize,entry.defaultSize);assert.deepEqual(Object.keys(file.variants).sort(),Object.keys(entry.variants).sort());
  const {variants,defaultSize,...base}=entry;
  for(const [size,variant] of Object.entries(file.variants))verifyManifestFile(variant,raw,{...sidecar,entries:[{...base,...entry.variants[size]}]},revision,readAlignment,publication);
 }

 if(entry.scriptureRangeOnly){
  assert.ok([5,6].includes(sidecar.schema));assert.equal(raw,null,'Range-only Scripture must not shadow a local file');assert.equal(file.group,'audio');assert.ok(publication,'Missing canonical publication context');
  const ledgerBytes=readAlignment(sidecar.scriptureSourceLedger.url);assert.equal(ledgerBytes.length,sidecar.scriptureSourceLedger.bytes);assert.equal(hash(ledgerBytes),sidecar.scriptureSourceLedger.sha256);
  const expected=verifyScriptureRangeOnly({entry,ledger:JSON.parse(ledgerBytes),pack:publication.pack,descriptor:publication.descriptor,readEvidence:sha=>readAlignment(`/content/scripture-evidence/${sha}.json`)});
  for(const [key,value] of Object.entries(expected))assert.deepEqual(file[key],value,key);
  assert.equal(file.scriptureLedgerSha256,sidecar.scriptureSourceLedger.sha256);
  for(const key of ['logicalSourceBytes','logicalSourceSha256','recordingLedgerEntryId','recordingLedgerSha256','scriptureAlignmentSha256'])assert.equal(file[key],undefined,key);
 }else if(entry.scriptureReplacement){
  assert.equal(sidecar.schema,5);assert.equal(file.group,'audio');const logical=entry.scriptureReplacement.logicalSource;
  assert.equal(raw.length,logical.bytes);assert.equal(hash(raw),logical.sha256);assert.equal(file.logicalSourceBytes,logical.bytes);assert.equal(file.logicalSourceSha256,logical.sha256);assert.equal(file.sourceBytes,entry.source.bytes);
  assert.equal(file.scriptureLedgerEntryId,entry.scriptureReplacement.ledgerEntryId);assert.equal(file.scriptureAssetId,entry.scriptureReplacement.assetId);assert.equal(file.scriptureLedgerSha256,sidecar.scriptureSourceLedger.sha256);
  assert.equal(file.scriptureAlignmentSha256,entry.scriptureAlignment.sha256);assert.equal(typeof readAlignment,'function');const alignmentBytes=readAlignment(entry.scriptureAlignment.url);assert.equal(alignmentBytes.length,entry.scriptureAlignment.bytes);assert.equal(hash(alignmentBytes),entry.scriptureAlignment.sha256);assert.deepEqual(file.scriptureAlignment,JSON.parse(alignmentBytes));assert.equal(file.scriptureAlignment.audioSha256,entry.delivery.sha256);assert.equal(file.scriptureAlignment.clockDomain,'delivery-media-seconds');assert.equal(file.duration,entry.delivery.duration);assert.deepEqual(file.playbackRange,entry.playbackRange);
 }else if(entry.audioReplacement){
  assert.ok([4,5].includes(sidecar.schema));assert.equal(file.group,'audio');assert.ok(!entry.logicalSource);
  const logical=entry.audioReplacement.logicalSource;
  assert.equal(raw.length,logical.bytes);assert.equal(hash(raw),logical.sha256);
  assert.equal(file.logicalSourceBytes,logical.bytes);assert.equal(file.logicalSourceSha256,logical.sha256);assert.equal(file.sourceBytes,entry.source.bytes);
  assert.equal(file.recordingLedgerEntryId,entry.audioReplacement.ledgerEntryId);const selected=entry.audioReplacement.recordingLedgerSha256||sidecar.recordingLedger.sha256;assert.ok([sidecar.recordingLedger,...(sidecar.recordingLedgers||[])].some(r=>r.sha256===selected));assert.equal(file.recordingLedgerSha256,selected);
  assert.equal(file.duration,entry.delivery.duration);assert.deepEqual(file.playbackRange,entry.playbackRange);
  assert.ok(Number.isFinite(file.playbackRange.startSeconds)&&Number.isFinite(file.playbackRange.endSeconds)&&file.playbackRange.startSeconds>=0&&file.playbackRange.endSeconds>file.playbackRange.startSeconds&&file.playbackRange.endSeconds<=file.duration);
 }else if(entry.logicalSource){
  assert.ok([2,3,4,5].includes(sidecar.schema));assert.equal(file.group,'video');
  assert.equal(raw.length,entry.logicalSource.bytes);assert.equal(hash(raw),entry.logicalSource.sha256);
  assert.equal(file.logicalSourceBytes,entry.logicalSource.bytes);assert.equal(file.logicalSourceSha256,entry.logicalSource.sha256);
  assert.equal(file.sourceBytes,entry.source.bytes);
 }else{assert.equal(raw.length,entry.source.bytes);assert.equal(hash(raw),entry.source.sha256);assert.equal(new URL(entry.source.url).pathname,file.path);}
 if(!entry.audioReplacement&&!entry.scriptureReplacement&&!entry.scriptureRangeOnly){assert.equal(file.playbackRange,undefined);assert.equal(file.recordingLedgerEntryId,undefined);assert.equal(file.recordingLedgerSha256,undefined);}
 assert.equal(file.sourceSha256,entry.source.sha256);
 assert.equal(file.deliveryRevision,revision);assert.equal(file.deliveryURL,entry.delivery.url);
 assert.equal(file.sha256,entry.delivery.sha256);assert.equal(file.bytes,entry.delivery.bytes);assert.equal(file.mime,entry.delivery.mime);assert.equal(file.group,entry.delivery.kind);assert.deepEqual(file.timing,entry.timing);
}
