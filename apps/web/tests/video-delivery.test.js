import {test} from 'node:test';import assert from 'node:assert/strict';import {readdirSync,readFileSync,statSync} from 'node:fs';import {join} from 'node:path';import {createVideoDelivery} from '../src/lib/video-delivery.js';
const request={pack:{id:'eng.MRK-1-1-13',revision:'r'},revision:'d',path:'/v.mp4',identity:'one',file:{bytes:3}};
function setup(fetch){const revoked=[],states=[];let made=0;const owner=createVideoDelivery({fetch,create:()=>`blob:${++made}`,revoke:x=>revoked.push(x),publish:x=>states.push(x)});return {owner,revoked,states,get made(){return made;}};}
test('video cap refuses transfer before fetch; exact verified payload retained without second fetch',async()=>{let calls=0;const x=setup(async()=>{calls++;return {mime:'video/mp4',bytes:new Uint8Array(3).buffer};});await assert.rejects(x.owner.load({...request,file:{bytes:16777217}}),/limit/);assert.equal(calls,0);assert.equal(await x.owner.load(request),'blob:1');assert.equal(await x.owner.load(request),'blob:1');assert.equal(calls,1);x.owner.clear();assert.deepEqual(x.revoked,['blob:1']);});
test('cancel and successor requests reject late publication without revoking current URL',async()=>{const pending=[];const x=setup((r,signal)=>new Promise(resolve=>pending.push({resolve,signal})));const a=x.owner.load(request);x.owner.cancel();const b=x.owner.load({...request,identity:'two'});pending[1].resolve({mime:'video/mp4',bytes:new Uint8Array(3).buffer});await b;pending[0].resolve({mime:'video/mp4',bytes:new Uint8Array(3).buffer});assert.equal(await a,null);assert.equal(x.made,1);assert.deepEqual(x.revoked,[]);assert.equal(pending[0].signal.aborted,true);});
test('failed request does not retry itself and wrong media never creates a URL',async()=>{let calls=0;const x=setup(async()=>{calls++;return {mime:'text/html',bytes:new Uint8Array(3).buffer};});await assert.rejects(x.owner.load(request),/can’t play right now/);assert.equal(calls,1);assert.equal(x.made,0);assert.match(x.states.at(-1).error,/can’t play right now/);});

// S3 phase 1: the service worker's choice wins; identity drift is reported through onchange, never thrown.
const pin={sha256:'pin',bytes:3},receipt={sha256:'receipt',bytes:5},pinned={...request,file:pin};
const reply=(file,size=file.bytes,extra={})=>({mime:'video/mp4',bytes:new ArrayBuffer(size),file:{path:request.path,...file,deliveryURL:'https://transcode.klappy.dev/video/x'},...extra});
function observe(fetch,onchange){const changes=[],revoked=[],states=[];let made=0,calls=0;const owner=createVideoDelivery({fetch:async(...args)=>{calls++;return fetch(...args);},create:()=>`blob:${++made}`,revoke:x=>revoked.push(x),publish:x=>states.push(x),onchange:onchange||(c=>changes.push(c))});return {owner,changes,revoked,states,get made(){return made;},get calls(){return calls;}};}
test('U1: served identity differs from the requested one (sized download committed after the snapshot): plays and reports the change',async()=>{
 const x=observe(async()=>reply(receipt));
 assert.equal(await x.owner.load(pinned),'blob:1');
 assert.deepEqual(x.changes,[{path:request.path,requested:pin,served:receipt,notes:[]}]);
 assert.equal(x.states.at(-1).error,null);assert.equal(x.states.at(-1).entry.url,'blob:1');
});
test('U2: reverse drift (download removed after the snapshot): plays the pin and reports the change',async()=>{
 const x=observe(async()=>reply(pin));
 assert.equal(await x.owner.load({...request,file:receipt}),'blob:1');
 assert.deepEqual(x.changes,[{path:request.path,requested:receipt,served:pin,notes:[]}]);
});
test('U3: the refreshed snapshot hits the cache by served identity and does not transfer the video again',async()=>{
 const x=observe(async()=>reply(receipt));
 assert.equal(await x.owner.load(pinned),'blob:1');assert.equal(x.calls,1);
 assert.equal(await x.owner.load({...request,file:receipt}),'blob:1');
 assert.equal(await x.owner.load(pinned),'blob:1');
 assert.equal(x.calls,1);assert.equal(x.made,1);assert.deepEqual(x.revoked,[]);assert.equal(x.changes.length,1);
});
test('identical requested and served identity does not report a change',async()=>{
 const x=observe(async()=>reply(pin));
 assert.equal(await x.owner.load(pinned),'blob:1');assert.deepEqual(x.changes,[]);
});
test('U4: type, size, path and incomplete-transfer checks still block with plain-language messages',async()=>{
 const cant='This video can’t play right now. Try again or continue without it.',unfinished='This video didn’t finish loading. Try again.';
 const cases=[
  ['wrong MIME',reply(receipt,5,{mime:'text/html'}),cant],
  ['zero bytes',reply({sha256:'empty',bytes:0},0),cant],
  ['over 16 MiB',reply({sha256:'huge',bytes:16777217},16777217),cant],
  ['other path',{...reply(receipt),file:{...reply(receipt).file,path:'/other.mp4'}},cant],
  ['missing bytes',reply(receipt,4),unfinished],
 ];
 for(const [name,result,message] of cases){
  const x=observe(async()=>result);
  await assert.rejects(x.owner.load(pinned),{message},name);
  assert.equal(x.made,0,name);assert.deepEqual(x.changes,[],name);assert.equal(x.states.at(-1).error,message,name);
 }
});
test('U5: service notes alone report a change, and a failing onchange never blocks playback',async()=>{
 const notes=[{kind:'content-drift'}],x=observe(async()=>reply(pin,3,{notes}));
 assert.equal(await x.owner.load(pinned),'blob:1');assert.deepEqual(x.changes,[{path:request.path,requested:pin,served:pin,notes}]);
 const y=observe(async()=>reply(receipt),()=>{throw Error('listener failed');});
 assert.equal(await y.owner.load(pinned),'blob:1');assert.equal(y.states.at(-1).error,null);
});
test('U6: the retired identity-mismatch message is gone from app source',()=>{
 const files=dir=>readdirSync(dir).flatMap(name=>{const path=join(dir,name);return statSync(path).isDirectory()?files(path):[path];});
 const root=new URL('../src',import.meta.url).pathname;
 assert.deepEqual(files(root).filter(path=>readFileSync(path,'utf8').includes('Verified video identity mismatch.')),[]);
});
