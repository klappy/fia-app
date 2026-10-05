import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
// The local artifact is immutable source; transformed bytes are identified by the
// exact independently reviewed sidecar, not falsely compared to the raw file.
export function verifyManifestFile(file,raw,sidecar,revision){
 if(!file.deliveryURL){assert.equal(raw.length,file.bytes);assert.equal(hash(raw),file.sha256);return;}
 assert.ok(sidecar,'Missing reviewed delivery sidecar');
 const entry=sidecar.entries.find(e=>e.path===file.path);assert.ok(entry,'Unreviewed derivative path');
 if(file.variants){
  assert.ok([3,4].includes(sidecar.schema));assert.equal(file.defaultSize,entry.defaultSize);assert.deepEqual(Object.keys(file.variants).sort(),Object.keys(entry.variants).sort());
  const {variants,defaultSize,...base}=entry;
  for(const [size,variant] of Object.entries(file.variants))verifyManifestFile(variant,raw,{...sidecar,entries:[{...base,...entry.variants[size]}]},revision);
 }

 if(entry.audioReplacement){
  assert.equal(sidecar.schema,4);assert.equal(file.group,'audio');assert.ok(!entry.logicalSource);
  const logical=entry.audioReplacement.logicalSource;
  assert.equal(raw.length,logical.bytes);assert.equal(hash(raw),logical.sha256);
  assert.equal(file.logicalSourceBytes,logical.bytes);assert.equal(file.logicalSourceSha256,logical.sha256);assert.equal(file.sourceBytes,entry.source.bytes);
  assert.equal(file.recordingLedgerEntryId,entry.audioReplacement.ledgerEntryId);assert.equal(file.recordingLedgerSha256,sidecar.recordingLedger.sha256);
  assert.equal(file.duration,entry.delivery.duration);assert.deepEqual(file.playbackRange,entry.playbackRange);
  assert.ok(Number.isFinite(file.playbackRange.startSeconds)&&Number.isFinite(file.playbackRange.endSeconds)&&file.playbackRange.startSeconds>=0&&file.playbackRange.endSeconds>file.playbackRange.startSeconds&&file.playbackRange.endSeconds<=file.duration);
 }else if(entry.logicalSource){
  assert.ok([2,3,4].includes(sidecar.schema));assert.equal(file.group,'video');
  assert.equal(raw.length,entry.logicalSource.bytes);assert.equal(hash(raw),entry.logicalSource.sha256);
  assert.equal(file.logicalSourceBytes,entry.logicalSource.bytes);assert.equal(file.logicalSourceSha256,entry.logicalSource.sha256);
  assert.equal(file.sourceBytes,entry.source.bytes);
 }else{assert.equal(raw.length,entry.source.bytes);assert.equal(hash(raw),entry.source.sha256);assert.equal(new URL(entry.source.url).pathname,file.path);}
 if(!entry.audioReplacement){assert.equal(file.playbackRange,undefined);assert.equal(file.recordingLedgerEntryId,undefined);assert.equal(file.recordingLedgerSha256,undefined);}
 assert.equal(file.sourceSha256,entry.source.sha256);
 assert.equal(file.deliveryRevision,revision);assert.equal(file.deliveryURL,entry.delivery.url);
 assert.equal(file.sha256,entry.delivery.sha256);assert.equal(file.bytes,entry.delivery.bytes);assert.equal(file.mime,entry.delivery.mime);assert.equal(file.group,entry.delivery.kind);assert.deepEqual(file.timing,entry.timing);
}
