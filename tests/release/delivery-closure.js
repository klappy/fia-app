import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
// The local artifact is immutable source; transformed bytes are identified by the
// exact independently reviewed sidecar, not falsely compared to the raw file.
export function verifyManifestFile(file,raw,sidecar,revision){
 if(!file.deliveryURL){assert.equal(raw.length,file.bytes);assert.equal(hash(raw),file.sha256);return;}
 assert.ok(sidecar,'Missing reviewed delivery sidecar');
 const entry=sidecar.entries.find(e=>e.path===file.path);assert.ok(entry,'Unreviewed derivative path');
 assert.equal(raw.length,entry.source.bytes);assert.equal(hash(raw),entry.source.sha256);assert.equal(file.sourceSha256,entry.source.sha256);
 assert.equal(new URL(entry.source.url).pathname,file.path);
 assert.equal(file.deliveryRevision,revision);assert.equal(file.deliveryURL,entry.delivery.url);
 assert.equal(file.sha256,entry.delivery.sha256);assert.equal(file.bytes,entry.delivery.bytes);assert.equal(file.mime,entry.delivery.mime);assert.equal(file.group,entry.delivery.kind);assert.deepEqual(file.timing,entry.timing);
}
