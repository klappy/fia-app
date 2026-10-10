import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createExecutionTransport} from '../src/lib/execution-transport.js';
const hash=b=>createHash('sha256').update(b).digest('hex'),audio=new Uint8Array([1,2,3,4]),mediaSHA=hash(audio),binding='a'.repeat(64);
function fixture(mime='audio/ogg') {return {schema:'fia-bound-narration-audio@1',id:'approved-audio:'+binding,delivery:{url:`/v1/approved-audio/${binding}/${mediaSHA}.${mime==='audio/ogg'?'ogg':'mp3'}`,sha256:mediaSHA,bytes:audio.length,mime},playbackRange:{startSeconds:3,endSeconds:4}};}
async function run(value,{headers,status=200,redirected=false,body=audio,abort,onNative}={}){
 const json=JSON.stringify(value),reference={id:value.id,sha256:hash(json)},calls=[];
 const transport=createExecutionTransport({fetch:async(url,options)=>{calls.push({url,options});if(url.startsWith('/v1/artifacts/'))return new Response(json);onNative?.();const r=new Response(body,{status,headers:headers||{'Content-Type':value.delivery.mime,'Content-Length':String(value.delivery.bytes),ETag:`"${value.delivery.sha256}"`}});if(redirected)Object.defineProperty(r,'redirected',{value:true});abort?.();return r;}});
 return {result:await transport.playBoundAudio(reference),calls};
}
test('retained approved MP3 and Ogg enforce declared native route and exact response profile',async()=>{for(const mime of ['audio/mpeg','audio/ogg']){const value=fixture(mime),{result,calls}=await run(value);assert.deepEqual(new Uint8Array(result.bytes),audio);assert.deepEqual(result.playbackRange,value.playbackRange);assert.equal(result.mime,mime);assert.equal(calls[1].options.redirect,'error');assert.equal(calls[1].options.cache,'no-store');}});
test('retained audio refuses wrong or absent response headers despite matching bytes',async()=>{const value=fixture(),good={'Content-Type':'audio/ogg','Content-Length':'4',ETag:`"${mediaSHA}"`};for(const headers of [{...good,'Content-Type':'audio/mpeg'},{...good,'Content-Type':'audio/ogg; charset=utf-8'},{...good,'Content-Length':'04'},{...good,'Content-Length':'5'},{...good,ETag:mediaSHA},{...good,ETag:`W/"${mediaSHA}"`},{...good,ETag:`"${'0'.repeat(64)}"`},{'Content-Type':'audio/ogg'}])await assert.rejects(run(value,{headers}));});
test('retained audio refuses redirects, partial status and changed bodies',async()=>{await assert.rejects(run(fixture(),{redirected:true}));for(const status of [206,403,404,416,503])await assert.rejects(run(fixture(),{status}));await assert.rejects(run(fixture(),{body:new Uint8Array([4,3,2,1])}));});
test('retained audio rejects malformed declared routes and bindings before native request',async()=>{for(const mutate of [v=>v.delivery.url+='?x=1',v=>v.delivery.url='https://other.invalid'+v.delivery.url,v=>v.delivery.url=v.delivery.url.replace(binding,'b'.repeat(64)),v=>v.delivery.url=v.delivery.url.replace(mediaSHA,'c'.repeat(64)),v=>v.delivery.url=v.delivery.url.replace('.ogg','.mp3'),v=>v.delivery.mime='audio/wav',v=>v.delivery.bytes=16777217,v=>v.id='approved-audio:bad']){const value=fixture();mutate(value);const json=JSON.stringify(value);let calls=0;const transport=createExecutionTransport({fetch:async()=>{calls++;return new Response(json);}});await assert.rejects(transport.playBoundAudio({id:value.id,sha256:hash(json)}));assert.equal(calls,1);}});
test('normalized approved-route aliases cannot escape strict profile through a legacy ID',async()=>{
 const canonical=fixture().delivery.url;
 for(const url of ['https://dev.fiaguide.app'+canonical,'//dev.fiaguide.app'+canonical,'/v1/other/../approved-audio'+canonical.slice('/v1/approved-audio'.length),'/v1/other/%2e%2e/approved-audio'+canonical.slice('/v1/approved-audio'.length),'https:\\\\dev.fiaguide.app'+canonical.replaceAll('/','\\')]){
  const value=fixture();value.id='legacy-looking-id';value.delivery.url=url;
  let nativeRequests=0;await assert.rejects(run(value,{headers:{},onNative:()=>nativeRequests++}),'Route alias must not enter legacy transport: '+url);assert.equal(nativeRequests,0);
 }
});
test('prototype property names cannot become supported audio MIME extensions',async()=>{
 for(const mime of ['toString','constructor','__proto__']){
  const value=fixture();value.delivery.mime=mime;value.delivery.url=`/v1/approved-audio/${binding}/${mediaSHA}.${({'audio/mpeg':'mp3','audio/ogg':'ogg'})[mime]}`;
  let nativeRequests=0;await assert.rejects(run(value,{onNative:()=>nativeRequests++}));assert.equal(nativeRequests,0);
 }
});
