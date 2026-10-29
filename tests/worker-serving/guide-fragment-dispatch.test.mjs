import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {buildGeneralizedSnapshot} from '../../server/fia/publication/generalized.mjs';
import {exportGuideSources} from '../../server/fia/compiler/presentation/export-guide-sources.mjs';
import {buildApprovedAudioProofIndex} from '../../scripts/approved-audio-proof-index.mjs';
import {guideFragmentIdentity,GUIDE_REPOSITORY} from '../../server/fia/preparation/guide-fragment.mjs';
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json')),{build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://dev.fiaguide.app',publicRoot='apps/web/public';
const SOURCE={repo:GUIDE_REPOSITORY,revision:'eb744452eb8d7c852caadde9d3181cddfe571119',path:'spa/json/42.content.json',expectedSha256:'b6de7d69975c25a50226122a531148bdad3fdeec3efae4f46bc4b1ef409ec5f7'};

test('worker.mjs carries exactly one guide-fragment dispatch line, after the executable dispatch and before the guide-unit dispatch',async()=>{
 const src=await readFile('server/fia/preparation/worker.mjs','utf8'),lines=src.split('\n');
 assert.equal(lines.filter(l=>l.includes('serveGuideFragmentObject(')).length,1);
 const i=lines.findIndex(l=>l.includes("from './guide-dispatch.mjs'"));assert.match(lines[i+1],/^import \{serveGuideFragmentObject\} from '\.\/guide-fragment\.mjs';$/);
 const e=lines.findIndex(l=>/const execution=await serveExecutableObject\(.*if\(execution\)return execution;/.test(l));
 assert.equal(lines[e+1].trim(),'const fragment=await serveGuideFragmentObject(request,this.ctx,this.env,{snapshot:this.presentationExecutionCapabilities()?.snapshot??null});if(fragment)return fragment;');assert.match(lines[e+2],/const unit=await serveGuideUnitObject\(/);
 assert.doesNotMatch(await readFile('server/faces/worker/entry.mjs','utf8'),/guide-fragment/,'no public route or capability');
});
// The real release Worker (entry.mjs and FiaPreparationJobs), with its snapshot composed from the exporter so no build is needed.
// Test-only storage door on its own origin (as executable-transition.test.mjs does), so the test can list the object's rows.
const entry=`import worker,{FiaPreparationJobs as Jobs} from ${JSON.stringify(resolve('server/faces/worker/entry.mjs'))};
export class FiaPreparationJobs extends Jobs{async fetch(request){if(new URL(request.url).origin==='https://dispatch.test')return Response.json(Object.fromEntries(await this.ctx.storage.list()));return super.fetch(request);}}
export default worker;`;
async function release(t){
 const dir=await mkdtemp(join(tmpdir(),'guide-dispatch-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const authority=JSON.parse(await readFile('server/fia/publication/trusted-generalized.json')),extension=buildGeneralizedSnapshot(publicRoot,authority),canonicalSources=exportGuideSources({outputRoot:dir,sourceRevision:authority.sourceCommit});
 const proof=await buildApprovedAudioProofIndex({publicRoot,authority:{registrySha256:authority.catalog.sha256,sourceRevision:authority.sourceCommit}});
 const snapshot={schema:'fia.worker-read-snapshot.v1',records:extension.records,current:extension.current,staticArtifacts:extension.staticArtifacts,artifacts:[],canonicalSources,generalizedAuthority:extension.authority,approvedAudioProofIndex:proof.descriptor};
 const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'dispatch-entry.mjs',loader:'js'},bundle:true,platform:'browser',format:'esm',external:['node:*'],write:false,plugins:[{name:'dispatch-snapshot',setup(b){b.onResolve({filter:/generated\/snapshot\.json$/},()=>({path:'snapshot',namespace:'dispatch'}));b.onLoad({filter:/.*/,namespace:'dispatch'},()=>({contents:JSON.stringify(snapshot),loader:'json'}));}}]});
 const counts={external:0};
 const mf=new Miniflare({...convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{FIA_API_ORIGIN:origin},durableObjects:{FIA_PREPARATION_JOBS:{className:'FiaPreparationJobs',useSQLite:true}},r2Buckets:['FIA_ORIGINALS'],
  serviceBindings:{ASSETS:async request=>{const path=new URL(request.url).pathname;let bytes;try{bytes=path===proof.descriptor.path?proof.bytes:await readFile((path.startsWith('/content/source-guides/')?dir:publicRoot)+path);}catch(error){if(error.code!=='ENOENT')throw error;return new Response('Not found',{status:404});}return new Response(bytes,{headers:{'Content-Type':'application/json','Content-Length':String(bytes.length)}});}},
  outboundService:()=>{counts.external++;throw Error('External work forbidden');}}),resourcePersistencePath:join(dir,'storage')});
 t.after(()=>mf.dispose());return {mf,counts};
}
test('the real FiaPreparationJobs passes only the trusted snapshot: the internal guide origin takes canonical selections only; public requests are untouched',async t=>{
 const {mf,counts}=await release(t),ns=await mf.getDurableObjectNamespace('FIA_PREPARATION_JOBS'),{name}=await guideFragmentIdentity({repo:SOURCE.repo,revision:SOURCE.revision,path:SOURCE.path}),stub=ns.get(ns.idFromName(name)),bucket=await mf.getR2Bucket('FIA_ORIGINALS');
 const call=(path,body,s=stub)=>s.fetch('https://guide-fragment.internal'+path,{method:'POST',body:JSON.stringify(body)}).then(async r=>({status:r.status,body:await r.json()}));
 const caller=await call('/demand',SOURCE);assert.equal(caller.status,400);assert.equal(caller.body.subReason,'guide-caller-authority','a caller URL, revision or sha is never authority');
 const luke=await call('/demand',{packId:'spa.LUK-1-1-4'});assert.equal(luke.body.subReason,'composer-unknown-pack','Luke is not in this build snapshot yet');
 assert.equal((await stub.fetch('https://guide-fragment.internal/demand')).status,404,'GET is not an operation');
 assert.equal((await (await bucket.list()).objects).length,0);assert.equal(counts.external,0);
 assert.deepEqual(Object.keys(await (await stub.fetch('https://dispatch.test/dump')).json()),[],'no Durable Object row is written by a refused demand (PR298 review N1)');
 const pub=await mf.dispatchFetch(origin+'/v1/packs/eng.MRK-1-14-20');assert.equal(pub.status,200,'the public read is unchanged');
 const guideViaPublic=await mf.dispatchFetch(origin+'/guide-fragment.internal/demand',{method:'POST',body:JSON.stringify(SOURCE)});assert.notEqual(guideViaPublic.status,200,'no public route reaches the producer');
});
