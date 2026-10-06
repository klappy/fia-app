import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import {resolve} from 'node:path';
const require=createRequire(import.meta.url),{build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8').replace(/^\s*\/\/.*$/gm,'').replace(/,\s*([}\]])/g,'$1'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const bundle=await build({entryPoints:[config.main],bundle:true,format:'esm',platform:'browser',external:['node:buffer','node:crypto','node:zlib'],write:false});
const snapshot=JSON.parse(readFileSync('server/faces/worker/generated/snapshot.json'));
const headers={'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'};
test('real app assets and Worker API coexist using actual reviewed build/configuration',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,bindings:config.env.dev.vars,assets:{routerConfig:{has_user_worker:true},directory:resolve(config.assets.directory),binding:config.assets.binding,run_worker_first:config.assets.run_worker_first,assetConfig:{not_found_handling:config.assets.not_found_handling,html_handling:config.assets.html_handling}}}));
 try{
  const origin=config.env.dev.vars.FIA_API_ORIGIN;
  const sampleIds=['eng.MRK-1-1-13','spa.MRK-1-1-13','eng.MRK-1-14-20','spa.MRK-1-14-20'];
  const ordered=[...sampleIds.map(id=>snapshot.records.find(r=>r.packId===id)).filter(Boolean),...snapshot.records];
  for(const record of ordered){
   const res=await mf.dispatchFetch(origin+'/v1/packs/'+record.packId);assert.equal(res.status,200,await res.clone().text());assert.deepEqual(await res.json(),record);
   const bytes=await(await mf.dispatchFetch(origin+record.artifact.path)).arrayBuffer();assert.equal(bytes.byteLength,record.artifact.bytes);assert.equal(hash(Buffer.from(bytes)),record.artifact.sha256);
   const rpc=await mf.dispatchFetch(origin+'/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:record.packId,method:'tools/call',params:{name:'read_pack',arguments:{packId:record.packId}}})});assert.deepEqual((await rpc.json()).result.structuredContent,record);
   const artifactRpc=await mf.dispatchFetch(origin+'/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:record.packId,method:'tools/call',params:{name:'read_artifact',arguments:{sha256:record.revision}}})});
   const result=(await artifactRpc.json()).result.structuredContent;assert.equal(result.status,'ready');assert.equal(hash(Buffer.from(result.content)),record.revision);assert.equal(Buffer.byteLength(result.content),record.artifact.bytes);
  }
  for(const path of ['/v1','/v1/unknown','/mcp/unknown']){const r=await mf.dispatchFetch(origin+path,{headers:{'Sec-Fetch-Mode':'navigate'}});assert.equal(r.status,404,path);assert.match(r.headers.get('content-type'),/json/);}
  const shell=await mf.dispatchFetch(origin+'/session/continuation',{headers:{'Sec-Fetch-Mode':'navigate'}});assert.equal(await shell.text(),readFileSync('dist/index.html','utf8'));
  for(const path of ['/version.json','/sw.js','/docs/V3-BLUEPRINT.html']){
   // The existing bundle determines exact paths; no API routing may change their bytes.
   const r=await mf.dispatchFetch(origin+path);assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),hash(readFileSync('dist'+path)));
  }
  const media=snapshot.records.find(r=>r.capability==='approved-presentation-artifact').media.files;
  for(const file of media){const b=readFileSync('dist'+file.path);assert.equal(b.length,file.bytes);assert.equal(hash(b),file.sha256);}
  const sample=media.find(f=>f.path.endsWith('.mp3'));const response=await mf.dispatchFetch(origin+sample.path);assert.equal(hash(Buffer.from(await response.arrayBuffer())),sample.sha256);
  const offline=JSON.parse(readFileSync('dist/offline-manifest.json'));assert.ok(!offline.files.some(f=>f.path.includes('snapshot')||f.path.startsWith('/v1/')||f.path==='/version.json'));
 }finally{await mf.dispose();}
});
