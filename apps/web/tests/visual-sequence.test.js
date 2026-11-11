import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visualSequence} from '../src/lib/visual-sequence.js';
import pack from '../src/lib/pack.json' with {type:'json'};
test('two sandals views share an authored sequence without changing source data',()=>{
 const before=JSON.stringify(pack);const i=pack.activities.findIndex(a=>a.id==='S02-U008');
 const first=visualSequence(pack.activities,pack.assets,i),second=visualSequence(pack.activities,pack.assets,i+1);
 assert.equal(first.total,2);assert.equal(second.key,first.key);assert.equal(second.position,1);assert.equal(JSON.stringify(pack),before);
});
test('does not group matching titles, cross sections or noncontiguous source reuse',()=>{
 const assets={a:{kind:'image'},b:{kind:'map'},c:{kind:'guide'}};
 const activities=[{id:'one',sourceUnitId:'s',sectionId:'a',assetId:'a'},{id:'two',sourceUnitId:'s',sectionId:'a',assetId:'c'},{id:'three',sourceUnitId:'s',sectionId:'a',assetId:'b'},{id:'four',sourceUnitId:'s',sectionId:'b',assetId:'a'}];
 for(const i of [0,2,3])assert.equal(visualSequence(activities,assets,i).total,1);
 assert.equal(visualSequence(activities,assets,1),null);assert.equal(visualSequence(activities,assets,4),null);
});
