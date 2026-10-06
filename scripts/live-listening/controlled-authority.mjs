// Actual packaged authority for protocol tests. Only the caller's explicitly
// controlled original-preparation route may be replaced; catalog/plan bytes are real.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
export async function createControlledAuthority(repo,origin){
 const require=createRequire(join(repo,'package.json')),{build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
 const snapshot=await readFile(join(repo,'server/faces/worker/generated/snapshot.json'));
 const bundled=await build({entryPoints:[join(repo,'server/faces/worker/entry.mjs')],bundle:true,platform:'browser',format:'esm',external:['node:*'],write:false});
 const observations=[];
 const runtime=new Miniflare({...convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{FIA_API_ORIGIN:origin},durableObjects:{FIA_PREPARATION_JOBS:{className:'FiaPreparationJobs',useSQLite:true}},r2Buckets:['FIA_ORIGINALS'],serviceBindings:{ASSETS:async request=>{const path=new URL(request.url).pathname,file=resolve(repo,'dist','.'+path);if(!file.startsWith(join(repo,'dist')+'/'))return new Response('Invalid asset',{status:403});try{return new Response(await readFile(file),{headers:{'Content-Type':'application/json'}});}catch(error){if(error.code==='ENOENT')return new Response('Not found',{status:404});throw error;}}},outboundService:()=>{throw Error('Controlled pending test forbids outbound requests');}})});
 await runtime.ready;
 return {snapshotSha256:createHash('sha256').update(snapshot).digest('hex'),observations,async fetch(url,options){const response=await runtime.dispatchFetch(url,options);const bytes=await response.clone().arrayBuffer();observations.push({url,method:options.method,status:response.status,sha256:createHash('sha256').update(new Uint8Array(bytes)).digest('hex'),bytes:bytes.byteLength});return response;},dispose:()=>runtime.dispose()};
}
