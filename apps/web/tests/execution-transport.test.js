import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createExecutionTransport} from '../src/lib/execution-transport.js';

const bytes=new TextEncoder().encode('{"fixture":"opaque server artifact"}');
const sha256=createHash('sha256').update(bytes).digest('hex');
const reference={id:'bound-server-reference',sha256};
const bind=value=>{const body=JSON.stringify(value);return{body,reference:{id:value.id,sha256:createHash('sha256').update(body).digest('hex')}};};

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

test('approved bound audio verifies its descriptor and delivered bytes before playback',async()=>{
 const audio=new Uint8Array([1,2,3,4]);const audioHash=createHash('sha256').update(audio).digest('hex');
 const fixture=bind({schema:'fia-bound-narration-audio@1',id:'approved-audio',delivery:{url:'/verified/audio',sha256:audioHash,bytes:4,mime:'audio/mpeg'},playbackRange:{startSeconds:1,endSeconds:2}});
 const calls=[];const transport=createExecutionTransport({fetch:async(url,options)=>{calls.push({url,options});return new Response(url.startsWith('/v1/artifacts/')?fixture.body:audio);}});
 const result=await transport.playBoundAudio(fixture.reference);
 assert.deepEqual(new Uint8Array(result.bytes),audio);assert.equal(result.mime,'audio/mpeg');assert.deepEqual(result.playbackRange,{startSeconds:1,endSeconds:2});
 assert.deepEqual(calls.map(x=>x.url),[`/v1/artifacts/${fixture.reference.sha256}`,'/verified/audio']);
 const corrupt=createExecutionTransport({fetch:async url=>new Response(url.startsWith('/v1/artifacts/')?fixture.body:'corrupt')});
 await assert.rejects(corrupt.playBoundAudio(fixture.reference),/could not be verified/);
});

test('bound original preparation forwards the supplied identity unchanged without its own polling loop',async()=>{
 const identity={packId:'eng.MRK-1-14-20',presentationRevision:'a'.repeat(64),language:'eng',edition:'fia-guide',quality:'original',activityId:'source-anchor',sourceUnitId:'S01-U001',sourceTextSha256:'b'.repeat(64)};
 const fixture=bind({schema:'fia-bound-narration-demand@1',id:'requested-original',identity});let requests=0,delegated;
 const transport=createExecutionTransport({fetch:async()=>{requests++;return new Response(fixture.body);}});
 const result=await transport.prepareOriginal(fixture.reference,{prepareNarration:async supplied=>{delegated=supplied;return{status:'preparing'};}});
 assert.deepEqual(delegated,identity);assert.deepEqual(result,{status:'preparing'});assert.equal(requests,1);
});

test('wrong bound artifact identity/schema cannot dispatch audio or preparation',async()=>{
 for(const value of [{schema:'fia-bound-narration-demand@1',id:'wrong',identity:{}},{schema:'unrecognized',id:'requested-original'}]){
  const fixture=bind(value);let calls=0;const transport=createExecutionTransport({fetch:async()=>{calls++;return new Response(fixture.body);}});
  await assert.rejects(transport.prepareOriginal({...fixture.reference,id:'requested-original'},{prepareNarration:()=>{throw Error('must not dispatch');}}),/bound narration.*invalid/);
  assert.equal(calls,1);
 }
});

test('presentation demand is explicit and status observation never resubmits it',async()=>{
 const demand={packId:'eng.MRK-1-14-20',baseRevision:'a'.repeat(64),sourceRevision:'b'.repeat(40),capability:'executable-presentation'},jobId='c'.repeat(64),calls=[];
 const transport=createExecutionTransport({fetch:async(url,options)=>{calls.push({url,options});return Response.json({schema:'fia-presentation-preparation@1',status:'preparing',jobId,reason:null,record:null},{status:202});}});
 assert.equal((await transport.preparePresentation(demand)).jobId,jobId);
 await transport.readPresentationPreparation(jobId);await transport.readPresentationPreparation(jobId);
 assert.deepEqual(calls.map(x=>x.options.method),['POST','GET','GET']);
 assert.deepEqual(JSON.parse(calls[0].options.body),demand);
 assert.equal(calls[1].url,`/v1/presentation-preparations/${jobId}`);
 assert.equal(calls[1].options.body,undefined);
});

test('presentation status preserves typed refusal and rejects inconsistent wire outcomes',async()=>{
 const jobId='c'.repeat(64);
 const make=(status,http)=>createExecutionTransport({fetch:async()=>Response.json({schema:'fia-presentation-preparation@1',status,jobId,reason:'not-available',record:null},{status:http})});
 assert.equal((await make('blocked',409).readPresentationPreparation(jobId)).status,'blocked');
 assert.equal((await make('unavailable',404).readPresentationPreparation(jobId)).status,'unavailable');
 await assert.rejects(make('preparing',200).readPresentationPreparation(jobId),/status is invalid/);
 await assert.rejects(make('ready',200).readPresentationPreparation(jobId),/status is invalid/);
 let calls=0;const transport=createExecutionTransport({fetch:async()=>{calls++;throw Error('unexpected');}});
 await assert.rejects(transport.readPresentationPreparation('../job'),/identity is invalid/);
 await assert.rejects(transport.preparePresentation({url:'https://untrusted.invalid'}),/demand is invalid/);
 assert.equal(calls,0);
});
