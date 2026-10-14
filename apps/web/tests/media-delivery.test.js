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
 for(const change of [s=>s.entries.push(s.entries[0]),s=>s.entries[0].delivery.url='https://evil.example/audio/a',s=>s.entries[0].timing.status='unverified',s=>s.entries[0].delivery.q='low',s=>s.entries[0].path='//host/file']){const s=fixture();change(s);assert.throws(()=>validateDelivery(s,identity));}
 assert.throws(()=>validateDeliveryIndex({schema:1,packs:[{...identity,delivery:{url:'/mutable.json',sha256:'a'.repeat(64),bytes:3}}]}));
});

test('playable video permits bounded identity drift but retains transfer safety',async()=>{
 const {readPlayableVideo}=await import('../src/lib/media-delivery.js'),p={group:'video',bytes:6,sha256:hash('012345'),mime:'video/mp4',deliveryURL:'https://transcode.klappy.dev/video/source'},mp4='0000ftypisom-new';
 const response=(body,type='video/mp4',headers={})=>new Response(body,{headers:{'Content-Type':type,...headers}});
 assert.equal((await readPlayableVideo(response('012345'),p)).drift,false);
 const r=await readPlayableVideo(response(mp4,'video/mp4; codecs=avc1'),p);assert.equal(r.drift,true);assert.deepEqual(r.served,{bytes:mp4.length,sha256:hash(mp4)});
 for(const bad of [response('bad'),response(mp4,'text/html'),response(''),response(mp4,'video/mp4',{'Content-Length':'100'}),response(mp4,'video/mp4',{'Content-Length':'-1'})])await assert.rejects(readPlayableVideo(bad,p));
 for(const props of [{url:'https://evil.example/video'},{redirected:true},{type:'opaque'}]){const bad=response(mp4);for(const [key,value] of Object.entries(props))Object.defineProperty(bad,key,{value});await assert.rejects(readPlayableVideo(bad,p));}
 let canceled=false;const oversized=new ReadableStream({start(c){c.enqueue(new Uint8Array(16777217));},cancel(){canceled=true;}});await assert.rejects(readPlayableVideo(response(oversized),p),/too large/);assert.equal(canceled,true);
 const controller=new AbortController();let cancelAbort=false;const pending=new ReadableStream({cancel(){cancelAbort=true;}});const reading=readPlayableVideo(response(pending),p,{signal:controller.signal});controller.abort();await assert.rejects(reading,/Playback canceled/);assert.equal(cancelAbort,true);
});
