import test from 'node:test';
import assert from 'node:assert/strict';
import {bookOf,bookPassages,passageTier,passageSatisfied,bookTotals,bookStatuses,observeBookStatuses,retryableBookStatus,downloadBook} from '../src/lib/book-download.js';
const st=(choices,extra={})=>({available:true,saved:false,manifest:{files:[{group:'core'},{group:'audio'},{group:'image'},{group:'video'}]},choices:Object.entries(choices).map(([id,bytes])=>({id,bytes})),...extra});
test('book passages share book and language, in catalog order',()=>{
 const packs=[{id:'eng.MRK-1-1-13',pericopeId:'MRK-1-1-13',language:'eng'},{id:'eng.LUK-1-1-4',pericopeId:'LUK-1-1-4',language:'eng'},{id:'spa.MRK-1-1-13',pericopeId:'MRK-1-1-13',language:'spa'},{id:'eng.MRK-16-9-20',pericopeId:'MRK-16-9-20',language:'eng'}];
 assert.equal(bookOf(packs[0]),'MRK');assert.deepEqual(bookPassages(packs,packs[0]).map(p=>p.id),['eng.MRK-1-1-13','eng.MRK-16-9-20']);
});
test('a passage without the chosen tier saves the largest tier it contains, never video under no-video',()=>{
 assert.equal(passageTier(st({core:1,audio:2}),'all'),'audio');
 assert.equal(passageTier(st({core:1,audio:2,all:3},{manifest:{files:[{group:'image'}]}}),'visual'),'all');
 assert.equal(passageTier(st({core:1,audio:2,all:3}),'visual'),'audio');
 assert.equal(passageTier(st({core:1}),'core'),'core');
});
test('saved superset tiers are satisfied; updates are not',()=>{
 assert.equal(passageSatisfied(st({core:1},{saved:true,active:{selection:'all'}}),'audio'),true);
 assert.equal(passageSatisfied(st({core:1},{saved:true,active:{selection:'core'}}),'audio'),false);
 assert.equal(passageSatisfied(st({core:1},{saved:true,updateAvailable:true,active:{selection:'all'}}),'core'),false);
});
test('book totals use declared sizes when no file list is known and leave saved passages out of remaining',()=>{
 const bare=(c,x)=>({...st(c,x),manifest:undefined});
 const t=bookTotals([bare({core:10,audio:30,visual:40,all:90}),bare({core:5,audio:null}),bare({core:7,audio:20},{saved:true,active:{selection:'audio'}})]);
 assert.deepEqual(t.core,{bytes:22,remaining:15,unknown:0,unresolved:0,saved:1,count:3});
 assert.deepEqual(t.audio,{bytes:50,remaining:30,unknown:1,unresolved:0,saved:1,count:3});
});
test('book totals count a file shared by passages once and skip files already saved',()=>{
 const app={path:'/assets/index.js',group:'core',bytes:100,sha256:'a'};const clip={path:'/audio/x.opus',group:'audio',bytes:40,sha256:'c',deliveryURL:'https://transcode.klappy.dev/audio/x'};
 const pass=(own,extra={})=>({available:true,saved:false,choices:[{id:'core',bytes:0},{id:'audio',bytes:0}],manifest:{files:[app,{path:own,group:'core',bytes:10,sha256:own},clip,{...clip,path:own+'.opus'}]},...extra});
 const t=bookTotals([pass('/p1'),pass('/p2'),pass('/p3',{saved:true,active:{selection:'core'}})]);
 assert.deepEqual(t.core,{bytes:130,remaining:20,unknown:0,unresolved:0,saved:1,count:3});
 assert.deepEqual(t.audio,{bytes:170,remaining:170,unknown:0,unresolved:0,saved:0,count:3});
});
test('downloadBook skips saved passages without a fetch, uses each passage tier and stops on request',async()=>{
 const packs=[{id:'a'},{id:'b'},{id:'c'}];const statuses={a:st({core:1,audio:2},{saved:true,active:{selection:'audio'}}),b:st({core:1}),c:st({core:1,audio:2})};const calls=[];
 const adapter={downloadStatus:async p=>statuses[p.id],download:async(tier,progress,pack,sizes)=>{calls.push([pack.id,tier,sizes]);progress({received:1,bytes:1});return {saved:true};}};
 const r=await downloadBook(packs,'audio',adapter);assert.deepEqual(calls,[['b','core',{}],['c','audio',{}]]);assert.equal(r.saved,2);assert.equal(r.skipped,1);
 let stop=false;calls.length=0;const r2=await downloadBook(packs,'all',{...adapter,download:async(tier,progress,pack)=>{calls.push(pack.id);stop=true;throw Error('Download paused.');}},{shouldStop:()=>stop});
 assert.deepEqual(calls,['b']);assert.equal(r2.stopped,true);assert.equal(r2.failed.length,0);
});

