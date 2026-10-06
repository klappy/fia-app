import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {pathToFileURL,fileURLToPath} from 'node:url';import {resolve,join} from 'node:path';import {createHash} from 'node:crypto';
import {exportSnapshot} from '../../server/faces/worker/export-snapshot.mjs';
const root=resolve(process.env.FIA_PUBLICATION_ROOT||'.');
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json'));
const {build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const publication=await import(pathToFileURL(join(root,'server/fia/publication/service.mjs')));
const origin='https://dev.fiaguide.app',hash=b=>createHash('sha256').update(b).digest('hex');
const source=publication.createService();
const packId='fia-mark-approved-presentation',sha256='ccd72f23c23f932651b500b730b285f32fabd37e50037b5af91d8881f1403975';
const snapshot=exportSnapshot(source,{publicationSourceCommit:'b7bad3a4e91981ca6aa4976fec2831a1cbd16a7a',publicationRecipeCommit:'98e0fc84211da4c1c5829299e1196aed6a4bfff7',hostingRecipeCommit:'78fb93695b59d3417070e1e9a5d038f8f5d7f203',artifacts:[{packId,sha256,bytes:454295,envelopeSha256:'3169695f561467b02212a514f70d7b02bb7b1bec49951386da290430f3e546a6',current:true}]});
const local=p=>fileURLToPath(new URL('../../server/faces/worker/'+p,import.meta.url));
const bundled=await build({entryPoints:[local('entry.mjs')],bundle:true,format:'esm',platform:'browser',external:['node:buffer','node:crypto'],write:false,plugins:[{name:'accepted-dependencies',setup(b){
 b.onResolve({filter:/^\.\.\/(http|mcp)\.mjs$/},args=>({path:join(root,'server/faces',args.path.split('/').at(-1))}));
 b.onResolve({filter:/read-operations\.mjs$/},()=>({path:join(root,'server/fia/publication/read-operations.mjs')}));
 b.onResolve({filter:/generated\/snapshot\.json$/},()=>({path:'snapshot',namespace:'accepted-snapshot'}));
 b.onLoad({filter:/.*/,namespace:'accepted-snapshot'},()=>({contents:JSON.stringify(snapshot),loader:'json'}));
}}]});
const headers={'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'};
const rpc=(name,args)=>({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}});
async function withRuntime(run){const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{FIA_API_ORIGIN:origin},serviceBindings:{ASSETS:()=>new Response('static-fixture')}}));try{await run(mf);}finally{await mf.dispose();}}
test('actual packaged Workers runtime serves accepted bytes through unchanged HTTP/MCP faces',async()=>{
 await withRuntime(async mf=>{
  const read=await mf.dispatchFetch(origin+'/v1/packs/'+packId),record=await read.json();assert.equal(read.status,200);assert.deepEqual(record,source.readPack({packId}));
  const mcp=await mf.dispatchFetch(origin+'/mcp',{method:'POST',headers,body:JSON.stringify(rpc('read_pack',{packId}))});assert.deepEqual((await mcp.json()).result.structuredContent,record);
  const artifact=await mf.dispatchFetch(origin+record.artifact.path);assert.equal(artifact.headers.get('etag'),'"'+sha256+'"');assert.equal(hash(Buffer.from(await artifact.arrayBuffer())),sha256);
  const mr=await mf.dispatchFetch(origin+'/mcp',{method:'POST',headers,body:JSON.stringify(rpc('read_artifact',{sha256}))});assert.equal(hash((await mr.json()).result.structuredContent.content),sha256);
  for(const [path,status]of [['/v1/unknown',404],['/v1/packs/missing',404],['/v1/packs/'+packId+'?extra=x',400],['/v1/packs/'+packId+'?revision='+ '0'.repeat(64),404],['/mcp/x',404]]){const r=await mf.dispatchFetch(origin+path,{headers:{'Sec-Fetch-Mode':'navigate'}});assert.equal(r.status,status,path);assert.match(r.headers.get('content-type'),/json/);}
  assert.equal((await mf.dispatchFetch(origin+'/v1/packs/'+packId,{method:'POST'})).status,405);
  assert.equal((await mf.dispatchFetch(origin+'/mcp',{method:'POST',headers:{...headers,origin:'null'},body:'{}'})).status,403);
  assert.equal((await mf.dispatchFetch(origin+'/mcp',{method:'POST',headers,body:'x'.repeat(16385)})).status,413);
  assert.equal((await mf.dispatchFetch(origin+'/mcp',{method:'POST',headers,body:new Uint8Array([255])})).status,400);
  assert.equal(await(await mf.dispatchFetch(origin+'/activity/1')).text(),'static-fixture');
 });
 await withRuntime(async mf=>{assert.equal((await(await mf.dispatchFetch(origin+'/v1/packs/'+packId)).json()).revision,sha256);});
});
