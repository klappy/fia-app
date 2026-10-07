// Actual packaged authority for protocol tests. Only the caller's explicitly
// controlled original-preparation route may be replaced; catalog/plan bytes are real.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
// Opt-in local fixture (SCRIPTED-JOURNEYS J4 passage-only row): one approved Scripture recording,
// retained in the local originals bucket before the first read, as a hosted Worker retains it. The bytes
// must match a binding in the packaged proof index, so only the reviewed recording can be served.
async function retainApprovedAudio(repo,runtime,snapshot,file){
 const descriptor=JSON.parse(snapshot).approvedAudioProofIndex,proof=await readFile(join(repo,'dist',descriptor.path));
 if(sha256(proof)!==descriptor.sha256)throw Error('The packaged approved-audio proof index does not match the snapshot');
 const bytes=new Uint8Array(await readFile(file)),digest=sha256(bytes),bindings=JSON.parse(proof).bindings.filter(b=>b.media.sha256===digest&&b.media.bytes===bytes.length);
 if(!bindings.length)throw Error('The approved-audio fixture matches no packaged binding');
 const {createRetainedApprovedAudio}=await import(pathToFileURL(join(repo,'server/fia/preparation/approved-audio-runtime.mjs')).href);
 const store=createRetainedApprovedAudio({bucket:await runtime.getR2Bucket('FIA_ORIGINALS'),validateBinding:async()=>false});
 const result=await store.retain({media:bindings[0].media,bytes,provenance:{kind:'local-preview-fixture',sha256:digest}});
 if(result.status!=='ready')throw Error(`The approved-audio fixture was not retained: ${result.reason||result.status}`);
 return bindings.map(b=>({packId:b.packId,assetId:b.assetId,sha256:digest}));
}
export async function createControlledAuthority(repo,origin,{approvedAudio=null}={}){
 const require=createRequire(join(repo,'package.json')),{build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
 const snapshot=await readFile(join(repo,'server/faces/worker/generated/snapshot.json'));
 const bundled=await build({entryPoints:[join(repo,'server/faces/worker/entry.mjs')],bundle:true,platform:'browser',format:'esm',external:['node:*'],write:false});
 const observations=[];
 const runtime=new Miniflare({...convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{FIA_API_ORIGIN:origin},durableObjects:{FIA_PREPARATION_JOBS:{className:'FiaPreparationJobs',useSQLite:true}},r2Buckets:['FIA_ORIGINALS'],serviceBindings:{ASSETS:async request=>{const path=new URL(request.url).pathname,file=resolve(repo,'dist','.'+path);if(!file.startsWith(join(repo,'dist')+'/'))return new Response('Invalid asset',{status:403});try{return new Response(await readFile(file),{headers:{'Content-Type':'application/json'}});}catch(error){if(error.code==='ENOENT')return new Response('Not found',{status:404});throw error;}}},outboundService:()=>{throw Error('Controlled pending test forbids outbound requests');}})});
 await runtime.ready;
 let retained=[];
 try{if(approvedAudio)retained=await retainApprovedAudio(repo,runtime,snapshot,approvedAudio);}catch(error){await runtime.dispose();throw error;}
 return {snapshotSha256:createHash('sha256').update(snapshot).digest('hex'),retained,observations,async fetch(url,options){const response=await runtime.dispatchFetch(url,options);const bytes=await response.clone().arrayBuffer();observations.push({url,method:options.method,status:response.status,sha256:createHash('sha256').update(new Uint8Array(bytes)).digest('hex'),bytes:bytes.byteLength});return response;},dispose:()=>runtime.dispose()};
}
