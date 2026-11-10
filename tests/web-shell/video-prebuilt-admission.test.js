import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {admitPrebuiltVideo} from '../../scripts/video-prebuilt-admission.mjs';
const root=new URL('../../apps/web/public/',import.meta.url);
const read=path=>readFileSync(new URL(path.replace(/^\//,''),root));
const ledger=JSON.parse(read('/content/video-sources/0c6b18ce07914c6e61f8827a536836c0d0bfbcfb198f876d38aaa4f041d1836d.json'));
const pack=JSON.parse(read('/content/packs/eng.MRK-1-1-13/ccd72f23c23f932651b500b730b285f32fabd37e50037b5af91d8881f1403975.json'));
const sidecar=JSON.parse(read('/content/delivery/eng.MRK-1-1-13/b749c9c8246fd178a6c70604ef1037a1bed0e2804ba618750a2aec1de4d9a10e.json'));
function input(row){return {ledger,pack,descriptor:{id:sidecar.packId,revision:sidecar.presentationRevision},entry:sidecar.entries.find(e=>e.path===row.path),file:{path:row.path,...row.bundled},readEvidence:sha=>read(`/content/video-evidence/${sha}.json`),bytes:read(row.path)};}
test('three actual approved bundled videos can be selected with their distinct logical identity',()=>{
 for(const row of ledger.entries){const result=admitPrebuiltVideo({selection:'bundled-logical',...input(row)});assert.equal(result.sha256,row.bundled.sha256);assert.equal(result.bytes,row.bundled.bytes);assert.equal(result.publisherSourceSha256,row.published.sha256);assert.notEqual(result.sha256,result.publisherSourceSha256);assert.equal(result.selection,'bundled-logical');assert.equal(result.grantsPublisherAcquisition,false);}
});
test('actual bundled originals cannot impersonate selected qualified delivery',()=>{
 for(const row of ledger.entries)assert.throws(()=>admitPrebuiltVideo({selection:'qualified-delivery',...input(row)}),/video-prebuilt-byte-mismatch/);
});
test('explicit identity, approved recipe, byte integrity and pinned evidence are mandatory',()=>{
 const row=ledger.entries[0];for(const change of [p=>delete p.selection,p=>p.bytes=p.bytes.subarray(1),p=>p.entry.delivery.sha256='0'.repeat(64),p=>p.entry.delivery.status='pending-transcode',p=>p.readEvidence=()=>Buffer.from('{}')]){const p=input(row);p.entry=structuredClone(p.entry);p.selection='bundled-logical';change(p);assert.throws(()=>admitPrebuiltVideo(p));}
});
