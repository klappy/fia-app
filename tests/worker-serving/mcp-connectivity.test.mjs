import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorker} from '../../server/faces/worker/adapter.mjs';
import {serveMcp,VERSION} from '../../server/faces/mcp.mjs';
const origin='https://dev.fiaguide.app';
const worker=createWorker({origin,operations:{},serveMcp,serveRead(){throw Error('not expected');}});
const env={ASSETS:{fetch:()=>new Response('SPA fixture')}};
const headers={'content-type':'application/json',accept:'application/json, text/event-stream'};
const rpc=(body,extra={})=>worker.fetch(new Request(origin+'/mcp',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)}),env);
test('initialize negotiates the supported version, then lists tools without work',async()=>{
 for(const version of [VERSION,'2025-03-26','2025-11-25']){
  const response=await rpc({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:version,capabilities:{},clientInfo:{name:'test',version:'1'}}});
  assert.equal(response.status,200);assert.equal((await response.json()).result.protocolVersion,version);
 }
 const init=await rpc({jsonrpc:'2.0',method:'notifications/initialized'},{'mcp-protocol-version':VERSION});assert.equal(init.status,202);
 const list=await rpc({jsonrpc:'2.0',id:2,method:'tools/list'},{'mcp-protocol-version':VERSION});assert.equal(list.status,200);assert.equal((await list.json()).result.tools.length,2);
 for(const protocolVersion of [null,12])assert.ok((await (await rpc({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion,capabilities:{},clientInfo:{name:'test',version:'1'}}})).json()).error);
 assert.equal((await rpc({jsonrpc:'2.0',id:2,method:'tools/list'},{'mcp-protocol-version':'2099-01-01'})).status,400);
 assert.equal((await rpc({jsonrpc:'2.0',id:2,method:'tools/list'},{Origin:'https://evil.test'})).status,403);
 assert.equal((await worker.fetch(new Request(origin+'/mcp',{headers:{accept:'text/event-stream'}}),env)).status,200);
});
test('modern discovery receives legacy error and client can fall back to negotiated initialization',async()=>{
 const probe=await rpc({jsonrpc:'2.0',id:1,method:'server/discover',params:{}},{'mcp-protocol-version':'2026-07-28','mcp-method':'server/discover'});
 assert.equal(probe.status,400);assert.equal((await probe.json()).error.code,-32000);
 const fallback=await rpc({jsonrpc:'2.0',id:2,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'fallback-fixture',version:'1'}}});
 assert.equal(fallback.status,200);const version=(await fallback.json()).result.protocolVersion;assert.equal(version,'2025-11-25');
 const list=await rpc({jsonrpc:'2.0',id:3,method:'tools/list'},{'mcp-protocol-version':version});assert.equal(list.status,200);
});
test('unused OAuth discovery is explicit 404, routed ahead of SPA assets',async()=>{
 const config=readFileSync(new URL('../../wrangler.jsonc',import.meta.url),'utf8');
 for(const name of ['oauth-authorization-server','oauth-protected-resource','openid-configuration']){
  const base='/.well-known/'+name;
  assert.ok(config.includes(JSON.stringify(base)));assert.ok(config.includes(JSON.stringify(base+'/*')));
  for(const path of [base,base+'/mcp'])for(const method of ['GET','HEAD']){
   const r=await worker.fetch(new Request(origin+path,{method}),env);assert.equal(r.status,404);assert.match(r.headers.get('content-type'),/application\/json/);
  }
 }
 assert.equal(await(await worker.fetch(new Request(origin+'/activity/1'),env)).text(),'SPA fixture');
});
test('strict tool schemas refuse unknown fields and no readonly probe prepares work',async()=>{
 let reads=0,prepares=0;
 const w=createWorker({origin,serveMcp,serveRead(){},operations:{readPack:async args=>{reads++;return {status:'ready',packId:args.packId};},preparePresentation:async()=>{prepares++;return {status:'ready'};}}});
 const call=body=>w.fetch(new Request(origin+'/mcp',{method:'POST',headers,body:JSON.stringify(body)}),env);
 const bad=await call({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'read_pack',arguments:{packId:'x',extra:true}}});
 assert.equal((await bad.json()).result.isError,true);assert.equal(reads,0);
 const results=await Promise.all(Array.from({length:8},(_,id)=>call({jsonrpc:'2.0',id,method:'tools/call',params:{name:'read_pack',arguments:{packId:'x'}}})));
 for(const r of results)assert.equal((await r.json()).result.structuredContent.status,'ready');
 assert.equal(reads,8);assert.equal(prepares,0);
 const large=await w.fetch(new Request(origin+'/mcp',{method:'POST',headers,body:'x'.repeat(16385)}),env);assert.equal(large.status,413);
 const malformed=await w.fetch(new Request(origin+'/mcp',{method:'POST',headers,body:'{'}),env);assert.equal(malformed.status,400);
 const missing=await call({jsonrpc:'2.0',id:9,method:'unknown'});assert.equal((await missing.json()).error.code,-32601);
});

test('invalid UTF8 inside otherwise valid JSON is refused before tool dispatch',async()=>{
 const body=Buffer.concat([Buffer.from('{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"read_pack\",\"arguments\":{\"packId\":\"'),Buffer.from([255]),Buffer.from('\"}}}')]);
 assert.equal((await worker.fetch(new Request(origin+'/mcp',{method:'POST',headers,body}),env)).status,400);
});