test('failed book status checks remain unresolved rather than disappearing from totals',async()=>{
 const packs=[{id:'a'},{id:'b'}],known={available:true,saved:false,choices:[{id:'core',bytes:10}]};
 const statuses=await bookStatuses(packs,{downloadStatus:async p=>{if(p.id==='b')throw Error('Status connection failed.');return known;}});
 assert.deepEqual(bookTotals(statuses).core,{bytes:10,remaining:10,unknown:0,unresolved:1,saved:0,count:2});
 const failed=await bookStatuses(packs,{downloadStatus:async()=>{throw Error('Status unavailable.');}});
 assert.deepEqual(bookTotals(failed).core,{bytes:0,remaining:0,unknown:0,unresolved:2,saved:0,count:2});
});

test('legitimate unoffered tiers are not failed checks; saved and recovered statuses retain their meaning',()=>{
 const known={available:true,saved:false,choices:[{id:'core',bytes:10}]},unoffered={available:true,choices:[]};
 assert.deepEqual(bookTotals([known,unoffered]).core,{bytes:10,remaining:10,unknown:0,unresolved:0,saved:0,count:1});
 const recovered={...known,saved:true,active:{selection:'core'}};
 assert.deepEqual(bookTotals([known,recovered]).core,{bytes:20,remaining:10,unknown:0,unresolved:0,saved:1,count:2});
 const warning={...recovered,error:'Latest status could not be refreshed; showing verified saved data.'};
 assert.equal(bookTotals([warning]).core.unresolved,0);
});

test('fulfilled worker errors without usable choices remain unresolved through bookStatuses',async()=>{
 const packs=[{id:'a'},{id:'b'}],known={available:true,saved:false,choices:[{id:'core',bytes:10}]};
 // DOWNLOAD_STATUS replies ok:true even when status() catches a manifest lookup failure.
 const failed={ok:true,available:true,saved:false,active:null,pending:null,manifest:undefined,error:'Manifest lookup failed.',choices:[]};
 const mixed=await bookStatuses(packs,{downloadStatus:async p=>p.id==='a'?known:failed});
 assert.deepEqual(bookTotals(mixed).core,{bytes:10,remaining:10,unknown:0,unresolved:1,saved:0,count:2});
 assert.deepEqual(bookTotals([failed,failed]).core,{bytes:0,remaining:0,unknown:0,unresolved:2,saved:0,count:2});
});

test('automatic status observation retries only transient unresolved passages, at bounded delays',async()=>{
 const packs=[{id:'ok'},{id:'bad'},{id:'invalid'},{id:'unknown'}],calls=[],waits=[],snapshots=[];let n=0;const good={available:true,choices:[{id:'core',bytes:10}]};
 const out=await observeBookStatuses(packs,{downloadStatus:async p=>{calls.push(p.id);if(p.id==='ok')return good;if(p.id==='bad')return ++n<3?{available:true,error:'Media status is temporarily unavailable.',choices:[]}:good;return {available:true,error:p.id==='invalid'?'Invalid download file.':'Unrecognized failure.',choices:[]};}},{wait:async ms=>waits.push(ms),onstatus:(s,retrying)=>snapshots.push({s,retrying})});
 assert.deepEqual(waits,[1000,3000]);assert.deepEqual(calls,['ok','bad','invalid','unknown','bad','bad']);assert.equal(bookTotals(out).core.unresolved,2);assert.equal(snapshots.at(-1).retrying,false);
 assert.equal(retryableBookStatus({available:true,error:'Media status is temporarily unavailable.',choices:[{id:'core'}]}),false);
});
test('three transient attempts settle; cancellation during active replies and backoff makes no later reads',async()=>{
 const failed={available:true,error:'Media status is temporarily unavailable.',choices:[]};let calls=0,stopped=false,reported=0;
 await observeBookStatuses([{id:'a'}],{downloadStatus:async()=>{calls++;return failed;}},{wait:async()=>{}});assert.equal(calls,3);
 calls=0;await observeBookStatuses([{id:'a'}],{downloadStatus:async()=>{calls++;return failed;}},{wait:async()=>{stopped=true;},shouldStop:()=>stopped});assert.equal(calls,1);
 stopped=false;calls=0;const out=await observeBookStatuses([{id:'a'},{id:'b'}],{downloadStatus:async()=>{calls++;stopped=true;return failed;}},{shouldStop:()=>stopped,onstatus:()=>reported++});assert.equal(out,null);assert.equal(reported,0);assert.equal(calls,1);
});

test('catalog failures share the same bounded attempt budget and never become an empty book',async()=>{
 const good={available:true,choices:[{id:'core',bytes:10}]},waits=[];let catalogs=0,statuses=0;
 const result=await observeBookStatuses(async()=>{if(++catalogs===1)throw TypeError('Failed to fetch');return [{id:'a'}];},{downloadStatus:async()=>++statuses===1?{available:true,error:'Media status is temporarily unavailable.',choices:[]}:good},{wait:async ms=>waits.push(ms)});
 assert.equal(catalogs,2);assert.equal(statuses,2);assert.deepEqual(waits,[1000,3000]);assert.equal(bookTotals(result).core.count,1);
 catalogs=0;await assert.rejects(observeBookStatuses(async()=>{catalogs++;throw Error('The passage catalog is unavailable. Your current passage stays open.');},{downloadStatus:()=>assert.fail('status before catalog')},{wait:()=>assert.fail('unknown catalog error retried')}),/catalog is unavailable/);assert.equal(catalogs,1);
});
