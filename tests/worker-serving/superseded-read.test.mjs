import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash,webcrypto} from 'node:crypto';
import {buildGeneralizedSnapshot} from '../../server/fia/publication/generalized.mjs';import {createService} from '../../server/fia/publication/service.mjs';import {exportSnapshot} from '../../server/faces/worker/export-snapshot.mjs';import {snapshotStorage} from '../../server/faces/worker/snapshot.mjs';import {createReadOperations} from '../../server/fia/publication/read-operations.mjs';import {createWorker} from '../../server/faces/worker/adapter.mjs';import {serveRead} from '../../server/faces/http.mjs';import {serveMcp} from '../../server/faces/mcp.mjs';
// Supersession is not revocation. A worker already installed on a device keeps its saved copy when the server
// answers 503 and revokes it when the server answers 404, so a read this build can no longer satisfy answers 503
// with the body unchanged. Every answer here comes from the real serveRead over the real packaged snapshot.
globalThis.crypto??=webcrypto;
const hash=b=>createHash('sha256').update(b).digest('hex');
const authority=JSON.parse(readFileSync('server/fia/publication/trusted-generalized.json')),extension=buildGeneralizedSnapshot('apps/web/public',authority),legacy=exportSnapshot(createService(),JSON.parse(readFileSync('server/faces/worker/authority.json')));
const snapshot={...legacy,records:[...legacy.records,...extension.records],current:{...legacy.current,...extension.current},staticArtifacts:extension.staticArtifacts.filter(a=>!legacy.artifacts.some(b=>b.descriptor.sha256===a.descriptor.sha256))};
const origin='https://dev.fiaguide.app',packId='spa.LUK-1-5-25',superseded='0'.repeat(64),unknownDigest='1'.repeat(64);
const fetchAsset=async path=>new Response(readFileSync('apps/web/public'+path),{headers:{'content-type':'application/json'}});
const operations=(options={fetchAsset})=>createReadOperations(snapshotStorage(snapshot,options));
// The real serveRead with a recording response: status, headers and body exactly as the function wrote them.
async function read(path,ops=operations(),method='GET'){
 const out={status:0,headers:{},body:null};
 await serveRead({method,headers:{}},{writeHead(status,headers={}){out.status=status;out.headers=headers;return this;},end(body){out.body=body??null;}},new URL(origin+path),ops);
 return {...out,text:typeof out.body==='string'?out.body:null,json:()=>JSON.parse(out.body)};
}
const current=()=>snapshot.records.find(r=>r.packId===packId&&r.revision===snapshot.current[packId]);

test('a pinned read of a revision this build does not hold answers 503 with the unchanged body and no-store',async()=>{
 assert.ok(current(),'the fixture passage is published in this build');
 const stale=await read(`/v1/packs/${packId}?revision=${superseded}`);
 assert.equal(stale.status,503);
 assert.equal(stale.text,JSON.stringify({status:'unavailable',packId,reason:'revision-not-found'}),'the body is the read result, byte for byte');
 assert.equal(stale.headers['Cache-Control'],'no-store');assert.match(stale.headers['Content-Type'],/^application\/json/);assert.equal('Retry-After'in stale.headers,false,'no retry hint: the answer never becomes ready');
 const capability=await read(`/v1/packs/${packId}?revision=${superseded}&execution=2`);assert.equal(capability.status,503,'the capability read of a superseded revision answers the same');assert.equal(capability.text,stale.text);
});

test('a pinned read of an unknown passage takes the same answer, because the read result is the same',async()=>{
 const stale=await read(`/v1/packs/eng.MRK-999-1-2?revision=${superseded}`);
 assert.equal(stale.status,503);assert.deepEqual(stale.json(),{status:'unavailable',packId:'eng.MRK-999-1-2',reason:'revision-not-found'});
});

