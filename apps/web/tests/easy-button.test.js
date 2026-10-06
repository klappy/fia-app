import test from 'node:test';
import assert from 'node:assert/strict';
import {easyFace,queueable,createTapGate,CHECKING_LABEL,START_BURST_MS} from '../src/lib/easy-button.js';

function clock(){
 let now=0,next=1;const timers=new Map();
 return {now:()=>now,setTimer:(fn,ms)=>{const id=next++;timers.set(id,{fn,at:now+ms});return id;},clearTimer:id=>timers.delete(id),
  advance(ms){now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}}};
}

test('verifying wins over every action and shows no guessed label',()=>{
 for(const label of ['Begin','Continue','Pause','Play'])assert.deepEqual(easyFace({verifying:true,starting:true,label}),{kind:'verifying',label:CHECKING_LABEL});
 assert.equal(CHECKING_LABEL,'Checking availability');
});

test('starting carries the label it will have; otherwise the verified action shows',()=>{
 assert.deepEqual(easyFace({verifying:false,starting:true,label:'Begin'}),{kind:'starting',label:'Pause'});
 assert.deepEqual(easyFace({verifying:false,starting:false,label:'Continue'}),{kind:'action',label:'Continue'});
});

test('only checked play actions carry a queued tap',()=>{
 for(const label of ['Begin','Play','Resume','Play video','Listen'])assert.equal(queueable(label),true,label);
 for(const label of ['Continue','Pause','Return','Begin again'])assert.equal(queueable(label),false,label);
});

test('one queued tap, taken once',()=>{
 const gate=createTapGate();
 assert.equal(gate.take(),false);gate.queue();gate.queue();gate.queue();
 assert.equal(gate.queued,true);assert.equal(gate.take(),true);assert.equal(gate.take(),false);
 gate.queue();gate.drop();assert.equal(gate.take(),false);
});

test('the pressed face decides a click that races a state change',()=>{
 const c=clock(),gate=createTapGate(c);
 gate.press('starting');c.advance(8);
 assert.equal(gate.seen('action'),'starting');
 assert.equal(gate.seen('action'),'action','a press is used once');
 gate.press('verifying');c.advance(1500);
 assert.equal(gate.seen('action'),'action','a stale press is ignored');
});

test('the start burst absorbs repeats 150 ms apart and ends 800 ms after the last one',()=>{
 const c=clock(),seen=[],gate=createTapGate({...c,onburst:value=>seen.push(value)});
 assert.equal(START_BURST_MS,800);
 gate.absorb();for(let i=0;i<5;i++){c.advance(150);gate.absorb();}
 assert.deepEqual(seen.filter(v=>v===false),[]);
 c.advance(799);assert.equal(seen.at(-1),true);
 c.advance(1);assert.equal(seen.at(-1),false);
});

test('a canceled or finished start closes the burst at once',()=>{
 const c=clock(),seen=[],gate=createTapGate({...c,onburst:value=>seen.push(value)});
 gate.absorb();gate.end();assert.deepEqual(seen,[true,false]);
 gate.end();assert.deepEqual(seen,[true,false],'ending an idle gate changes nothing');
});
