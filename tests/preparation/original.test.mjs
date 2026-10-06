import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256} from '../../server/fia/preparation/contract.mjs';
import {acquireOriginal,storeOriginal,readOriginal,originalResponse} from '../../server/fia/preparation/original.mjs';
async function fixture(size=150000){const bytes=Uint8Array.from({length:size},(_,i)=>i%251);return {bytes,source:{url:'https://publisher.example/literal/p2.mp3',sha256:await sha256(bytes),bytes:size,duration:58.2}};}
function storage(failAt=Infinity){
 const values=new Map();let puts=0;
 return {values,get:async key=>structuredClone(values.get(key)),async transaction(action){const staged=new Map(values);await action({put:async(key,value)=>{if(++puts===failAt)throw Error('simulated-transaction-failure');staged.set(key,structuredClone(value));}});values.clear();for(const [key,value] of staged)values.set(key,value);}};
}
test('literal source acquisition uses manual redirects and bounded abort signal with exact bytes',async()=>{
 const {source,bytes}=await fixture();let calls=0;
 const actual=await acquireOriginal(source,async(url,options)=>{calls++;assert.equal(url,source.url);assert.equal(options.redirect,'manual');assert(options.signal instanceof AbortSignal);assert.equal(options.signal.aborted,false);return new Response(bytes,{headers:{'Content-Type':'audio/mpeg; charset=binary'}});});
 assert.equal(calls,1);assert.deepEqual(actual,bytes);
});
test('acquisition refuses redirects status MIME identity length and oversized bodies',async()=>{
 const {source,bytes}=await fixture(20);
 for(const response of [new Response(null,{status:302,headers:{Location:'https://other.example'}}),new Response(bytes,{status:206,headers:{'Content-Type':'audio/mpeg'}}),new Response(bytes,{headers:{'Content-Type':'text/html'}}),new Response(bytes.slice(1),{headers:{'Content-Type':'audio/mpeg'}}),new Response(new Uint8Array(21),{headers:{'Content-Type':'audio/mpeg'}}),new Response(new Uint8Array(20),{headers:{'Content-Type':'audio/mpeg'}})])await assert.rejects(acquireOriginal(source,async()=>response));
 let fetched=false;await assert.rejects(acquireOriginal({...source,bytes:2*1024*1024+1},async()=>{fetched=true;}),/source-limit/);assert.equal(fetched,false);
 const failedBody=new ReadableStream({start(controller){controller.error(Error('body-aborted'));}});await assert.rejects(acquireOriginal(source,async()=>new Response(failedBody,{headers:{'Content-Type':'audio/mpeg'}})),/body-aborted/);
});
test('atomic 64KiB chunks round trip and simulated midtransaction rollback exposes nothing',async()=>{
 const {source,bytes}=await fixture(),disk=storage();await storeOriginal(disk,source,bytes);
 assert.deepEqual([...disk.values.keys()],['source:0','source:1','source:2','source']);assert.equal(disk.values.get('source:0').length,65536);assert.equal(disk.values.get('source:1').length,65536);assert.equal(disk.values.get('source:2').length,18928);assert.deepEqual(await readOriginal(disk,source),bytes);
 const fail=storage(2);await assert.rejects(storeOriginal(fail,source,bytes),/transaction-failure/);assert.equal(fail.values.size,0);await assert.rejects(readOriginal(fail,source),/not-verified/);
});
test('retained source rejects corrupt metadata missing or altered chunks',async()=>{
 const {source,bytes}=await fixture();
 for(const mutate of [d=>d.values.get('source').sha256='a'.repeat(64),d=>d.values.get('source').bytes--,d=>d.values.get('source').chunks--,d=>d.values.get('source').state='pending',d=>d.values.delete('source:1'),d=>d.values.set('source:1',new Uint8Array(2)),d=>d.values.get('source:1')[0]^=1]){const disk=storage();await storeOriginal(disk,source,bytes);mutate(disk);await assert.rejects(readOriginal(disk,source));}
});
test('original response full HEAD suffix open and clamped ranges have exact bodies and lengths',async()=>{
 const {source,bytes}=await fixture(20);
 for(const [method,range,status,start,end] of [['GET',null,200,0,20],['HEAD',null,200,0,20],['GET','bytes=-5',206,15,20],['GET','bytes=7-',206,7,20],['GET','bytes=5-100',206,5,20],['HEAD','bytes=5-9',206,5,10],['GET','bytes=-100',206,0,20]]){
  const response=originalResponse(new Request('https://app.example/audio',{method,headers:range?{Range:range}:{}}),source,bytes);assert.equal(response.status,status);assert.equal(response.headers.get('Content-Length'),String(end-start));assert.equal(response.headers.get('Accept-Ranges'),'bytes');assert.equal(response.headers.get('ETag'),`"${source.sha256}"`);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),method==='HEAD'?new Uint8Array():bytes.slice(start,end));if(status===206)assert.equal(response.headers.get('Content-Range'),`bytes ${start}-${end-1}/20`);
 }
});
test('unsatisfiable and multi ranges fail; If-Range mismatch serves complete representation',async()=>{
 const {source,bytes}=await fixture(20);
 for(const range of ['bytes=20-','bytes=8-4','bytes=-0','bytes=0-1,4-5','bytes=-','items=0-1']){const response=originalResponse(new Request('https://app.example/audio',{headers:{Range:range}}),source,bytes);assert.equal(response.status,416,range);assert.equal(response.headers.get('Content-Range'),'bytes */20');assert.equal((await response.arrayBuffer()).byteLength,0);}
 for(const [ifRange,status,length] of [[`"${source.sha256}"`,206,2],['"different"',200,20],['Mon, 05 Oct 2026 00:00:00 GMT',200,20]]){const response=originalResponse(new Request('https://app.example/audio',{headers:{Range:'bytes=0-1','If-Range':ifRange}}),source,bytes);assert.equal(response.status,status);assert.equal(response.headers.get('Content-Length'),String(length));assert.equal((await response.arrayBuffer()).byteLength,length);}
 assert.equal(originalResponse(new Request('https://app.example/audio',{method:'POST'}),source,bytes).status,405);
});
