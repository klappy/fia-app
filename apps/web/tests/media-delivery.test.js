import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readVerifiedMedia,validateDelivery,validateDeliveryIndex} from '../src/lib/media-delivery.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
const file={bytes:3,sha256:hash('abc'),mime:'audio/ogg'};
test('selected media rejects HTML, corrupt bytes and oversized streaming body before completion',async()=>{
 assert.deepEqual([...await readVerifiedMedia(new Response('abc',{headers:{'Content-Type':'audio/ogg'}}),file)],[97,98,99]);
 await assert.rejects(readVerifiedMedia(new Response('abc',{headers:{'Content-Type':'text/html'}}),file),/format/);
 await assert.rejects(readVerifiedMedia(new Response('bad',{headers:{'Content-Type':'audio/ogg'}}),file),/verified/);
 let canceled=false;const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(4));},cancel(){canceled=true;}});
 await assert.rejects(readVerifiedMedia(new Response(body,{headers:{'Content-Type':'audio/ogg'}}),file),/exceeded/);assert.equal(canceled,true);
});
const fixture=()=>({schema:1,packId:'eng.MRK-1-1-13',presentationRevision:'a'.repeat(64),recipeRevision:'accepted',entries:[{path:'/audio/a.mp3',source:{url:'https://fiaguide.app/audio/a.mp3',sha256:'b'.repeat(64),bytes:10,provenance:{}},delivery:{url:'https://transcode.klappy.dev/audio/preset=voice,q=medium,f=opus/https://fiaguide.app/audio/a.mp3',...file,kind:'audio',format:'opus',preset:'voice',q:'medium',status:'transformed'},timing:{status:'not-applicable'}}]});
test('delivery identity rejects different pack, unsafe URL, duplicate paths and unverified timing',()=>{
 const valid=fixture(),identity={packId:valid.packId,presentationRevision:valid.presentationRevision};assert.equal(validateDelivery(valid,identity),valid);
 assert.throws(()=>validateDelivery(valid,{...identity,packId:'spa.MRK-1-1-13'}));
 for(const change of [s=>s.entries.push(s.entries[0]),s=>s.entries[0].delivery.url='https://evil.example/audio/a',s=>s.entries[0].timing.status='unverified',s=>s.entries[0].path='//host/file']){const s=fixture();change(s);assert.throws(()=>validateDelivery(s,identity));}
 assert.throws(()=>validateDeliveryIndex({schema:1,packs:[{...identity,delivery:{url:'/mutable.json',sha256:'a'.repeat(64),bytes:3}}]}));
});
