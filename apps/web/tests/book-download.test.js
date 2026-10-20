import test from 'node:test';
import assert from 'node:assert/strict';
import {bookOf,bookPassages,passageTier,passageSatisfied,bookTotals,downloadBook} from '../src/lib/book-download.js';
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
 assert.deepEqual(t.core,{bytes:22,remaining:15,unknown:0,saved:1,count:3});
 assert.deepEqual(t.audio,{bytes:50,remaining:30,unknown:1,saved:1,count:3});
});
test('book totals count a file shared by passages once and skip files already saved',()=>{
 const app={path:'/assets/index.js',group:'core',bytes:100,sha256:'a'};const clip={path:'/audio/x.opus',group:'audio',bytes:40,sha256:'c',deliveryURL:'https://transcode.klappy.dev/audio/x'};
 const pass=(own,extra={})=>({available:true,saved:false,choices:[{id:'core',bytes:0},{id:'audio',bytes:0}],manifest:{files:[app,{path:own,group:'core',bytes:10,sha256:own},clip,{...clip,path:own+'.opus'}]},...extra});
 const t=bookTotals([pass('/p1'),pass('/p2'),pass('/p3',{saved:true,active:{selection:'core'}})]);
 assert.deepEqual(t.core,{bytes:130,remaining:20,unknown:0,saved:1,count:3});
 assert.deepEqual(t.audio,{bytes:170,remaining:170,unknown:0,saved:0,count:3});
});
test('downloadBook skips saved passages without a fetch, uses each passage tier and stops on request',async()=>{
 const packs=[{id:'a'},{id:'b'},{id:'c'}];const statuses={a:st({core:1,audio:2},{saved:true,active:{selection:'audio'}}),b:st({core:1}),c:st({core:1,audio:2})};const calls=[];
 const adapter={downloadStatus:async p=>statuses[p.id],download:async(tier,progress,pack,sizes)=>{calls.push([pack.id,tier,sizes]);progress({received:1,bytes:1});return {saved:true};}};
 const r=await downloadBook(packs,'audio',adapter);assert.deepEqual(calls,[['b','core',{}],['c','audio',{}]]);assert.equal(r.saved,2);assert.equal(r.skipped,1);
 let stop=false;calls.length=0;const r2=await downloadBook(packs,'all',{...adapter,download:async(tier,progress,pack)=>{calls.push(pack.id);stop=true;throw Error('Download paused.');}},{shouldStop:()=>stop});
 assert.deepEqual(calls,['b']);assert.equal(r2.stopped,true);assert.equal(r2.failed.length,0);
});
