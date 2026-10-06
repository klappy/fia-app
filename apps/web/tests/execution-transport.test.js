import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createExecutionTransport} from '../src/lib/execution-transport.js';

const bytes=new TextEncoder().encode('{"fixture":"opaque server artifact"}');
const sha256=createHash('sha256').update(bytes).digest('hex');
const reference={id:'bound-server-reference',sha256};

test('bound artifact reads use the immutable authority and return verified opaque bytes',async()=>{
 const calls=[];
 const transport=createExecutionTransport({fetch:async(...args)=>{calls.push(args);return new Response(bytes);}});
 const result=await transport.readBoundArtifactBytes(reference);
 assert.deepEqual(new Uint8Array(result),bytes);
 assert.equal(calls.length,1);
 assert.equal(calls[0][0],`/v1/artifacts/${sha256}`);
 assert.equal(calls[0][1].method,'GET');
 assert.equal(calls[0][1].cache,'no-store');
 assert.equal(calls[0][1].redirect,'error');
 assert.equal(calls[0][1].body,undefined);
});

test('redirected matching bytes do not substitute for the current artifact authority',async()=>{
 const response=new Response(bytes);Object.defineProperty(response,'redirected',{value:true});
 const transport=createExecutionTransport({fetch:async()=>response});
 await assert.rejects(transport.readBoundArtifactBytes(reference),/could not be read/);
});

test('a known digest does not bypass current server refusal or accept changed bytes',async()=>{
 for(const status of [202,403,404,409,503]){
  const transport=createExecutionTransport({fetch:async()=>new Response(bytes,{status})});
  await assert.rejects(transport.readBoundArtifactBytes(reference),/could not be read/);
 }
 const transport=createExecutionTransport({fetch:async()=>new Response('changed')});
 await assert.rejects(transport.readBoundArtifactBytes(reference),/could not be verified/);
});

test('malformed or URL-bearing references cannot start requests',async()=>{
 let calls=0;
 const transport=createExecutionTransport({fetch:async()=>{calls++;return new Response(bytes);}});
 for(const ref of [null,{id:'x'},{id:'',sha256},{id:'x',sha256:'z'.repeat(64)},{...reference,url:'https://untrusted.invalid'}])
  await assert.rejects(transport.readBoundArtifactBytes(ref),/reference is invalid/);
 assert.equal(calls,0);
});

test('cancellation fences a fetch implementation that returns after abort',async()=>{
 const controller=new AbortController();let release;
 const transport=createExecutionTransport({fetch:()=>new Promise(resolve=>{release=()=>resolve(new Response(bytes));})});
 const pending=transport.readBoundArtifactBytes(reference,{signal:controller.signal});
 controller.abort();release();
 await assert.rejects(pending,{name:'AbortError'});
});

test('an already canceled read never accesses the server',async()=>{
 let calls=0;const controller=new AbortController();controller.abort();
 const transport=createExecutionTransport({fetch:async()=>{calls++;return new Response(bytes);}});
 await assert.rejects(transport.readBoundArtifactBytes(reference,{signal:controller.signal}),{name:'AbortError'});
 assert.equal(calls,0);
});
