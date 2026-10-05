import test from 'node:test';
import assert from 'node:assert/strict';
import {createSwipeRecognizer,createSelectionTracker} from '../src/lib/swipe.js';
const begin={x:200,y:200,time:0,count:1,width:390,blocked:false,identity:'pack:a'};
const end={x:100,y:205,time:200,blocked:false,identity:'pack:a'};
test('left/right produce one existing navigation intent',()=>{
 const g=createSwipeRecognizer();g.begin(begin);assert.equal(g.end(end),'next');assert.equal(g.end(end),null);
 g.begin({...begin,x:100});assert.equal(g.end({...end,x:220}),'back');
});
test('edges, interactive targets, multitouch, short/diagonal/slow gestures reject',()=>{
 for(const change of [{x:12},{x:380},{blocked:true},{count:2}]){const g=createSwipeRecognizer();g.begin({...begin,...change});assert.equal(g.end(end),null);}
 for(const change of [{x:150},{y:300},{time:701},{blocked:true},{identity:'pack:b'}]){const g=createSwipeRecognizer();g.begin(begin);assert.equal(g.end({...end,...change}),null);}
});
test('vertical scrolling, second finger and cancellation permanently abandon sequence',()=>{
 for(const move of [{x:205,y:220,count:1},{x:170,y:200,count:2}]){const g=createSwipeRecognizer();g.begin(begin);g.move(move);assert.equal(g.end(end),null);}
 const g=createSwipeRecognizer();g.begin(begin);g.cancel();assert.equal(g.end(end),null);
});

test('latest selection completion clears loading despite unresolved obsolete selection',()=>{
 const states=[],start=createSelectionTracker(value=>states.push(value)),old=start(),latest=start();latest();assert.deepEqual(states,[true,true,false]);old();assert.deepEqual(states,[true,true,false]);
 const next=start();old();assert.equal(states.at(-1),true);next();assert.equal(states.at(-1),false);
});
