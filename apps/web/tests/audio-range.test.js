import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudioController} from '../src/lib/audio.js';
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
function setup(){
 const names=['Audio','document','window','setTimeout','clearTimeout','requestAnimationFrame','cancelAnimationFrame'];
 const previous=Object.fromEntries(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const owners=[],timers=new Map(),frames=new Map(),states=[],errors=[];let id=0,ends=0,speech=0;
 class FakeAudio{
  constructor(src){this.src=src;this.paused=true;this.duration=20;this.readyState=0;this.seeking=false;this._time=0;this.calls=0;owners.push(this);}
  get currentTime(){return this._time;}set currentTime(value){this._time=value;this.seeking=true;}
  play(){this.calls++;if(this.reject)throw this.reject;this.paused=false;return this.promise||Promise.resolve();}
  pause(){this.paused=true;}removeAttribute(){this.src='';}load(){}
  metadata(){this.readyState=1;this.onloadedmetadata();}
  seeked(){this.seeking=false;this.onseeked();}
 }
 globalThis.Audio=FakeAudio;globalThis.document={querySelectorAll:()=>[]};globalThis.window={speechSynthesis:{cancel(){},speak(){speech++;}}};
 globalThis.setTimeout=(callback,delay)=>{const key=++id;timers.set(key,{callback:()=>{timers.delete(key);callback();},delay});return key;};globalThis.clearTimeout=key=>timers.delete(key);
 globalThis.requestAnimationFrame=callback=>{const key=++id;frames.set(key,()=>{frames.delete(key);callback();});return key;};globalThis.cancelAnimationFrame=key=>frames.delete(key);
 const controller=createAudioController(s=>states.push(s),()=>ends++,e=>errors.push(e));
 const start=async(range={startSeconds:3,endSeconds:8})=>{controller.play('source','blob:verified',1,range);const owner=owners.at(-1);owner.metadata();owner.seeked();await tick();return owner;};
 return {controller,owners,timers,frames,states,errors,start,get ends(){return ends;},get speech(){return speech;},restore(){controller.stop();for(const k of names){if(previous[k])Object.defineProperty(globalThis,k,previous[k]);else delete globalThis[k];}}};
}
const run=(name,fn)=>test(name,async()=>{const e=setup();try{await fn(e);}finally{e.restore();}});
run('range waits for metadata and completed seek before starting at output offset',async e=>{
 e.controller.play('source','blob:verified',1,{startSeconds:3,endSeconds:8});const owner=e.owners[0];assert.equal(owner.calls,0);
 owner.metadata();assert.equal(owner.currentTime,3);assert.equal(owner.calls,0);owner.seeked();await tick();assert.equal(owner.calls,1);
 assert.equal(e.states.at(-1).elapsed,3);assert.equal(e.states.at(-1).duration,20);
});
run('invalid bounds, actual duration and missing source refuse without speech',async e=>{
 for(const range of [null,{}, {startSeconds:1,endSeconds:2,extra:true},Object.assign([],{startSeconds:1,endSeconds:2}), {startSeconds:-1,endSeconds:2},{startSeconds:3,endSeconds:3},{startSeconds:NaN,endSeconds:3},{startSeconds:0,endSeconds:Infinity},{startSeconds:'0',endSeconds:3}]){e.controller.play('source','blob:x',1,range);assert.equal(e.controller.active,false);}
 e.controller.play('source','blob:x',1,{startSeconds:1,endSeconds:21});e.owners.at(-1).metadata();assert.equal(e.controller.active,false);
 e.controller.play('source',null,1,{startSeconds:1,endSeconds:3});assert.equal(e.controller.active,false);assert.equal(e.speech,0);assert.equal(e.ends,0);
});
run('deadline ends once without timeupdate and late natural ended cannot duplicate',async e=>{
 const owner=await e.start();const deadline=[...e.timers.values()][0];assert.equal(deadline.delay,5000);
 owner._time=8;deadline.callback();assert.equal(e.ends,1);assert.equal(owner.paused,true);assert.equal(e.timers.size,0);assert.equal(e.frames.size,0);
 owner.onended();owner.ontimeupdate();await tick();assert.equal(e.ends,1);
});
run('frame callback independently enforces boundary',async e=>{
 const owner=await e.start();const frame=[...e.frames.values()][0];owner._time=8.01;frame();assert.equal(e.ends,1);assert.equal(owner.src,'');
});
run('pause before metadata and seek cannot autoplay, resume retains range',async e=>{
 e.controller.play('source','blob:x',1,{startSeconds:3,endSeconds:8});const owner=e.owners[0];e.controller.pause();owner.metadata();owner.seeked();await tick();assert.equal(owner.calls,0);
 e.controller.resume();await tick();assert.equal(owner.calls,1);owner._time=4;e.controller.pause();assert.equal(e.timers.size,0);assert.equal(e.frames.size,0);owner.onended();assert.equal(e.ends,0);
 e.controller.resume();await tick();assert.equal(owner.currentTime,4);assert.equal([...e.timers.values()][0].delay,4000);
});
run('rate changes reschedule the boundary deadline',async e=>{
 const owner=await e.start();owner._time=4;owner.playbackRate=2;owner.onratechange();assert.equal([...e.timers.values()][0].delay,2000);
 owner.playbackRate=0;owner.onratechange();assert.equal(e.controller.active,false);assert.equal(e.ends,0);
});
run('stalled clock does not falsely complete on deadline',async e=>{
 const owner=await e.start();const timer=[...e.timers.values()][0];timer.callback();assert.equal(e.ends,0);assert.equal(e.controller.active,true);assert.equal(owner.currentTime,3);
});
run('navigation and replay invalidate prior frame, timer, seek and ended callbacks',async e=>{
 const old=await e.start(),oldFrame=[...e.frames.values()][0],oldTimer=[...e.timers.values()][0].callback;
 const next=await e.start({startSeconds:10,endSeconds:12});old._time=9;oldFrame();oldTimer();old.onended();old.onseeked();assert.equal(e.ends,0);assert.equal(next.currentTime,10);
 e.controller.stop();next._time=12;next.onended();assert.equal(e.ends,0);assert.equal(e.timers.size,0);assert.equal(e.frames.size,0);
});
run('range errors never synthesize a fallback',async e=>{
 const owner=await e.start();owner.onerror();assert.equal(e.speech,0);assert.equal(e.ends,0);assert.equal(e.controller.active,false);
});
run('gesture denial retains range for explicit retry and end-boundary resume never plays again',async e=>{
 e.controller.play('source','blob:x',1,{startSeconds:3,endSeconds:8});const owner=e.owners[0];owner.reject=Object.assign(Error('gesture'),{name:'NotAllowedError'});owner.metadata();owner.seeked();assert.equal(e.controller.active,true);assert.equal(e.timers.size,0);
 owner.reject=null;e.controller.resume();await tick();assert.equal(owner.currentTime,3);e.controller.pause();owner._time=8;const calls=owner.calls;e.controller.resume();assert.equal(owner.calls,calls);assert.equal(e.ends,1);
});
run('pending play promise cannot resurrect completed range',async e=>{
 e.controller.play('source','blob:x',1,{startSeconds:3,endSeconds:8});const owner=e.owners[0];let resolve;owner.promise=new Promise(r=>resolve=r);owner.metadata();owner.seeked();
 owner._time=8;[...e.timers.values()][0].callback();assert.equal(e.ends,1);resolve();await tick();assert.equal(e.controller.active,false);assert.equal(e.controller.playing,false);
});
run('actual duration changes fail closed and unfinished natural end is not success',async e=>{
 let owner=await e.start();owner.duration=7;owner.ondurationchange();assert.equal(e.controller.active,false);assert.equal(e.ends,0);
 owner=await e.start();owner._time=5;owner.onended();assert.equal(e.ends,0);assert.equal(e.controller.active,false);
});

run('queued old callbacks cannot affect a resumed same-owner range',async e=>{
 const owner=await e.start(),oldTimer=[...e.timers.values()][0].callback,oldFrame=[...e.frames.values()][0];e.controller.pause();e.controller.resume();await tick();
 const timerKeys=[...e.timers.keys()],frameKeys=[...e.frames.keys()];oldTimer();oldFrame();assert.deepEqual([...e.timers.keys()],timerKeys);assert.deepEqual([...e.frames.keys()],frameKeys);
 owner._time=8;[...e.timers.values()][0].callback();assert.equal(e.ends,1);
});

run('excerpt progress rebases and clamps while keeping the absolute alignment clock',async e=>{
 const owner=await e.start();
 assert.deepEqual([e.states.at(-1).elapsed,e.states.at(-1).duration,e.states.at(-1).progressElapsed,e.states.at(-1).progressDuration],[3,20,0,5]);
 owner._time=5.5;owner.ontimeupdate();
 assert.deepEqual([e.states.at(-1).elapsed,e.states.at(-1).duration,e.states.at(-1).progressElapsed,e.states.at(-1).progressDuration],[5.5,20,2.5,5]);
 e.controller.pause();owner._time=2;e.controller.pause();assert.equal(e.states.at(-1).progressElapsed,0);assert.equal(e.states.at(-1).elapsed,2);
 owner._time=8.5;e.controller.pause();assert.equal(e.states.at(-1).progressElapsed,5);assert.equal(e.states.at(-1).elapsed,8.5);
});
run('excerpt progress survives pause and resume and resets on replay',async e=>{
 const owner=await e.start();owner._time=5.5;e.controller.pause();assert.equal(e.states.at(-1).progressElapsed,2.5);
 e.controller.resume();await tick();assert.equal(e.states.at(-1).progressElapsed,2.5);
 await e.start();assert.equal(e.states.at(-1).progressElapsed,0);assert.equal(e.states.at(-1).progressDuration,5);
 e.controller.stop();assert.equal('progressElapsed' in e.states.at(-1),false);assert.equal('progressDuration' in e.states.at(-1),false);
});
run('unranged playback retains its original clock without excerpt fields',async e=>{
 e.controller.play('source','blob:whole');await tick();const owner=e.owners.at(-1);owner._time=10;owner.ontimeupdate();
 assert.deepEqual(e.states.at(-1),{src:'blob:whole',playing:true,elapsed:10,duration:20});
});
