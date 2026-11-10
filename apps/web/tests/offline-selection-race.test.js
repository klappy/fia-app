import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,worker,packId} from './helpers/offline-execution.js';
const meta = w => w.stores.get('fia-v3-download-metadata@1');
const read = async (w,key) => await meta(w)?.get('/'+key)?.json();
const save = (w,f,selection='audio') => w.message({type:'DOWNLOAD_START',packId:f.record.packId,selection,revision:f.record.revision,mediaIdentity:f.record.execution.mediaIdentity,mediaAssetsSha256:f.record.execution.mediaAssetsSha256});
async function opens(w,f){
 w.offline(true);
 const response=await w.navigate();
 assert.equal(response.status,200,'offline navigation returns saved shell');
 assert.equal(await response.text(),'saved shell');
 const pin=await read(w,'client-offline-page');
 assert.equal(pin.packId,f.record.packId);
 assert.equal(pin.serverSnapshot.record.revision,f.record.revision);
 const audio=await w.fetch('/audio.wav','offline-page');
 assert.equal(audio.status,200,'saved media is not refused with 409');
 assert.equal(await audio.text(),f.files['/audio.wav']);
 assert.equal([...meta(w).keys()].some(k=>k.includes('revoked-server:')),false);
}
test('fresh passage save without PACK_SELECT opens and pins at the save acknowledgement',async()=>{
 const f=fixture(),w=worker(f);assert.equal((await save(w,f)).saved,true);
 assert.equal(await read(w,'client-c'),undefined,'Save must not switch the live page pin');
 await opens(w,f);
});
test('text-only save without Open has an offline shell and pin',async()=>{
 const f=fixture(),w=worker(f);assert.equal((await save(w,f,'core')).saved,true);w.offline(true);
 assert.equal(await(await w.navigate()).text(),'saved shell');assert.equal((await read(w,'client-offline-page')).packId,packId);
});
test('saving a second passage preserves an explicit existing selection',async()=>{
 const first=fixture(),second=fixture('second','eng.MRK-1-21-28'),w=worker(first);
 assert.equal((await save(w,first)).saved,true);await w.message({type:'PACK_SELECT',revision:first.record.revision});
 const pin=await read(w,'client-c');w.setFixture(second);assert.equal((await save(w,second)).saved,true);
 assert.equal((await read(w,'selected')).packId,first.record.packId);
 assert.deepEqual(await read(w,'client-c'),pin,'second Save does not switch live text/media');
 await opens(w,first);
});
test('cold worker opens a newly saved passage without a later app status check',async()=>{
 const f=fixture(),w=worker(f);assert.equal((await save(w,f)).saved,true);await opens(worker(f,w.stores),f);
});
test('old worker remains exposed, and installing candidate does not repair an unselected old save',async()=>{
 const f=fixture(),old=worker(f,new Map(),'tests/fixtures/sw-offline-selection-baseline-29421a8.js');assert.equal((await save(old,f)).saved,true);
 assert.equal(await read(old,'selected'),undefined);old.offline(true);assert.equal((await old.navigate()).status,0);
 const next=worker(f,old.stores);next.offline(true);assert.equal((await next.navigate()).status,0);
 // Existing explicit selection still repairs the old save, without re-downloading.
 await next.message({type:'PACK_SELECT',revision:f.record.revision});await opens(next,f);
});
test('selected copy saved by old worker carries over to candidate',async()=>{
 const f=fixture(),old=worker(f,new Map(),'tests/fixtures/sw-offline-selection-baseline-29421a8.js');assert.equal((await save(old,f)).saved,true);
 await old.message({type:'PACK_SELECT',revision:f.record.revision});await opens(worker(f,old.stores),f);
});
test('failed save does not initialize offline selection',async()=>{
 const f=fixture(),w=worker(f);w.fail('/audio.wav');assert.equal((await save(w,f)).ok,false);
 assert.equal(await read(w,'selected'),undefined);
});
test('an explicit choice during first-Save selection wins without changing the live pin',async()=>{
 let entered,release;const blocked=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let first=true;
 const f=fixture(),w=worker(f,new Map(),'public/sw.js',{beforePut:async key=>{if(key==='/selected'&&first){first=false;entered();await gate;}}});
 const saving=save(w,f);await blocked;
 const choice=w.message({type:'PACK_SELECT',packId:'eng.MRK-1-21-28',revision:'a'.repeat(64)});
 release();assert.equal((await saving).saved,true);assert.equal((await choice).selected,true);
 assert.equal((await read(w,'selected')).packId,'eng.MRK-1-21-28');
 assert.equal((await read(w,'client-c')).packId,'eng.MRK-1-21-28');
});
test('selection storage failure does not report saved, and later explicit selection still works',async()=>{
 let fail=true;const f=fixture(),w=worker(f,new Map(),'public/sw.js',{beforePut:async key=>{if(key==='/selected'&&fail)throw new Error('selection storage failure');}});
 const result=await save(w,f);assert.equal(result.ok,false);assert.match(result.error,/selection storage failure/);
 assert.equal(await read(w,'selected'),undefined);assert.ok(await read(w,'pack:'+packId+':active'),'verified copy is retained');
 fail=false;assert.equal((await w.message({type:'PACK_SELECT',revision:f.record.revision})).selected,true);await opens(w,f);
});
for(const action of ['pause','revoke'])test(`${action} while selection storage is pending must not acknowledge saved`,async()=>{
 let entered,release;const blocked=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const f=fixture(),w=worker(f,new Map(),'public/sw.js',{beforePut:async key=>{if(key==='/selected'){entered();await gate;}}});
 const saving=save(w,f);await blocked;
 if(action==='pause')assert.equal((await w.message({type:'DOWNLOAD_PAUSE'})).paused,true);
 else {w.reply('/offline/'+packId+'.json',new Response('revoked',{status:410}));assert.equal((await w.message({type:'DOWNLOAD_STATUS'})).saved,false);}
 release();assert.equal((await saving).ok,false,'the Save must not report success after authority/cancellation changes');
 if(action==='revoke')assert.equal((await read(w,'pack:'+packId+':active')).serverSnapshot.invalid,true);
});
