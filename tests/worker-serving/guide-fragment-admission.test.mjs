import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {buildGeneralizedSnapshot} from '../../server/fia/publication/generalized.mjs';
import {exportGuideSources,exportAssociationSources,ASSOCIATION_SOURCE_SCHEMA} from '../../server/fia/compiler/presentation/export-guide-sources.mjs';
import {buildApprovedAudioProofIndex} from '../../scripts/approved-audio-proof-index.mjs';
import {guideFragmentIdentity,GUIDE_REPOSITORY} from '../../server/fia/preparation/guide-fragment.mjs';
import {admissionEligibility,GUIDE_FRAGMENT_READ_SCHEMA,GUIDE_FRAGMENT_READ_KEYS} from '../../server/fia/preparation/guide-fragment-admission.mjs';
import {GUIDE_FRAGMENT_POLICY} from '../../server/fia/preparation/guide-fragment.mjs';
import {SOURCE_ASSOCIATION_RECIPE} from '../../server/fia/preparation/source-associations/index.mjs';
import {canonicalJSONString} from '../../server/fia/preparation/contract.mjs';
import {writeFile as writeFileAsync,mkdir} from 'node:fs/promises';
const require=createRequire(resolve(process.env.FIA_WORKER_DEPENDENCIES||'package.json')),{build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
const origin='https://dev.fiaguide.app',publicRoot='apps/web/public',sha=b=>createHash('sha256').update(b).digest('hex');
const LUKE='spa.LUK-1-1-4',PATH='spa/json/42.content.json';
// TEST-ONLY synthetic archive pin (no committed copy of the eb744452 publisher bytes exists, and nothing is fetched live): the retained
// spa.LUK-1-1-4 guide record with its provenance revision and sourceFileSha256 set to a synthetic file served by the test publisher.
const archive=JSON.parse(gunzipSync(await readFile('server/fia/compiler/presentation/source-packs-luk.json.gz')));
const U3=`<p>${archive.packs[LUKE].guide.steps.flatMap(s=>s.units).find(u=>u.id==='S05-U003').html}</p>`;
const fileOf=paragraphs=>Buffer.from(JSON.stringify([{content_id:'synthetic',media_type:'Text',language:'spa',associations:{passage:[{start_ref_usfm:'LUK 1:1',end_ref_usfm:'LUK 1:4'}]},content:paragraphs.join('')}]));
const SYN_FILE=fileOf(['<p>Synthetic opening.</p>',U3]),SYN_REV='5'.repeat(40);
function pinned({revision=SYN_REV,fileSha256=sha(SYN_FILE)}={}){const guide=structuredClone(archive.packs[LUKE].guide);guide.provenance.revision=revision;guide.sourceFileSha256=fileSha256;const bytes=Buffer.from(JSON.stringify(guide));
 return {guide,bytes,row:{packId:LUKE,sourceRevision:archive.revision,sha256:sha(bytes),bytes:bytes.length,staticPath:`/content/source-guides/${sha(bytes)}.json`}};}
// TEST-ONLY association row for the synthetic Luke pin, in the exporter's shape over the retained Luke archive pack.
function lukeAssociation(){const p=archive.packs[LUKE],inventory=archive.inventory.filter(f=>f.path.startsWith(`data/packs/${LUKE}/`)).map(f=>({path:f.path,bytes:f.bytes,sha256:f.sha256}));
 const bytes=Buffer.from(JSON.stringify({schema:ASSOCIATION_SOURCE_SCHEMA,packId:LUKE,sourceRevision:archive.revision,manifest:p.manifest,resources:p.resources,'guide-units':p['guide-units'],inventory}));
 return {bytes,row:{packId:LUKE,sourceRevision:archive.revision,sha256:sha(bytes),bytes:bytes.length,staticPath:`/content/source-guides/${sha(bytes)}.json`}};}
// Test-only storage door on its own origin, so a test can list the object's rows; never part of a release bundle.
const entry=`import worker,{FiaPreparationJobs as Jobs} from ${JSON.stringify(resolve('server/faces/worker/entry.mjs'))};
export class FiaPreparationJobs extends Jobs{async fetch(request){if(new URL(request.url).origin==='https://admission.test')return Response.json(Object.fromEntries(await this.ctx.storage.list()));return super.fetch(request);}}
export default worker;`;
// The real release Worker. Its build snapshot is composed from the exporter plus the one test-only Luke row; the test publisher answers
// only the composed class-A URL, as text/plain (as the class-A host does), and counts every outbound request.
async function release(t,{pin=pinned(),serve=()=>SYN_FILE,dir,association=true}={}){
 dir??=await mkdtemp(join(tmpdir(),'guide-admission-'));
 const authority=JSON.parse(await readFile('server/fia/publication/trusted-generalized.json')),extension=buildGeneralizedSnapshot(publicRoot,authority),canonicalSources=[...exportGuideSources({outputRoot:dir,sourceRevision:authority.sourceCommit}),pin.row];
 const proof=await buildApprovedAudioProofIndex({publicRoot,authority:{registrySha256:authority.catalog.sha256,sourceRevision:authority.sourceCommit}});
 let associationSources;if(association){const luke=lukeAssociation();await mkdir(join(dir,'content/source-guides'),{recursive:true});await writeFileAsync(join(dir,luke.row.staticPath),luke.bytes);associationSources=[...exportAssociationSources({outputRoot:dir,sourceRevision:authority.sourceCommit}),luke.row];}
 const snapshot={schema:'fia.worker-read-snapshot.v1',records:extension.records,current:extension.current,staticArtifacts:extension.staticArtifacts,artifacts:[],canonicalSources,...(association?{associationSources}:{}),generalizedAuthority:extension.authority,approvedAudioProofIndex:proof.descriptor};
 const bundled=await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'admission-entry.mjs',loader:'js'},bundle:true,platform:'browser',format:'esm',external:['node:*'],write:false,plugins:[{name:'admission-snapshot',setup(b){b.onResolve({filter:/generated\/snapshot\.json$/},()=>({path:'snapshot',namespace:'admission'}));b.onLoad({filter:/.*/,namespace:'admission'},()=>({contents:JSON.stringify(snapshot),loader:'json'}));}}]});
 const counts={publisher:0,other:0},composedUrl=`https://raw.githubusercontent.com/${GUIDE_REPOSITORY}/${pin.guide.provenance.revision}/${PATH}`;
 const mf=new Miniflare({...convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],bindings:{FIA_API_ORIGIN:origin},durableObjects:{FIA_PREPARATION_JOBS:{className:'FiaPreparationJobs',useSQLite:true}},r2Buckets:['FIA_ORIGINALS'],
  serviceBindings:{ASSETS:async request=>{const path=new URL(request.url).pathname;let bytes;try{bytes=path===proof.descriptor.path?proof.bytes:path===pin.row.staticPath?pin.bytes:await readFile((path.startsWith('/content/source-guides/')?dir:publicRoot)+path);}catch(error){if(error.code!=='ENOENT')throw error;return new Response('Not found',{status:404});}return new Response(bytes,{headers:{'Content-Type':'application/json','Content-Length':String(bytes.length)}});}},
  outboundService:request=>{if(request.url!==composedUrl){counts.other++;return new Response('forbidden',{status:403});}counts.publisher++;const b=serve();return new Response(b,{headers:{'content-type':'text/plain; charset=utf-8','content-length':String(b.length)}});}}),resourcePersistencePath:join(dir,'storage')});
 t.after(async()=>{await mf.dispose();});
 const ns=await mf.getDurableObjectNamespace('FIA_PREPARATION_JOBS'),{name}=await guideFragmentIdentity({repo:GUIDE_REPOSITORY,revision:pin.guide.provenance.revision,path:PATH}),stub=ns.get(ns.idFromName(name));
 const call=(path,body,s=stub)=>s.fetch('https://guide-fragment.internal'+path,{method:'POST',body:JSON.stringify(body)}).then(async r=>({status:r.status,body:await r.json()}));
 return {mf,ns,stub,call,counts,composedUrl,dir};
}
const scratch=async t=>{const d=await mkdtemp(join(tmpdir(),'guide-admission-'));t.after(()=>rm(d,{recursive:true,force:true}));return d;};

