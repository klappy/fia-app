import test from 'node:test';
import assert from 'node:assert/strict';
import {stepResources} from '../src/lib/step-resources.js';
test('step and passage resources stay reachable without invented source links or availability',()=>{
 const assets={t:{id:'t',kind:'term',title:'Term',text:'Existing text'},m:{id:'m',kind:'map',title:'Map'},v:{id:'v',kind:'video',title:'Video',videoPrepared:true},x:{id:'x',kind:'image',title:'Other'}};
 const rows=stepResources({assetId:'t',relatedAssetIds:['m','t'],availableAssetIds:['v','m','unknown']},assets);
 assert.deepEqual(rows.map(r=>[r.id,r.related,r.availability]),[['t',true,'available'],['m',true,'unavailable'],['v',false,'online']]);
 assert.ok(!rows.some(r=>r.id==='x'));
});

test('every shipped guide step exposes its authorized passage resources, including steps without their own list',async()=>{
 const {readFileSync}=await import('node:fs');const {passageResourceIds}=await import('../src/lib/step-resources.js');
 const base=new URL('../../../apps/web/public/content/',import.meta.url),registry=JSON.parse(readFileSync(new URL('registry.json',base)));let steps=0;
 for(const pack of registry.packs){
  const presentation=JSON.parse(readFileSync(new URL(pack.presentation.url.replace('/content/',''),base)));
  const allowed=passageResourceIds(presentation.activities),expected=allowed.filter(id=>presentation.assets[id]&&['scripture','term','image','map','video'].includes(presentation.assets[id].kind));
  for(const activity of presentation.activities){const rows=stepResources(activity,presentation.assets,allowed);assert.ok(expected.every(id=>rows.some(r=>r.id===id)),pack.id+':'+activity.id);steps++;}
 }
 assert.equal(registry.packs.length,330);assert.equal(steps,29097);
});
