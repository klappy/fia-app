import test from 'node:test';
import assert from 'node:assert/strict';
import {stepResources,displayedStepActivities} from '../src/lib/step-resources.js';
const assets={t:{id:'t',kind:'term',title:'Term',text:'Existing text'},m:{id:'m',kind:'map',title:'Map'},v:{id:'v',kind:'video',title:'Video',videoPrepared:true},x:{id:'x',kind:'image',title:'Other'}};
test('only exact current resources appear; broad pack allowlists do not invent step relevance or readiness',()=>{
 const rows=stepResources({assetId:'t',relatedAssetIds:['m','t','unknown'],availableAssetIds:['v','m','x']},assets);
 assert.deepEqual(rows.map(r=>[r.id,r.availability]),[['t','available'],['m','unavailable']]);
 assert.ok(!rows.some(r=>r.id==='x'||r.id==='v'));
});
test('a together-list exposes its displayed intro and item resources; separate lists do not leak future items',()=>{
 const activities=[{id:'intro',readingGroupId:'group',relatedAssetIds:['t']},{id:'item1',readingGroupId:'group',relatedAssetIds:['m']},{id:'item2',readingGroupId:'group',relatedAssetIds:['v']}];
 const contract={id:'group',layout:'together',introId:'intro',itemIds:['item1','item2']};
 assert.deepEqual(stepResources(activities[1],assets,{activities,listContracts:[contract]}).map(r=>r.id),['t','m','v']);
 assert.deepEqual(stepResources({...activities[1],readingGroupId:null},assets,{activities,listContracts:[{...contract,layout:'separate'}]}).map(r=>r.id),['m']);
});
test('all330 shipped packs preserve exact displayed references, no broad-list promotion and no invented assets',async()=>{
 const {readFileSync}=await import('node:fs');const base=new URL('../../../apps/web/public/content/',import.meta.url),registry=JSON.parse(readFileSync(new URL('registry.json',base)));let steps=0,linkedSteps=0;
 for(const pack of registry.packs){
  const p=JSON.parse(readFileSync(new URL(pack.presentation.url.replace('/content/',''),base))),context={activities:p.activities,listContracts:p.listContracts};
  for(const activity of p.activities){
   const displayed=displayedStepActivities(activity,p.activities,p.listContracts),ids=new Set(displayed.map(a=>a.id));
   const expected=[...new Set([...displayed,...p.activities.filter(a=>a.fulfills&&ids.has(a.fulfills))].flatMap(a=>[a.assetId,...(a.relatedAssetIds||[])]).filter(id=>p.assets[id]&&['scripture','term','image','map','video'].includes(p.assets[id].kind)))];
   const rows=stepResources(activity,p.assets,context);assert.deepEqual(rows.map(r=>r.id),expected,pack.id+':'+activity.id);if(rows.length)linkedSteps++;steps++;
  }
 }
 assert.equal(registry.packs.length,330);assert.equal(steps,29097);assert.ok(linkedSteps>0&&linkedSteps<steps,'source no-resource steps stay distinct from broad pack lists');
});

test('authored fulfillment resources appear at their source instruction, without unrelated future resources',()=>{
 const activities=[{id:'intro'},{id:'reading',fulfills:'intro',assetId:'t'},{id:'later',assetId:'v'}];
 assert.deepEqual(stepResources(activities[0],assets,{activities}).map(r=>r.id),['t']);
});


test('pending media checks do not prematurely label src-stripped resources unavailable',()=>{
 const activity={relatedAssetIds:['t','m','v','x']};
 const pending=stepResources(activity,assets,{verifying:true});
 assert.deepEqual(pending.map(r=>[r.id,r.availability]),[['t','available'],['m','checking'],['v','online'],['x','checking']]);
 const complete=stepResources(activity,assets,{verifying:false});
 assert.equal(complete.find(r=>r.id==='m').availability,'unavailable');
 const verified=stepResources(activity,{...assets,m:{...assets.m,src:'/verified-map.webp'}},{verifying:true});
 assert.equal(verified.find(r=>r.id==='m').availability,'available');
 assert.deepEqual(pending.map(r=>r.id),complete.map(r=>r.id),'checking never removes selectable resources');
});