test('first acquisition: a canonical selection composes the pinned class-A URL, issues sequence 1, promotes only on the archive sha, and a repeat is warm',async t=>{
 const {call,counts,composedUrl,mf}=await release(t,{dir:await scratch(t)});
 const first=await call('/demand',{packId:LUKE});assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.state,'retained',JSON.stringify(first.body));
 assert.equal(first.body.file.sha256,sha(SYN_FILE));assert.equal(first.body.file.contentType,'text/plain');assert.deepEqual(first.body.descriptor,{owner:'BibleAquifer',collection:'FIATranslationGuide',revision:SYN_REV,path:PATH,fileSha256:sha(SYN_FILE)});
 assert.equal(counts.publisher,1);assert.equal(counts.other,0);assert.match(composedUrl,/^https:\/\/raw\.githubusercontent\.com\/BibleAquifer\/FIATranslationGuide\/5{40}\/spa\/json\/42\.content\.json$/);
 const warm=await call('/demand',{packId:LUKE});assert.equal(warm.body.state,'retained');assert.equal(counts.publisher,1,'a warm demand verifies the retained head with zero upstream calls');
 const read=await call('/read',{packId:LUKE});assert.equal(read.body.state,'retained');assert.equal(read.body.bytes,undefined,'metadata only');assert.equal(counts.publisher,1);
 const objects=(await (await mf.getR2Bucket('FIA_ORIGINALS')).list()).objects.map(o=>o.key);assert.ok(objects.includes(`originals/json/sha256/${sha(SYN_FILE)}.json`));
});
test('refused: caller URL, revision (96bb or latest), sha, fragment or descriptor; batches and polling; malformed packs',async t=>{
 const {call,counts,stub}=await release(t,{dir:await scratch(t)});
 for(const extra of [{url:'https://raw.githubusercontent.com/BibleAquifer/FIATranslationGuide/96bb023ab1852ab8bdc3a469fcc820e9f9ea1e30/spa/json/42.content.json'},{revision:'96bb023ab1852ab8bdc3a469fcc820e9f9ea1e30'},{revision:'latest'},{expectedSha256:sha(SYN_FILE)},{fragment:U3},{descriptor:{revision:SYN_REV}},{repo:GUIDE_REPOSITORY},{trusted:true}]){
  const r=await call('/demand',{packId:LUKE,...extra});assert.equal(r.status,400,JSON.stringify(extra));assert.equal(r.body.subReason,'guide-caller-authority',JSON.stringify(extra));}
 for(const body of [{packIds:[LUKE,'eng.LUK-1-1-4']},{packId:LUKE,poll:true},{packId:LUKE,schedule:'hourly'}]){const r=await call('/demand',body);assert.equal(r.body.subReason,'guide-batch-refused',JSON.stringify(body));}
 for(const body of [{},{packId:'../x'},{packId:LUKE,retry:'yes'},[LUKE]]){const r=await call('/demand',body);assert.equal(r.body.subReason,'guide-request-shape',JSON.stringify(body));}
 assert.equal((await call('/demand',{packId:'spa.LUK-99-1-2'})).body.subReason,'composer-unknown-pack');
 assert.equal(counts.publisher+counts.other,0,'no refusal reaches the publisher');
 assert.deepEqual(Object.keys(await (await stub.fetch('https://admission.test/rows')).json()),[],'no refusal writes a Durable Object row');
});
test('refresh-unavailable: a Retry once a head exists, and a head that differs from the current descriptor',async t=>{
 const dir=await scratch(t),{call,counts,mf}=await release(t,{dir});
 assert.equal((await call('/demand',{packId:LUKE})).body.state,'retained');
 const retry=await call('/demand',{packId:LUKE,retry:true});assert.equal(retry.status,409);assert.equal(retry.body.reason,'refresh-unavailable');assert.equal(retry.body.subReason,'guide-retry-after-head');assert.equal(counts.publisher,1);
 await mf.dispose();
 // A later build whose archive descriptor names other bytes at the same pinned revision and path: the identity and its head persist.
 const NEW=fileOf(['<p>Synthetic revised.</p>',U3]),later=await release(t,{dir,pin:pinned({fileSha256:sha(NEW)}),serve:()=>NEW});
 const differs=await later.call('/demand',{packId:LUKE});assert.equal(differs.status,409);assert.equal(differs.body.reason,'refresh-unavailable');assert.equal(differs.body.subReason,'guide-head-differs-from-descriptor');assert.equal(later.counts.publisher,0,'no re-observation');
});
test('a sha mismatch is never promoted and yields nothing; a deliberate Retry while no head exists is the same first acquisition',async t=>{
 let bytes=fileOf(['<p>Tampered.</p>',U3]);const {call,counts}=await release(t,{dir:await scratch(t),serve:()=>bytes});
 const bad=await call('/demand',{packId:LUKE});assert.equal(bad.body.reason,'guide-sha-mismatch',JSON.stringify(bad.body));assert.equal((await call('/read',{packId:LUKE})).body.state,'unavailable');
 const plain=await call('/demand',{packId:LUKE});assert.equal(counts.publisher,1,'no automatic refetch');assert.notEqual(plain.body.state,'retained');
 bytes=SYN_FILE;const retried=await call('/demand',{packId:LUKE,retry:true});assert.equal(retried.body.state,'retained',JSON.stringify(retried.body));assert.equal(counts.publisher,2);
});
test('the wrong object, and an object built without a trusted snapshot, are refused',async t=>{
 const {call,ns}=await release(t,{dir:await scratch(t)});
 const wrong=await call('/demand',{packId:LUKE},ns.get(ns.idFromName('guide-fragment@1:'+'0'.repeat(64))));assert.equal(wrong.status,403);assert.equal(wrong.body.reason,'guide-object-identity');
 const {serveGuideFragmentObject}=await import('../../server/fia/preparation/guide-fragment.mjs');
 const none=await serveGuideFragmentObject(new Request('https://guide-fragment.internal/demand',{method:'POST',body:JSON.stringify({packId:LUKE})}),{id:{toString:()=>'x'}},{},{snapshot:null});
 assert.equal(none.status,503);const nb=await none.json();assert.equal(nb.reason,'guide-admission-unavailable');assert.equal(nb.subReason,'guide-no-trusted-snapshot','snapshot:null is no trusted snapshot');
 const extra=await serveGuideFragmentObject(new Request('https://guide-fragment.internal/demand',{method:'POST',body:'{}'}),{id:{toString:()=>'x'}},{},{snapshot:{},visuals:{}});assert.equal((await extra.json()).subReason,'guide-capabilities-shape','only the snapshot is accepted, never another port');
 assert.equal(await serveGuideFragmentObject(new Request('https://dev.fiaguide.app/demand',{method:'POST',body:'{}'}),{},{}, {snapshot:null}),null,'other origins are not answered');
});
test('eligibility is strict: only the composed URL, the pinned publisher version, the current row, a source record and the archive sha',()=>{
 const {guide,row}=pinned(),descriptor={owner:'BibleAquifer',collection:'FIATranslationGuide',revision:SYN_REV,path:PATH,fileSha256:sha(SYN_FILE)},url=`https://raw.githubusercontent.com/${GUIDE_REPOSITORY}/${SYN_REV}/${PATH}`;
 const ok=admissionEligibility({url,descriptor,row,rowFor:()=>row,guide}),src={url,sourceVersionKind:'publisher-version',sourceVersion:SYN_REV,publisherVersion:SYN_REV};
 assert.equal(ok({source:src,observedContent:null}),true);assert.equal(ok({source:src,observedContent:{sha256:sha(SYN_FILE)}}),true);
 assert.equal(ok({source:src,observedContent:{sha256:'0'.repeat(64)}}),false,'observed sha must equal the archive sha');
 for(const bad of [{url:url.replace(SYN_REV,'96bb023ab1852ab8bdc3a469fcc820e9f9ea1e30')},{sourceVersion:'96bb023ab1852ab8bdc3a469fcc820e9f9ea1e30'},{sourceVersion:'latest'},{sourceVersionKind:'discovery-snapshot'},{publisherVersion:null}])assert.equal(ok({source:{...src,...bad},observedContent:null}),false,JSON.stringify(bad));
 assert.equal(admissionEligibility({url,descriptor,row,rowFor:()=>({...row}),guide})({source:src}),false,'the descriptor must still be the snapshot row in effect');
 assert.equal(admissionEligibility({url,descriptor,row,rowFor:()=>row,guide:{...guide,provenance:{...guide.provenance,status:'generated'}}})({source:src}),false,'only source provenance records');
 assert.equal(admissionEligibility({url,descriptor:{...descriptor,collection:'OtherGuide'},row,rowFor:()=>row,guide})({source:src}),false);
 assert.equal(ok(undefined),false);
});
// /fragment: read-only over the retained head. It never demands, writes or fetches.
const listState=async (stub,mf)=>({rows:await (await stub.fetch('https://admission.test/rows')).json(),objects:(await (await mf.getR2Bucket('FIA_ORIGINALS')).list()).objects.map(o=>[o.key,o.size])});
test('fragment read: cold is a typed guide-not-retained with zero upstream calls and no row or object',async t=>{
 const {call,counts,stub,mf}=await release(t,{dir:await scratch(t)});
 const cold=await call('/fragment',{packId:LUKE});assert.equal(cold.status,200,JSON.stringify(cold.body));assert.equal(cold.body.state,'unavailable');assert.equal(cold.body.reason,'guide-not-retained');
 assert.equal(cold.body.custody,'none');assert.equal(cold.body.receipt,null);assert.equal(cold.body.paragraphs,null);assert.equal(cold.body.associations,null);assert.deepEqual(Object.keys(cold.body).sort(),[...GUIDE_FRAGMENT_READ_KEYS.answer].sort());
 assert.equal(counts.publisher+counts.other,0,'a cold fragment read never reaches the publisher');
 assert.deepEqual(await listState(stub,mf),{rows:{},objects:[]},'a cold fragment read writes nothing');
});
test('fragment read: after the synthetic-pin acquisition it returns the receipt metadata and paragraph hashes, leaving storage unchanged',async t=>{
 const {call,counts,stub,mf}=await release(t,{dir:await scratch(t)});
 assert.equal((await call('/demand',{packId:LUKE})).body.state,'retained');assert.equal(counts.publisher,1);
 const before=await listState(stub,mf),warm=await call('/fragment',{packId:LUKE}),after=await listState(stub,mf);
 assert.equal(warm.status,200,JSON.stringify(warm.body));assert.equal(warm.body.state,'composed');assert.equal(warm.body.custody,'retained');
 assert.deepEqual(warm.body.receipt,{schema:'fia-guide-producer-receipt@1',owner:'BibleAquifer',collection:'FIATranslationGuide',revision:SYN_REV,path:PATH,fileSha256:sha(SYN_FILE),bytes:SYN_FILE.length,contentType:'text/plain',observationSha256:warm.body.receipt.observationSha256});
 assert.match(warm.body.receipt.observationSha256,/^[a-f0-9]{64}$/);
 const html=JSON.parse(SYN_FILE)[0].content.split(/(?<=<\/p>)/);
 assert.deepEqual(warm.body.paragraphs,html.map((h,n)=>({jsonPath:`$[0].content#p${n}`,htmlSha256:sha(h)})),'paragraphs are {jsonPath, htmlSha256} only, no html');
 assert.ok(warm.body.paragraphs.every(x=>Object.keys(x).join()===GUIDE_FRAGMENT_READ_KEYS.paragraph.join()));
 assert.deepEqual(Object.keys(warm.body).sort(),[...GUIDE_FRAGMENT_READ_KEYS.answer].sort(),'closed answer schema');
 assert.equal(warm.body.schema,GUIDE_FRAGMENT_READ_SCHEMA);assert.equal(warm.body.policyRevision,GUIDE_FRAGMENT_POLICY.revision);assert.equal(warm.body.recipe,SOURCE_ASSOCIATION_RECIPE);
 const id=await guideFragmentIdentity({repo:GUIDE_REPOSITORY,revision:SYN_REV,path:PATH});assert.deepEqual(warm.body.identity,{logicalId:id.logicalId,url:id.url,publisherVersion:SYN_REV});
 const a=warm.body.associations;assert.equal(a.state,'composed',JSON.stringify(a));assert.match(a.indexSha256,/^[a-f0-9]{64}$/);
 const explicit=a.decisions.filter(d=>d.type==='explicit');assert.equal(explicit.length,1,JSON.stringify(a.decisions));const [d]=explicit;
 assert.deepEqual([d.unitId,d.namespace,d.resourceId],['S05-U003','FIAKeyTerms','spa-t55-v1']);
 assert.equal(d.evidence.provenance,'raw-publisher-html');assert.equal(d.evidence.rawJsonPath,'$[0].content#p1');assert.equal(d.evidence.rawFragmentSha256,sha(U3));assert.equal(d.evidence.rawFileSha256,sha(SYN_FILE));assert.equal(d.evidence.rawRevision,SYN_REV);
 assert.equal(d.binding.recipe,SOURCE_ASSOCIATION_RECIPE);assert.equal(d.binding.rawFileSha256,sha(SYN_FILE));assert.equal(d.binding.rawFragmentSha256,sha(U3));assert.equal(d.binding.guideSourceFileSha256,sha(SYN_FILE));assert.equal(d.binding.guideRevision,SYN_REV);
 for(const k of ['unitTextSha256','unitHtmlSha256','guideContentSha256','referenceSha256'])assert.match(d.binding[k],/^[a-f0-9]{64}$/,k);
 assert.deepEqual([d.unitId,d.namespace,d.contentId,d.jsonPath,d.htmlSha256],['S05-U003','FIAKeyTerms','spa-t55-v1','$[0].content#p1',sha(U3)],'the consumer fields are explicit on the decision');
 assert.equal(d.bindingSha256,sha(canonicalJSONString(d.binding)),'bindingSha256 is the hash of the canonical binding');
 for(const x of a.decisions){for(const k of ['unitId','namespace','contentId','jsonPath','htmlSha256','bindingSha256'])assert.ok(k in x,k);assert.equal(x.bindingSha256,sha(canonicalJSONString(x.binding)));}
 assert.equal(counts.publisher,1,'zero upstream calls for the fragment read');assert.equal(counts.other,0);
 assert.deepEqual(after,before,'Durable Object rows and R2 objects are unchanged by /fragment');
 assert.deepEqual((await call('/fragment',{packId:LUKE})).body,warm.body,'a repeat answers the same bytes');
});
test('fragment read: the same caller-authority, batch and shape refusals as /demand, plus no Retry; none reaches the publisher or writes',async t=>{
 const {call,counts,stub,mf}=await release(t,{dir:await scratch(t)});
 for(const extra of [{url:'https://raw.githubusercontent.com/BibleAquifer/FIATranslationGuide/96bb023ab1852ab8bdc3a469fcc820e9f9ea1e30/spa/json/42.content.json'},{revision:'96bb023ab1852ab8bdc3a469fcc820e9f9ea1e30'},{expectedSha256:sha(SYN_FILE)},{fragment:U3},{descriptor:{revision:SYN_REV}},{repo:GUIDE_REPOSITORY}]){
  const r=await call('/fragment',{packId:LUKE,...extra});assert.equal(r.status,400,JSON.stringify(extra));assert.equal(r.body.subReason,'guide-caller-authority',JSON.stringify(extra));}
 for(const body of [{packIds:[LUKE,'eng.LUK-1-1-4']},{packId:LUKE,batch:true},{packId:LUKE,poll:true}]){const r=await call('/fragment',body);assert.equal(r.body.subReason,'guide-batch-refused',JSON.stringify(body));}
 for(const body of [{},{packId:'../x'},{packId:LUKE,retry:true},[LUKE]]){const r=await call('/fragment',body);assert.equal(r.status,400,JSON.stringify(body));assert.equal(r.body.subReason,'guide-request-shape',JSON.stringify(body));}
 assert.equal(counts.publisher+counts.other,0);assert.deepEqual(await listState(stub,mf),{rows:{},objects:[]});
});
test('fragment read: a retained head whose sha differs from the current descriptor is a typed descriptor-mismatch, never exposed or re-observed',async t=>{
 const dir=await scratch(t),{call,mf}=await release(t,{dir});
 assert.equal((await call('/demand',{packId:LUKE})).body.state,'retained');await mf.dispose();
 const NEW=fileOf(['<p>Synthetic revised.</p>',U3]),later=await release(t,{dir,pin:pinned({fileSha256:sha(NEW)}),serve:()=>NEW});
 const before=await listState(later.stub,later.mf),r=await later.call('/fragment',{packId:LUKE});
 assert.equal(r.status,409,JSON.stringify(r.body));assert.equal(r.body.reason,'descriptor-mismatch');assert.equal(r.body.receipt,null);assert.equal(r.body.paragraphs,null);assert.equal(r.body.associations,null);
 assert.equal(later.counts.publisher+later.counts.other,0,'no re-observation');assert.deepEqual(await listState(later.stub,later.mf),before);
});
test('fragment read: without an association row the receipt is still answered and the decisions are a typed unavailable, never a guide-only index',async t=>{
 const {call,counts}=await release(t,{dir:await scratch(t),association:false});
 assert.equal((await call('/demand',{packId:LUKE})).body.state,'retained');
 const r=await call('/fragment',{packId:LUKE});assert.equal(r.body.state,'composed');assert.equal(r.body.receipt.fileSha256,sha(SYN_FILE));
 assert.deepEqual(r.body.associations,{state:'unavailable',reason:'association-inputs-unavailable',subReason:'association-source-row',indexSha256:null,decisions:null});assert.equal(counts.publisher,1);
});
test('association export: every Mark pack row is pinned by source-bindings and fails closed before any write',async t=>{
 const authority=JSON.parse(await readFile('server/fia/publication/trusted-generalized.json')),dir=await scratch(t);
 const rows=exportAssociationSources({outputRoot:dir,sourceRevision:authority.sourceCommit});assert.equal(rows.length,136);
 for(const row of rows){const bytes=await readFile(join(dir,row.staticPath));assert.equal(sha(bytes),row.sha256);assert.equal(bytes.length,row.bytes);const p=JSON.parse(bytes);assert.equal(p.schema,ASSOCIATION_SOURCE_SCHEMA);assert.equal(p.packId,row.packId);assert.ok(p.inventory.some(f=>f.path===`data/packs/${row.packId}/guide.json`));}
 const bindings=JSON.parse(await readFile('server/fia/compiler/presentation/source-bindings.json')),empty=await scratch(t);
 for(const k of ['manifest','resources','guide-units'])assert.throws(()=>exportAssociationSources({outputRoot:empty,sourceRevision:authority.sourceCommit,sourceBindings:{...bindings,'eng.MRK-4-35-41':{...bindings['eng.MRK-4-35-41'],[k]:'0'.repeat(64)}}}),/association-source-pin/,k);
 assert.throws(()=>exportAssociationSources({outputRoot:empty,sourceRevision:'0'.repeat(40)}),/canonical-source-revision/);
 assert.throws(()=>exportAssociationSources({outputRoot:empty,sourceRevision:authority.sourceCommit,archiveBytes:Buffer.from('x')}),/canonical-source-archive-pin/);
 const {readdir}=await import('node:fs/promises');assert.deepEqual(await readdir(empty),[],'nothing is written when a check fails');
});
