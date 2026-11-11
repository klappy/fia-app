import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
// workerRequest must not post to the old (active) worker while a new one is installing or waiting:
// a message that reaches the old worker after its hand-over begins restarts it and holds the new
// worker at 'installed' until the next navigation (fia-app-cookbook stall unit, RESULTS-forced-1312).
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function target(){const listeners={};return {listeners,addEventListener:(t,f)=>{(listeners[t]||=new Set()).add(f);},removeEventListener:(t,f)=>listeners[t]?.delete(f),fire:t=>[...(listeners[t]||[])].forEach(f=>f())};}
function worker(name,state){const w=target();Object.assign(w,{name,state,posts:[],postMessage(data,[port]){w.posts.push(data.type);port.postMessage({ok:true,by:name});}});return w;}
function harness({installing=null,waiting=null}={}){
 let now=0,next=0;const timers=new Map();
 const setTimer=(fn,ms)=>{const id=++next;timers.set(id,{fn,at:now+ms});return id;},clearTimer=id=>timers.delete(id);
 const advance=ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}};
 const old=worker('old','activated'),registration={active:old,installing,waiting},container=target();container.ready=Promise.resolve(registration);
 const library=readFileSync('src/lib/library.js','utf8'),fn=library.slice(library.indexOf('async function workerRequest('),library.indexOf('\nexport const hasUnresolvedInstructions'));
 class Channel{constructor(){this.port1={close:()=>{this.closed=true;}};this.port2={postMessage:result=>{if(!this.closed)this.port1.onmessage?.({data:result});},close:()=>{this.closed=true;}};}}
 const rpc={navigator:{serviceWorker:container},workerAbsent:new Promise(()=>{}),notReady:()=>Error('not ready'),MessageChannel:Channel,setTimeout:setTimer,clearTimeout:clearTimer};
 vm.runInNewContext(fn+'\nglobalThis.request=workerRequest;',rpc);
 const activate=w=>{registration.installing=null;registration.waiting=null;registration.active=w;w.state='activating';w.fire('statechange');};
 return {old,registration,container,advance,timers,activate,request:(type='PACK_SELECT')=>rpc.request(type,{packId:'p'})};
}
test('no worker on its way: posts to the active worker at once',async()=>{
 const h=harness(),result=await h.request();assert.equal(result.by,'old');assert.deepEqual(h.old.posts,['PACK_SELECT']);assert.equal(h.timers.size,0);
});
test('waiting worker: holds the post until the hand-over, then posts to the new active worker only',async()=>{
 const fresh=worker('new','installed'),h=harness({waiting:fresh}),p=h.request('MEDIA_STATUS');
 await tick();await tick();assert.deepEqual(h.old.posts,[]);assert.deepEqual(fresh.posts,[]);
 h.activate(fresh);const result=await p;assert.equal(result.by,'new');assert.deepEqual(h.old.posts,[]);assert.deepEqual(fresh.posts,['MEDIA_STATUS']);
 assert.equal(fresh.listeners.statechange.size,0);assert.equal(h.container.listeners.controllerchange.size,0);
});
test('installing worker: still held at installed (waiting), released on controllerchange',async()=>{
 const fresh=worker('new','installing'),h=harness({installing:fresh}),p=h.request();
 await tick();h.registration.installing=null;h.registration.waiting=fresh;fresh.state='installed';fresh.fire('statechange');await tick();
 assert.deepEqual(h.old.posts,[]);assert.deepEqual(fresh.posts,[]);
 h.registration.waiting=null;h.registration.active=fresh;fresh.state='activated';h.container.fire('controllerchange');
 assert.equal((await p).by,'new');assert.deepEqual(h.old.posts,[]);
});
test('failed install (redundant) releases the post to the still-active worker',async()=>{
 const fresh=worker('new','installing'),h=harness({installing:fresh}),p=h.request();
 await tick();fresh.state='redundant';fresh.fire('statechange');
 assert.equal((await p).by,'old');assert.deepEqual(fresh.posts,[]);
});
test('hand-over that never comes: falls back to the active worker after the 10 s bound',async()=>{
 const fresh=worker('new','installed'),h=harness({waiting:fresh}),p=h.request();
 await tick();await tick();h.advance(9999);await tick();assert.deepEqual(h.old.posts,[]);
 h.advance(1);assert.equal((await p).by,'old');assert.deepEqual(h.old.posts,['PACK_SELECT']);assert.deepEqual(fresh.posts,[]);
});
