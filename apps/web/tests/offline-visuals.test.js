import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {worker} from './helpers/offline-execution.js';
// F8 (cross-pericope PLAN §7): the service worker's native path for server-published originals.
const bytes=new Uint8Array([0xff,0xd8,0xff,1,2,3,4,5]),sha=createHash('sha256').update(bytes).digest('hex'),path=`/v1/original-visuals/${'1'.repeat(64)}/${'2'.repeat(64)}/${sha}`;
const image=(b=bytes,type='image/jpeg',status=200)=>new Response(b,{status,headers:{'Content-Type':type,ETag:`"${sha}"`}});
const kept=w=>w.stores.get('fia-v3-original-visuals@1')?.has(path)??false;

test('a verified original is kept; offline it is reused as kept',async()=>{
 const w=worker();w.reply(path,()=>image());
 const first=await w.fetch(path);assert.equal(first.status,200);assert.deepEqual(new Uint8Array(await first.arrayBuffer()),bytes);assert.ok(kept(w));
 w.offline(true);const offline=await w.fetch(path);assert.equal(offline.status,200);assert.deepEqual(new Uint8Array(await offline.arrayBuffer()),bytes);
});

test('online, a kept original is revalidated with If-None-Match and reused only on 304',async()=>{
 const w=worker();const seen=[];w.reply(path,init=>{seen.push(new Headers(init.headers).get('If-None-Match'));return seen.length===1?image():new Response(null,{status:304});});
 await w.fetch(path);const again=await w.fetch(path);assert.equal(again.status,200);assert.deepEqual(new Uint8Array(await again.arrayBuffer()),bytes);
 assert.deepEqual(seen,[null,`"${sha}"`]);
});

test('a 404 or 410 deletes the kept original; a corrupted or mistyped response is refused and never kept',async()=>{
 for(const status of [404,410]){const w=worker();w.reply(path,()=>image());await w.fetch(path);assert.ok(kept(w));w.reply(path,()=>new Response('gone',{status}));assert.equal((await w.fetch(path)).status,status);assert.equal(kept(w),false);w.offline(true);assert.equal((await w.fetch(path)).type,'error','nothing is served after deletion');}
 for(const bad of [()=>image(new Uint8Array([9,9,9])),()=>image(bytes,'text/html')]){const w=worker();w.reply(path,bad);const r=await w.fetch(path);assert.equal(r.status,502);assert.equal(kept(w),false);}
 // A corrupted kept copy is dropped before use, and the network answer is used instead.
 const w=worker();w.reply(path,()=>image());await w.fetch(path);w.stores.get('fia-v3-original-visuals@1').set(path,new Response(new Uint8Array([7]),{headers:{'Content-Type':'image/jpeg'}}));
 w.offline(true);assert.equal((await w.fetch(path)).type,'error','a corrupted copy is never served');
});

test('a transient server failure reuses the kept original; only exact original paths are handled',async()=>{
 const w=worker();w.reply(path,()=>image());await w.fetch(path);w.reply(path,()=>new Response('busy',{status:503}));const r=await w.fetch(path);assert.equal(r.status,200);
 const other=worker();assert.equal((await other.fetch(path+'?x=1')).status,404,'a query is passed through, not kept');assert.equal(other.stores.has('fia-v3-original-visuals@1'),false);
});