test('an unknown artifact digest and a missing static file answer 503',async()=>{
 const unknown=await read(`/v1/artifacts/${unknownDigest}`);
 assert.equal(unknown.status,503);assert.deepEqual(unknown.json(),{status:'unavailable',reason:'not-found'});assert.equal(unknown.headers['Cache-Control'],'no-store');
 const record=current(),missing=await read(record.artifact.path,operations({fetchAsset:async()=>new Response('missing',{status:404})}));
 assert.equal(missing.status,503);assert.equal(missing.json().reason,'artifact-not-found');
});

test('current, unknown, damaged and refused reads keep their answers',async()=>{
 const record=current(),unpinned=await read(`/v1/packs/${packId}`);
 assert.equal(unpinned.status,200);assert.deepEqual(unpinned.json(),record);
 const pinned=await read(`/v1/packs/${packId}?revision=${record.revision}`);assert.equal(pinned.status,200,'a pinned read of the revision this build holds is served');
 const artifact=await read(record.artifact.path);assert.equal(artifact.status,200);assert.equal(hash(artifact.body),record.revision);
 const absent=await read('/v1/packs/eng.MRK-999-1-2');
 assert.equal(absent.status,404,'an unknown passage read without a revision stays 404');assert.deepEqual(absent.json(),{status:'unavailable',packId:'eng.MRK-999-1-2',reason:'not-found'});
 const damaged=await read(record.artifact.path,operations({fetchAsset:async()=>new Response('<html>',{headers:{'content-type':'text/html'}})}));
 assert.equal(damaged.status,404,'an artifact that fails its integrity check stays 404');assert.equal(damaged.json().reason,'artifact-integrity-failed');
 assert.equal((await read(`/v1/packs/${packId}?revision=${superseded}&extra=x`)).status,400);
 assert.equal((await read(`/v1/packs/${packId}?revision=not-a-hash`)).status,400);
 assert.equal((await read(`/v1/artifacts/${unknownDigest}?x=1`)).status,400);
 assert.equal((await read('/v1/unknown')).status,404);
 assert.equal((await read(`/v1/packs/${packId}?revision=${superseded}`,operations(),'POST')).status,405);
});

test('blocked and preparing pack reads keep 409 and 202',async()=>{
 const blocked=await read(`/v1/packs/${packId}?revision=${superseded}`,{readPack:async()=>({status:'blocked',reason:'revision-not-found'})});
 assert.equal(blocked.status,409,'only an unavailable result is a superseded read');
 const preparing=await read(`/v1/packs/${packId}`,{readPack:async()=>({status:'preparing',retryAfterSeconds:3})});
 assert.equal(preparing.status,202);assert.equal(preparing.headers['Retry-After'],'3');
});

test('the preparation routes are unchanged: a poll for an unknown job stays 404',async()=>{
 const jobId='a'.repeat(64);
 const absent=await read('/v1/presentation-preparations/'+jobId);
 assert.equal(absent.status,404);assert.deepEqual(absent.json(),{status:'unavailable',reason:'presentation-preparation-unavailable'});
 // The preparation service answers an unknown job with reason not-found; that poll is not an artifact read.
 const unknown=await read('/v1/presentation-preparations/'+jobId,{...operations(),readPresentationPreparation:async args=>({status:'unavailable',jobId:args.jobId,reason:'not-found'})});
 assert.equal(unknown.status,404);assert.deepEqual(unknown.json(),{status:'unavailable',jobId,reason:'not-found'});
});

test('the deployed adapter passes the 503 and its body through, and the MCP face keeps the same typed body',async()=>{
 const worker=createWorker({origin,operations:operations(),serveRead,serveMcp}),response=await worker.fetch(new Request(`${origin}/v1/packs/${packId}?revision=${superseded}`),{});
 assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
 const body=await response.json();assert.deepEqual(body,{status:'unavailable',packId,reason:'revision-not-found'});
 const mcp=await worker.fetch(new Request(origin+'/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'read_pack',arguments:{packId,revision:superseded}}})}),{});
 assert.equal(mcp.status,200);assert.deepEqual((await mcp.json()).result.structuredContent,body);
});
