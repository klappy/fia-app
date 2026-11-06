import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlaybackCache} from '../src/lib/playback-cache.js';
test('saved blobs stay bounded, evict before revoke, and protect the paused owner until release',()=>{
 let active='blob:0';const events=[];const cache=createPlaybackCache(3,{activeUrl:()=>active,evict:k=>events.push(['evict',k]),revoke:u=>events.push(['revoke',u])});
 for(let i=0;i<100;i++)cache.set('saved|'+i,'blob:'+i);
 assert.equal(cache.size,3);assert.equal(cache.get('saved|0'),'blob:0');assert.ok(!events.some(e=>e[1]==='blob:0'));
 cache.retain(['saved|99']);assert.equal(cache.size,2);
 active=null;cache.trim();assert.equal(cache.size,1);assert.equal(cache.get('saved|0'),undefined);
 cache.clear();assert.equal(cache.size,0);
 for(let i=0;i<events.length;i+=2){assert.equal(events[i][0],'evict');assert.equal(events[i+1][0],'revoke');}
});
