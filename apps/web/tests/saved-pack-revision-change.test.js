import test from 'node:test';import assert from 'node:assert/strict';import {fixture,worker,packId} from './helpers/offline-execution.js';
// D1 regression (upgrade rehearsal, 3.0.0 -> 3.1.0): a pack saved at an old revision must survive the
// server moving to a new revision. A newer revision is an update to offer, not a revocation of the
// saved one. Only an integrity failure of the saved revision's own artifacts may retire it.
const save=(w,f)=>w.message({type:'DOWNLOAD_START',selection:'audio',revision:f.record.revision,mediaIdentity:f.record.execution.mediaIdentity,mediaAssetsSha256:f.record.execution.mediaAssetsSha256});
async function savedOld(){const old=fixture(),next=fixture('next'),w=worker(old);const r=await save(w,old);assert.equal(r.ok,true,r.error);await w.message({type:'PACK_SELECT',revision:old.record.revision});return {old,next,w};}
async function assertStillServesOffline(w,old,label){
 for(const target of [w,worker(old,w.stores)]){target.offline(true);
  const shell=await target.fetch('/index.html');assert.equal(shell.status,200,`${label}: saved shell must not get 409`);assert.equal(await shell.text(),'saved shell');
  assert.equal((await target.fetch('/audio.wav')).status,200,`${label}: saved media must not get 409`);
  const record=await target.fetch(`/v1/packs/${packId}?revision=${old.record.revision}`);assert.equal(record.status,200,`${label}: pinned saved record`);assert.equal(record.headers.get('X-FIA-Offline-Snapshot'),'historical-verified');assert.deepEqual(await record.json(),old.record);
  assert.equal(await(await target.fetch(`/v1/artifacts/${old.record.revision}`)).text(),old.bytes);
  target.offline(false);}
 const metaKeys=[...w.stores.values()].flatMap(s=>[...s.keys()]);assert.equal(metaKeys.some(k=>String(k).includes('revoked-server:')),false,`${label}: no revoked-server marker`);
}
test('D1 serverRead: a pinned read answered with a newer revision does not revoke the saved pack',async()=>{
 const {old,next,w}=await savedOld();
 // Network returns; the server now holds a new revision; the page re-reads its saved (pinned) revision.
 w.setFixture(next);const live=await w.fetch(`/v1/packs/${packId}?revision=${old.record.revision}`);
 assert.equal(live.status,200,'the server answer still passes through to the page');assert.equal((await live.json()).revision,next.record.revision);
 const status=await w.message({type:'DOWNLOAD_STATUS'});assert.equal(status.saved,true,'saved copy stays valid');assert.equal(status.active.serverSnapshot.invalid,false);assert.equal(status.updateAvailable,true,'the update is offered, not forced');
 await assertStillServesOffline(w,old,'after pinned read');
});
test('D1 retainServerSnapshot: a Save that meets a newer server revision does not revoke the saved pack',async()=>{
 const {old,next,w}=await savedOld();
 w.setFixture(next);const r=await w.message({type:'DOWNLOAD_START',selection:'audio',revision:old.record.revision});
 assert.equal(r.ok,false,'the stale-revision Save itself still fails');
 await assertStillServesOffline(w,old,'after stale Save');
 // The newer revision can then be saved normally and replaces the old copy.
 const fresh=await save(w,next);assert.equal(fresh.ok,true,fresh.error);
});
test('D1 control: an integrity failure of the saved revision\'s own artifact still retires it',async()=>{
 const {old,w}=await savedOld();
 w.reply(`/v1/artifacts/${old.dependency.sha256}`,Response.json({schema:'wrong'}));await w.fetch(`/v1/artifacts/${old.dependency.sha256}`);
 w.offline(true);assert.equal((await w.fetch(`/v1/packs/${packId}?revision=${old.record.revision}`)).status,503);assert.equal((await w.fetch('/audio.wav')).status,409);
});
