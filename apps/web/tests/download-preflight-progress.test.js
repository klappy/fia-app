import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {fixture,packId} from './helpers/offline-execution.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate){for(let i=0;i<200;i++){if(predicate())return;await tick();}throw Error('Fixture did not reach expected boundary');}
function harness({old=false}={}){
 let now=0,next=0;const timers=new Map(),stages=[],progress=[],pending=[];let task;
 const setTimer=(fn,ms)=>{const id=++next;timers.set(id,{fn,at:now+ms});return id;},clearTimer=id=>timers.delete(id);
 const advance=ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}};
 const f=fixture(),helper=readFileSync('tests/helpers/offline-execution.js','utf8');
 // Reuse the repository's coherent executable fixture/cache implementation;
 // only GET scheduling, MessageChannel delivery and time are controlled.
 let source=helper.replace(/^import .*\n/,'').replace(/export \{fixture,worker,packId,origin\};/,'globalThis.makeWorker=worker;');
 source=source.replace('fetch:fetcher,','fetch:async (...args)=>{const path=new URL(typeof args[0]===\'string\'?args[0]:args[0].url,origin).pathname;if(path.startsWith(\'/v1/\'))await gate(path);return fetcher(...args);},');
 source=source.replace('async message(data){let task,result;','async message(data,onprogress){let task,result;').replace('if(!r.progress)result=r;','if(r.progress)onprogress?.(r.progress);else result=r;');
 const read=(path,...args)=>{let s=readFileSync(path,...args);if(old&&path==='public/sw.js')s=s.replace('controller.signal,preflight)','controller.signal)').replace("  preflight({phase:'authority-check',verified:0,total:null});",'');return s;};
 const context={vm,ReadableStream,readFileSync:read,createHash,webcrypto,Response,Request,Headers,URL,Promise,console,AbortController,TextEncoder,setTimeout:setTimer,clearTimeout:clearTimer,gate:path=>new Promise(resolve=>{pending.push({path,resolve});})};vm.runInNewContext(source,context);const w=context.makeWorker(f);
 const library=readFileSync('src/lib/library.js','utf8'),fn=library.slice(library.indexOf('async function workerRequest('),library.indexOf('\nexport const hasUnresolvedInstructions'));
 class Channel{constructor(){this.port1={close:()=>{this.closed=true;}};this.port2={postMessage:result=>{if(!this.closed)this.port1.onmessage?.({data:result});},close:()=>{this.closed=true;}};}}
 const rpc={navigator:{serviceWorker:{ready:Promise.resolve({active:{postMessage:(data,[port])=>{task=w.message(data,p=>{progress.push({at:now,...p});port.postMessage({progress:p});}).then(result=>port.postMessage(result));}}})}},workerAbsent:new Promise(()=>{}),notReady:()=>Error('not ready'),MessageChannel:Channel,setTimeout:setTimer,clearTimeout:clearTimer};vm.runInNewContext(fn+'\nglobalThis.request=workerRequest;',rpc);
 const data={packId,selection:'audio',revision:f.record.revision,mediaIdentity:f.record.execution.mediaIdentity,mediaAssetsSha256:f.record.execution.mediaAssetsSha256};
 return {f,w,pending,progress,advance,start(nextFixture){const d=nextFixture?{...data,revision:nextFixture.record.revision,mediaIdentity:nextFixture.record.execution.mediaIdentity,mediaAssetsSha256:nextFixture.record.execution.mediaAssetsSha256}:data;const p=rpc.request('DOWNLOAD_START',d);p.catch(()=>{});return p;},async release(ms=20000){await until(()=>pending.length);const item=pending.shift();advance(ms);item.resolve();await tick();stages.push(item.path);},task:()=>task,stages};
}
test('verified preflight progress survives total work beyond unchanged 45s RPC inactivity deadline',async()=>{
 const h=harness(),result=h.start();for(let i=0;i<3;i++)await h.release(20000);assert.equal((await result).ok,true);assert(h.progress.filter(p=>p.preflight).length>=4);for(const p of h.progress.filter(p=>p.preflight)){assert.equal(p.received,0);assert.equal(p.bytes,null);assert.equal(p.count,0);assert.equal(p.total,0);}assert.deepEqual(h.progress.filter(p=>p.preflight).map(p=>p.preflight.verified),[0,0,1,2]);assert.equal(h.progress.at(-1).count,4);
});
test('negative control: original silent preflight fails same actual adapter at 45s',async()=>{const h=harness({old:true}),p=h.start();await h.release(20000);await h.release(20000);await until(()=>h.pending.length);h.advance(5000);await assert.rejects(p,/Download stopped responding/);h.pending.shift().resolve();await h.task();});
test('one stalled preflight GET still expires at the unchanged 45s deadline',async()=>{const h=harness(),p=h.start();await until(()=>h.pending.length);h.advance(45000);await assert.rejects(p,/Download stopped responding/);h.pending.shift().resolve();for(let i=0;i<2;i++)await h.release(0);await h.task();});
test('pause during preflight prevents late progress and target activation',async()=>{const h=harness(),p=h.start();await until(()=>h.pending.length);await h.w.message({type:'DOWNLOAD_PAUSE'});const count=h.progress.length;h.pending.shift().resolve();await assert.rejects(p,/paused/);assert.equal(h.progress.length,count);const status=await h.w.message({type:'DOWNLOAD_STATUS'});assert.equal(status.saved,false);});
test('unverified server identity or artifact cannot emit successful verification or saved status',async()=>{for(const kind of ['record','artifact']){const h=harness();h.w.reply(kind==='record'?`/v1/packs/${packId}`:`/v1/artifacts/${h.f.record.revision}`,Response.json({status:'wrong'}));const p=h.start();await h.release(0);if(kind==='artifact')await h.release(0);await assert.rejects(p,/Invalid server record|could not be verified/);assert.equal(h.progress.some(p=>p.preflight?.verified>0),false);assert.equal((await h.w.message({type:'DOWNLOAD_STATUS'})).saved,false);}});

test('pausing preflight for an update preserves the prior working saved snapshot',async()=>{const h=harness(),first=h.start();for(let i=0;i<3;i++)await h.release(0);assert.equal((await first).ok,true);const prior=await h.w.message({type:'DOWNLOAD_STATUS'});assert.equal(prior.saved,true);const next=fixture('update');h.w.setFixture(next);const update=h.start(next);await until(()=>h.pending.length);await h.w.message({type:'DOWNLOAD_PAUSE'});h.pending.shift().resolve();await assert.rejects(update,/paused/);const status=await h.w.message({type:'DOWNLOAD_STATUS'});assert.equal(status.saved,true);assert.equal(status.active.serverSnapshot.record.revision,h.f.record.revision);});
