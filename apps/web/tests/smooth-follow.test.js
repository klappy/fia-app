import test from 'node:test';
import assert from 'node:assert/strict';
import {createSmoothFollow} from '../src/lib/smooth-follow.js';
function setup(){
 let id=0,time=0;const queue=new Map(),positions=[];
 const viewport={scrollTop:0,scrollHeight:2000,clientHeight:400,scrollTo({top}){this.scrollTop=top;positions.push(top);}};
 const follower=createSmoothFollow(viewport,cb=>{queue.set(++id,cb);return id;},id=>queue.delete(id));
 const frame=()=>{time+=16;const callbacks=[...queue.values()];queue.clear();callbacks.forEach(cb=>cb(time));};
 return {viewport,follower,frame,queue,positions};
}
test('follow moves continuously and retargets one running animation without jumping',()=>{
 const s=setup();s.follower.to(400);s.frame();
 assert.ok(s.viewport.scrollTop>0&&s.viewport.scrollTop<100);
 for(let i=0;i<8;i++)s.frame();
 const before=s.viewport.scrollTop;s.follower.to(600);assert.equal(s.queue.size,1);assert.equal(s.viewport.scrollTop,before);
 for(let i=0;i<100;i++)s.frame();
 assert.equal(s.viewport.scrollTop,600);assert.equal(s.queue.size,0);
 assert.ok(s.positions.every((v,i)=>i===0||v>=s.positions[i-1]));
});
test('pause, manual exploration or teardown cancels pending frames; reduced motion is immediate',()=>{
 const s=setup();s.follower.to(500);s.frame();s.follower.stop();const position=s.viewport.scrollTop;s.frame();assert.equal(s.viewport.scrollTop,position);assert.equal(s.queue.size,0);
 s.follower.to(1800,true);assert.equal(s.viewport.scrollTop,1600);assert.equal(s.queue.size,0);
 s.follower.to(0);for(let i=0;i<110;i++)s.frame();assert.equal(s.viewport.scrollTop,0);
});
