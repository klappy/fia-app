import test from 'node:test';import assert from 'node:assert/strict';
import {createExecutionTransport} from '../src/lib/execution-transport.js';
import {selectServerPresentation} from '../src/lib/library.js';
const id='eng.MRK-1-14-20';
const answer=(status,body,type='application/json')=>()=>new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers:{'Content-Type':type}});

// R1: the page tells what the server said. Only a malformed record is "invalid".
test('R1: readPack keeps unavailable and refused answers as records the selection can explain',async()=>{
 for(const [status,body] of [[404,{status:'unavailable',reason:'execution-job-policy'}],[400,{status:'refused',code:'invalid-request'}]]){
  const transport=createExecutionTransport({fetch:async()=>answer(status,body)()});
  assert.deepEqual(await transport.readPack(id),body);
 }
});
test('R1: a transient or missing server answer is a typed transient error, never "catalog is invalid"',async()=>{
 const cases=[answer(503,'This server content is not saved for offline use.','text/plain'),answer(500,{status:'refused',code:'internal-error'}),answer(429,{status:'refused',code:'rate-limited'}),()=>{throw new TypeError('Failed to fetch');}];
 for(const reply of cases){
  const transport=createExecutionTransport({fetch:async()=>reply()});
  await assert.rejects(transport.readPack(id),error=>error.code==='passage-transient'&&/could not be reached/.test(error.message)&&!/catalog is invalid/.test(error.message));
 }
});
test('R1: a presentation artifact with no answer or a transient answer is a typed transient error, so a restore keeps its key',async()=>{
 const bytes=new TextEncoder().encode('{}'),sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 const record={status:'ready',revision:sha,artifact:{sha256:sha,bytes:bytes.length,mime:'application/json'}};
 for(const reply of [()=>{throw new TypeError('Failed to fetch');},answer(503,'This server content is not saved for offline use.','text/plain'),answer(504,'','text/plain')]){
  const transport=createExecutionTransport({fetch:async()=>reply()});
  await assert.rejects(transport.readPresentationRecord(record),error=>error.code==='passage-transient'&&/could not be reached/.test(error.message));
 }
 // A wrong answer is still a verdict, not a missing connection.
 await assert.rejects(createExecutionTransport({fetch:async()=>new Response('nope',{status:404})}).readPresentationRecord(record),error=>error.code===undefined&&/could not be read/.test(error.message));
});
test('R1: "The server catalog is invalid." stays reserved for a malformed record',async()=>{
 for(const reply of [answer(409,'Server content could not be verified.','text/plain'),answer(200,{status:'ready',packId:'other'}),answer(404,{status:'ready'})]){
  const transport=createExecutionTransport({fetch:async()=>reply()});
  await assert.rejects(transport.readPack(id),error=>error.message==='The server catalog is invalid.'&&error.code==='passage-invalid');
 }
});
test('R1: selection names an unavailable or refused passage truthfully, with a code the sheet and restore can act on',async()=>{
 const cases=[[{status:'unavailable',reason:'execution-job-policy'},'passage-unavailable',/not available yet/],[{status:'refused',code:'invalid-request'},'passage-refused',/cannot be opened/],[{status:'preparing',jobId:'a'.repeat(64)},'passage-transient',/still being prepared/]];
 for(const [record,code,message] of cases){
  let artifactReads=0;const transport={readPack:async()=>record,readPresentationRecord:async()=>{artifactReads++;}};
  await assert.rejects(selectServerPresentation(id,{explicit:true,transport}),error=>error.code===code&&message.test(error.message)&&/Your current passage stays open\./.test(error.message));
  assert.equal(artifactReads,0);
 }
});
