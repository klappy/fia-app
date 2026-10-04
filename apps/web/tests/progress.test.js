import test from 'node:test';
import assert from 'node:assert/strict';
import {progressSections,progressState,visibleProgress} from '../src/lib/progress.js';
import {activities,sections,assets} from '../src/lib/content.js';
import {createSession} from '../src/lib/engine.js';
const groups=progressSections(sections,activities,assets);
test('progress collapses reading groups and retains scripture and required resources',()=>{
 assert.equal(groups.length,6);
 assert.equal(groups.flatMap(g=>g.screens).length,111);
 const roster=groups.flatMap(g=>g.screens).find(s=>s.id==='S03-U009');
 assert.equal(roster.memberIds.length,8);
 assert.equal(groups.flatMap(g=>g.screens).filter(s=>s.kind==='scripture').length,8);
 assert.ok(groups.flatMap(g=>g.screens).some(s=>s.kind==='map'));
});
test('partial list narration and resource exploration do not falsely complete a screen',()=>{
 const state=createSession(activities);state.index=activities.findIndex(a=>a.id==='S03-U011');state.completed=['S03-U009','S03-U010'];
 const a=progressState(groups,state,activities);
 assert.equal(a[2].screens.find(s=>s.id==='S03-U009').complete,false);
 assert.deepEqual(progressState(groups,{...state,detour:'a112'},activities),a);
 state.completed=groups[2].screens.find(s=>s.id==='S03-U009').memberIds;
 assert.equal(progressState(groups,state,activities)[2].screens.find(s=>s.id==='S03-U009').complete,true);
});
test('long progress paths keep the current screen in a bounded window',()=>{
 const screens=Array.from({length:50},(_,id)=>({id}));
 for(let i=0;i<50;i++){const w=visibleProgress(screens,i);assert.equal(w.screens.length,7);assert.ok(w.screens.some(s=>s.id===i));}
 assert.equal(visibleProgress(screens,0).before,false);assert.equal(visibleProgress(screens,49).after,false);
});
test('location fill follows the same current position forward and backward, independent of completion history',()=>{
 const state=createSession(activities);state.index=activities.findIndex(a=>a.id==='S03-U011');
 let view=progressState(groups,state,activities);const current=view[2].current;
 assert.equal(view[2].positionRatio,current/(view[2].screens.length-1));
 assert.equal(view[0].positionRatio,1);assert.equal(view[3].positionRatio,0);
 const before=view[2].positionRatio;state.index=activities.findIndex(a=>a.id==='S03-U001');
 view=progressState(groups,state,activities);assert.ok(view[2].positionRatio<before);
});
