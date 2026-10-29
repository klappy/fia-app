import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {readFileSync} from 'node:fs';
import {buildSourceIndex,associatePack,associateAll,verifyDecision,coverageReport,inlineReferences,requestedKinds,SOURCE_ASSOCIATION_RECIPE,RAW_DEPENDENCY} from '../../server/fia/preparation/source-associations/index.mjs';
import {readRetainedArchives} from '../../server/fia/preparation/source-associations/retained.mjs';
import {issueProducerReceipt,isProducerReceipt} from '../../server/fia/preparation/source-associations/producer-receipt.mjs';
import {fakeProducerReceipt} from './support/fake-guide-producer.mjs';
import {readdirSync} from 'node:fs';
const archives=readRetainedArchives(),index=buildSourceIndex(archives),sha=x=>createHash('sha256').update(x).digest('hex');
const of=(ix,packId,unitId)=>associatePack(ix,packId).filter(d=>d.unitId===unitId);
// A one-pack archive cloned from the retained bytes, mutated per case.
function packOf(packId){return structuredClone(archives.find(x=>x.packs[packId]).packs[packId]);}
function mini(packId,mutate,raw=null){ // raw: an array of producer receipts, or a forged value under test
 const a=archives.find(x=>x.packs[packId]),pack=packOf(packId);mutate?.(pack);return buildSourceIndex([{revision:a.revision,inventory:a.inventory.filter(f=>f.path.startsWith(`data/packs/${packId}/`)),packs:{[packId]:pack}}],{raw});}
const unitOf=(pack,id)=>pack.guide.steps.flatMap(s=>s.units).find(u=>u.id===id);
// Re-hash consistently in guide.json and guide-units.json, as an honest upstream edit would.
const setUnit=(p,id,text,html=text)=>{const u=unitOf(p,id);u.text=text;u.html=html;u.textSha256=sha(text);for(const st of p['guide-units'].steps)for(const x of st.units)if(x.id===id)x.textSha256=u.textSha256;};
const LUKE='spa.LUK-1-1-4',GALILEA='<data class="resource-ref" data-content-id="spa-t55-v1" data-resource-code="FIAKeyTerms">Galilea</data>';
// Synthetic whole publisher-shaped files (test data only): one Text article per pack id whose content is the given paragraphs.
// The S05-U003 paragraph is the retained compiled unit HTML wrapped in <p>; no publisher bytes are used.
const SYN_REV='5'.repeat(40),PATH='spa/json/42.content.json',U3=`<p>${packOf(LUKE).guide.steps.flatMap(s=>s.units).find(u=>u.id==='S05-U003').html}</p>`,OPEN='<p>Synthetic opening paragraph.</p>',CLOSE='<p>Synthetic closing paragraph.</p>';
function usfm(packId){const book=packId.slice(4,7),n=packId.slice(8).split('-');return n.length===3?[`${book} ${n[0]}:${n[1]}`,`${book} ${n[0]}:${n[2]}`]:[`${book} ${n[0]}:${n[1]}`,`${book} ${n[2]}:${n[3]}`];}
function fileOf(packId,htmls){const [s0,e0]=usfm(packId);return new Uint8Array(Buffer.from(JSON.stringify([{content_id:'synthetic',media_type:'Text',language:packId.slice(0,3),associations:{passage:[{start_ref_usfm:s0,end_ref_usfm:e0}]},content:htmls.join('')}])));}
// The archive descriptor of the pack is pinned to the synthetic file (test-only fixture pin); the receipt comes from the fake producer.
function withReceipt(packId,htmls,{mutate,pin=true,receipt={},filePack=packId}={}){const bytes=fileOf(filePack,htmls),r=fakeProducerReceipt({bytes,revision:SYN_REV,path:PATH,...receipt});return {receipt:r,bytes,ix:mini(packId,p=>{if(pin){p.guide.provenance.revision=SYN_REV;p.guide.sourceFileSha256=sha(bytes);}mutate?.(p);},[r])};}
const reasonAt=(ix,packId=LUKE,unitId='S05-U003')=>of(ix,packId,unitId)[0].reason;

test('index is version-bound and deterministic, and keeps unit HTML and reference evidence',()=>{
 assert.equal(index.sourceRevision,'f8776d92b090b5af5b17b17dc1137f25fb059ed0');assert.equal(index.recipe,SOURCE_ASSOCIATION_RECIPE);
 assert.equal(buildSourceIndex(readRetainedArchives()).indexSha256,index.indexSha256);assert.equal(Object.keys(index.packs).length,136+194);
 assert.ok(Object.values(index.packs).every(p=>p.raw===null),'no retained raw publisher HTML exists in the repo');
 const p=index.packs['eng.MRK-1-14-20'];assert.equal(p.guide.sourceFileSha256,'7d22f64be2a993c583eef1cb47168be4be2ea8e1de92d4a02d2d93bf7c475a4c');
 const u=p.units.find(x=>x.unitId==='S02-U008');assert.equal(u.textSha256,'33235d01384b23c5a5a29b2139ddc35898ad7c532298d6804113aa6030f670da');assert.equal(u.htmlSha256,sha(u.html));
 const c4=p.resources.find(a=>a.id==='c4');assert.deepEqual([c4.namespace,c4.kind,c4.sourceFile,c4.sourceFileSha256,c4.revision],['FIAMaps','map','eng/json/007.content.json','c2e796ad27262766e822dedbf1d212bfb9966af8b6c68353635595cf3d5fc3b1','4bc9bb9f1d9082e5d71a047a35bf8e608f473602']);
 const t55=index.packs[LUKE].resources.find(r=>r.id==='spa-t55-v1');assert.deepEqual([t55.namespace,t55.language,t55.termId],['FIAKeyTerms','spa','term-spa-t55']);
 assert.deepEqual(associateAll(index),associateAll(buildSourceIndex(readRetainedArchives())));
});
test('1. Luke 1:1-4 Galilea spa-t55-v1 at S05-U003: a typed gap in production; explicit only through a branded producer receipt that equals the archive descriptor; nothing at S02',()=>{
 const [gap,...rest]=of(index,LUKE,'S05-U003');assert.equal(rest.length,0);
 assert.equal(gap.type,'unresolved');assert.equal(gap.reason,'raw-provenance-unavailable');assert.equal(gap.dependency,RAW_DEPENDENCY);assert.match(RAW_DEPENDENCY,/class-A guide-text source route and admission/);assert.doesNotMatch(RAW_DEPENDENCY,/[a-f0-9]{7,}/,'names the route dependency, not a revision');
 assert.deepEqual([gap.namespace,gap.resourceId,gap.evidence.label,gap.evidence.provenance],['FIAKeyTerms','spa-t55-v1','Galilea','retained-compiled-guide-html']);
 assert.ok(!associatePack(index,LUKE).some(d=>d.stepId==='S02'&&d.resourceId==='spa-t55-v1'));
 const {ix,receipt,bytes}=withReceipt(LUKE,[OPEN,U3,CLOSE]);assert.ok(isProducerReceipt(receipt));
 const [d]=of(ix,LUKE,'S05-U003');assert.equal(d.type,'explicit',JSON.stringify(d));assert.deepEqual([d.namespace,d.resourceId],['FIAKeyTerms','spa-t55-v1']);
 assert.equal(d.evidence.provenance,'raw-publisher-html');assert.equal(d.evidence.rawFileSha256,sha(bytes));assert.equal(d.evidence.rawRevision,SYN_REV);assert.equal(d.evidence.rawJsonPath,'$[0].content#p1');assert.equal(d.evidence.rawFragmentSha256,sha(U3));
 assert.equal(verifyDecision(d,ix).type,'verified');assert.ok(!associatePack(ix,LUKE).some(x=>x.stepId==='S02'&&x.type==='explicit'));
 for(const k of ['autoplay','pause','order','medium','primary'])assert.equal(k in d,false,'association only');
});
test('no explicit result is reachable in production, and no production module issues receipts or imports the test composer',()=>{
 assert.equal(associateAll(index).filter(x=>x.type==='explicit').length,0);
 const root=new URL('../../server/',import.meta.url),files=readdirSync(root,{recursive:true}).filter(f=>/\.(mjs|js)$/.test(f));
 for(const f of files){const src=readFileSync(new URL(f,root),'utf8');assert.doesNotMatch(src,/fake-guide-producer/,f);if(!f.endsWith('source-associations/producer-receipt.mjs'))assert.doesNotMatch(src,/issueProducerReceipt/,`${f} must not issue producer receipts until the reviewed composer exists`);}
});
test('caller-supplied raw evidence is refused with a type, never explicit',()=>{
 const {receipt,bytes}=withReceipt(LUKE,[OPEN,U3,CLOSE]),pinned=p=>{p.guide.provenance.revision=SYN_REV;p.guide.sourceFileSha256=sha(bytes);};
 const forged=[
  ['plain object (the old fragment form)',{packs:{[LUKE]:{repo:'BibleAquifer/FIATranslationGuide',revision:SYN_REV,path:PATH,fileSha256:sha(bytes),fragments:[{jsonPath:'$[0].content#p1',html:U3,sha256:sha(U3)}]}}}],
  ['plain receipt-shaped object',[{...receipt}]],['JSON round-trip of a receipt',[JSON.parse(JSON.stringify(receipt))]],['structured clone of a receipt',[structuredClone(receipt)]],
  ['receipt plus a forged entry',[receipt,{...receipt,path:'spa/json/41.content.json'}]],['whole-file bytes object',{files:[{repo:'BibleAquifer/FIATranslationGuide',revision:SYN_REV,path:PATH,bytes}]}],['trusted flag',[{...receipt,trusted:true}]],
 ];
 for(const [why,raw] of forged){const ix=mini(LUKE,pinned,raw);assert.equal(reasonAt(ix),'raw-provenance-invalid',why);assert.ok(!associateAll(ix).some(d=>d.type==='explicit'),why);}
 assert.equal(reasonAt(buildSourceIndex(archives,{raw:{packs:{}}}),'eng.MRK-4-35-41','S03-U017'),'raw-provenance-invalid','a refused raw input fails every pack closed');
});
test('the issuer verifies the read and the whole bytes itself: fake owner, unverified file sha, wrong class or media are not issued',()=>{
 const bytes=fileOf(LUKE,[OPEN,U3,CLOSE]),base={bytes,revision:SYN_REV,path:PATH};
 assert.throws(()=>fakeProducerReceipt({...base,owner:'evil'}),/producer-receipt-class/,'fake owner');
 assert.throws(()=>fakeProducerReceipt({...base,observedSha256:'e'.repeat(64)}),/producer-receipt-bytes/,'unverified file sha');
 const tampered=new Uint8Array(bytes);tampered[tampered.length-12]^=1;assert.throws(()=>issueProducerReceipt({state:'observed',observation:{binding:{source:{url:`https://raw.githubusercontent.com/BibleAquifer/FIATranslationGuide/${SYN_REV}/${PATH}`,sourceVersionKind:'publisher-version',sourceVersion:SYN_REV,publisherVersion:SYN_REV}},sha256:sha(bytes),bytes:bytes.length,contentType:'application/json'}},tampered),/producer-receipt-bytes/,'bytes that differ from the observed sha');
 assert.throws(()=>fakeProducerReceipt({...base,path:'spa/json/42.content.json?x'}),/producer-receipt-class/);assert.throws(()=>fakeProducerReceipt({...base,revision:'96bb'}),/producer-receipt-version/);
 assert.throws(()=>fakeProducerReceipt({...base,sourceVersionKind:'discovery-snapshot'}),/producer-receipt-version/);assert.throws(()=>fakeProducerReceipt({...base,contentType:'text/plain'}),/producer-receipt-media/);
 assert.throws(()=>issueProducerReceipt({state:'unobserved'},bytes),/producer-receipt-unobserved/);
});
test('a receipt that differs from the archive descriptor is raw-provenance-invalid: exactly 96bb versus eb744452, and owner, collection, path, sha',()=>{
 const archived=index.packs[LUKE].guide;assert.equal(archived.revision,'eb744452eb8d7c852caadde9d3181cddfe571119');assert.equal(archived.sourceFile,PATH);
 const bytes=fileOf(LUKE,[OPEN,U3,CLOSE]),r96=fakeProducerReceipt({bytes,revision:'96bb023ab1852ab8bdc3a469fcc820e9f9ea1e30',path:PATH});
 const shaOnly=mini(LUKE,p=>{p.guide.sourceFileSha256=sha(bytes);},[r96]);assert.equal(shaOnly.packs[LUKE].guide.revision,'eb744452eb8d7c852caadde9d3181cddfe571119');
 assert.equal(reasonAt(shaOnly),'raw-provenance-invalid','96bb receipt against the eb744452 archive descriptor');assert.equal(shaOnly.packs[LUKE].raw.invalid,'raw-descriptor-mismatch');
 assert.equal(reasonAt(buildSourceIndex(archives,{raw:[r96]})),'raw-provenance-invalid','and against the unmodified retained archive');
 assert.equal(reasonAt(withReceipt(LUKE,[OPEN,U3,CLOSE],{receipt:{collection:'OtherGuide'}}).ix),'raw-provenance-invalid','collection');
 assert.equal(reasonAt(withReceipt(LUKE,[OPEN,U3,CLOSE],{mutate:p=>{p.guide.sourceFileSha256='f'.repeat(64);}}).ix),'raw-provenance-invalid','file sha');
 const wrongPath=withReceipt(LUKE,[OPEN,U3,CLOSE],{receipt:{path:'spa/json/41.content.json'}});assert.equal(reasonAt(wrongPath.ix),'raw-provenance-unavailable','a receipt for another file never serves this pack');
 const markPack=Object.keys(index.packs).find(id=>id.startsWith('spa.MRK-')&&associatePack(index,id).some(d=>d.reason==='raw-provenance-unavailable')),markUnit=associatePack(index,markPack).find(d=>d.reason==='raw-provenance-unavailable').unitId;
 assert.equal(of(buildSourceIndex(archives,{raw:[wrongPath.receipt]}),markPack,markUnit)[0].reason,'raw-provenance-invalid','correct sha, wrong path: the Mark descriptor does not match');
 const two=fakeProducerReceipt({bytes,revision:SYN_REV,path:PATH});assert.equal(reasonAt(mini(LUKE,p=>{p.guide.provenance.revision=SYN_REV;p.guide.sourceFileSha256=sha(bytes);},[two,fakeProducerReceipt({bytes,revision:SYN_REV,path:PATH})])),'raw-provenance-invalid','two receipts for one path');
});
test('the 96bb dev-time public-read fixture is refused against the archive descriptor; a join over it is an isolated test result only',()=>{
 const FIX=JSON.parse(readFileSync(new URL('./fixtures/source-associations/spa-luk-1-1-4-s05-u003.raw-fragment.json',import.meta.url)));
 assert.match(FIX.label,/Dev-time public read/);assert.equal(sha(FIX.fragment),FIX.provenance.fragmentSha256);assert.equal(FIX.provenance.revision,'96bb023ab1852ab8bdc3a469fcc820e9f9ea1e30');
 const bytes=fileOf(LUKE,[OPEN,FIX.fragment,CLOSE]),r=fakeProducerReceipt({bytes,revision:FIX.provenance.revision,path:FIX.provenance.path});
 const runtime=buildSourceIndex(archives,{raw:[r]});assert.equal(reasonAt(runtime),'raw-provenance-invalid');assert.equal(runtime.packs[LUKE].raw.invalid,'raw-descriptor-mismatch');
 assert.deepEqual([index.packs[LUKE].guide.revision,index.packs[LUKE].guide.sourceFileSha256.slice(0,8)],['eb744452eb8d7c852caadde9d3181cddfe571119','b6de7d69']);
 assert.ok(!associateAll(runtime).some(d=>d.type==='explicit'));
 // Isolated test only: with the archive descriptor pinned to this synthetic whole file, the fixture paragraph joins.
 const isolated=mini(LUKE,p=>{p.guide.provenance.revision=FIX.provenance.revision;p.guide.sourceFileSha256=sha(bytes);},[r]);const [d]=of(isolated,LUKE,'S05-U003');
 assert.equal(d.type,'explicit');assert.equal(d.evidence.rawFragmentSha256,FIX.provenance.fragmentSha256);
});
test('2. joins match exactly on namespace, language, source and unit',()=>{
 assert.equal(reasonAt(withReceipt(LUKE,[OPEN,U3.replace('data-resource-code="FIAKeyTerms"','data-resource-code="FIAImages"'),CLOSE]).ix),'compiled-only-annotation','raw tag in another namespace');
 assert.equal(reasonAt(withReceipt(LUKE,[OPEN,U3.replace('spa-t55-v1','spa-t55-v2'),CLOSE]).ix),'compiled-only-annotation','raw tag for another source id');
 const other=packOf(LUKE).guide.steps.flatMap(s=>s.units).find(u=>u.id==='S05-U004').html;
 assert.equal(reasonAt(withReceipt(LUKE,[`<p>${other} ${GALILEA}</p>`]).ix),'unanchored','raw tag anchored to another unit');
 assert.equal(reasonAt(mini(LUKE,p=>{const u=unitOf(p,'S05-U003');setUnit(p,'S05-U003',u.text,u.html.replace('spa-t55-v1','eng-t55-v1'));})),'language-mismatch');
 assert.equal(reasonAt(withReceipt(LUKE,[U3],{filePack:'spa.LUK-1-5-25'}).ix),'raw-provenance-unavailable','raw evidence for another pack never applies');
 assert.equal(reasonAt(withReceipt(LUKE,[OPEN,U3.replace(GALILEA,'Galilea'),CLOSE]).ix),'compiled-only-annotation','a label or text match without the raw tag is not a join');
});
test('3. a stale HTML or reference change with unchanged text is invalidated',()=>{
 const {ix}=withReceipt(LUKE,[U3]),[d]=of(ix,LUKE,'S05-U003'),[gap]=of(index,LUKE,'S05-U003');
 for(const change of [h=>h.replace('>Galilea<','>Galilee<'),h=>h.replace('spa-t55-v1','spa-t56-v1'),h=>h.replace(GALILEA,'Galilea')]){
  const moved=withReceipt(LUKE,[U3],{mutate:p=>{unitOf(p,'S05-U003').html=change(unitOf(p,'S05-U003').html);}}).ix;
  assert.equal(verifyDecision(d,moved).reason,'reference-drift');assert.equal(verifyDecision(gap,moved).reason,'reference-drift');
 }
 const bytes=fileOf(LUKE,[U3]),other='6'.repeat(40);assert.equal(verifyDecision(d,mini(LUKE,p=>{p.guide.provenance.revision=other;p.guide.sourceFileSha256=sha(bytes);},[fakeProducerReceipt({bytes,revision:other,path:PATH})])).reason,'revision-drift');
 const [a293]=of(index,'eng.MRK-4-35-41','S03-U017');
 assert.equal(verifyDecision(a293,mini('eng.MRK-4-35-41',p=>{p.resources.images.find(a=>a.id==='a293').sourceFileSha256='f'.repeat(64);})).reason,'revision-drift');
 const drift=mini('eng.MRK-4-35-41',p=>{p.resources.images.find(a=>a.id==='a293').titleProvenance.revision='0'.repeat(40);});assert.equal(of(drift,'eng.MRK-4-35-41','S03-U017')[0].reason,'revision-drift');
 assert.equal(verifyDecision(a293,mini('eng.MRK-4-35-41',p=>{const u=unitOf(p,'S03-U017');setUnit(p,'S03-U017',u.text+' Changed.',u.html+' Changed.');})).reason,'text-drift');
});
test('4. an ambiguous anchor abstains',()=>{
 assert.equal(reasonAt(withReceipt(LUKE,[U3,U3]).ix),'ambiguous-anchor','two raw paragraphs anchor to the unit');
 const twin=withReceipt(LUKE,[U3],{mutate:p=>{const u=unitOf(p,'S05-U003');setUnit(p,'S05-U004',u.text,u.text);}}).ix;
 assert.equal(reasonAt(twin),'ambiguous-anchor','two units share the anchor text');
 const split=U3.replace(GALILEA,GALILEA.replace('>Galilea<','>Gali<')+GALILEA.replace('>Galilea<','>lea<'));assert.equal(reasonAt(withReceipt(LUKE,[split]).ix),'ambiguous-anchor','the tag repeats inside the anchor');
 assert.ok(!associateAll(twin).some(d=>d.type==='explicit'));
});
test('5. denarius a325 and a345 article-only links stay semantic-needed with no choice',()=>{
 const ds=of(index,'eng.MRK-12-13-17','S02-U010');assert.equal(ds.length,1);const [d]=ds;
 assert.equal(d.type,'semantic-needed');assert.equal(d.kind,'image');const ids=d.candidates.map(c=>c.resourceId);assert.ok(ids.includes('a325')&&ids.includes('a345'));assert.equal(d.resourceId,undefined);
 assert.equal(d.binding.unitTextSha256,'681cb5418737c594d252ca2563ce9b8b1cb42cf7803e56f177579a3861144ebc');
 const u8=of(index,'eng.MRK-1-14-20','S02-U008');assert.deepEqual(u8.map(x=>[x.type,x.kind]),[['semantic-needed','image'],['semantic-needed','map']],'Mark 1:14-20 is what its text supports; the ledger is not imported');assert.deepEqual(u8[1].candidates.map(c=>c.resourceId),['c4']);
});
test('6. Mark 4:35-41 a293 is a compiled-guide annotation, not source-explicit',()=>{
 const [d,request,...rest]=of(index,'eng.MRK-4-35-41','S03-U017');assert.equal(rest.length,0);
 assert.equal(request.type,'semantic-needed','the unit asks for the photo, and a compiled-only reference does not satisfy it');assert.equal(request.kind,'image');assert.ok(request.candidates.some(c=>c.resourceId==='a293'));
 assert.equal(d.type,'unresolved');assert.equal(d.reason,'raw-provenance-unavailable');assert.deepEqual([d.namespace,d.resourceId],['FIAImages','a293']);
 assert.deepEqual(d.evidence,{kind:'inline-resource-ref',pointer:'eng.MRK-4-35-41/guide.json#S03/S03-U017',namespace:'FIAImages',contentId:'a293',label:'boat',referenceSha256:d.binding.referenceSha256,provenance:'retained-compiled-guide-html'});
 assert.equal(d.binding.resourceRevision,'136ff7c6b2381b84d241e27524005dcad71424ba');
 assert.equal(associateAll(index).filter(x=>x.type==='explicit').length,0,'nothing in the retained repo is source-explicit');
});
test('title-only similarity, figurative wording and term ids yield no decision',()=>{
 assert.deepEqual(of(index,'eng.MRK-4-35-41','S03-U015'),[]);
 assert.deepEqual(of(mini('eng.MRK-1-14-20',p=>{setUnit(p,'S02-U008','The Sea of Galilee was calm that night near Capernaum.');}),'eng.MRK-1-14-20','S02-U008'),[]);
 assert.deepEqual(requestedKinds('eng','Jesus is giving us a picture of a family home.'),[]);assert.deepEqual(requestedKinds('eng','You may create a word picture. Show them.'),[]);
 assert.deepEqual(requestedKinds('spa','Deténganse aquí y en grupo miren un mapa del área de Galilea y una imagen del Mar de Galilea.'),['image','map']);
});
test('typed references fail closed: missing resource, collection mismatch, ambiguous id, text drift, no candidates',()=>{
 const html=(code,id)=>`Show the <data class="resource-ref" data-content-id="${id}" data-resource-code="${code}">thing</data>.`;
 const run=(code,id,mut)=>of(mini('eng.MRK-1-14-20',p=>{setUnit(p,'S02-U008','Show the thing.',html(code,id));mut?.(p);}),'eng.MRK-1-14-20','S02-U008');
 assert.equal(run('FIAImages','a9999')[0].reason,'missing-resource');
 assert.equal(run('FIAImages','c4')[0].reason,'collection-mismatch');
 assert.equal(run('FIAImages','a1400',p=>{p.resources.images.push({...structuredClone(p.resources.images.find(a=>a.id==='a1400')),sourceFile:'eng/json/999.content.json'});})[0].reason,'ambiguous-id');
 assert.equal(of(mini('eng.MRK-4-35-41',p=>{unitOf(p,'S03-U017').textSha256='0'.repeat(64);}),'eng.MRK-4-35-41','S03-U017')[0].reason,'text-drift');
 assert.deepEqual(of(mini('eng.MRK-1-14-20',p=>{p.resources.maps=[];}),'eng.MRK-1-14-20','S02-U008').map(d=>d.type==='unresolved'?d.reason:d.type),['semantic-needed','no-candidates']);
 assert.equal(verifyDecision({binding:{recipe:'other'}},index).reason,'recipe-mismatch');
 for(const d of associateAll(index).filter(x=>x.evidence?.kind==='inline-resource-ref')){const u=index.packs[d.packId].units.find(x=>x.unitId===d.unitId);assert.ok(inlineReferences(u.html).some(r=>r.namespace===d.evidence.namespace&&r.contentId===d.evidence.contentId));}
});
test('coverage for English Mark (68) and Spanish Luke (97), with the raw dependency named',()=>{
 const mark=coverageReport(index,{language:'eng',book:'MRK'}),luke=coverageReport(index,{language:'spa',book:'LUK'});
 assert.equal(mark.totals.pericopes,68);assert.equal(luke.totals.pericopes,97);assert.equal(mark.pericopes.length,68);assert.equal(luke.pericopes.length,97);
 assert.equal(mark.dependency.missing,RAW_DEPENDENCY);assert.equal(luke.dependency.missing,RAW_DEPENDENCY);assert.equal(mark.totals.pericopesWithRaw,0);
 assert.equal(mark.totals.decisions.explicit,undefined);assert.equal(luke.totals.decisions.explicit,undefined);
 assert.deepEqual(mark.totals.decisions,EXPECTED.mark);assert.deepEqual(luke.totals.decisions,EXPECTED.luke);
 assert.equal(mark.totals.unitsRawProvenanceUnavailable,EXPECTED.markUnits);assert.equal(luke.totals.unitsRawProvenanceUnavailable,EXPECTED.lukeUnits);
});
// Pinned to source revision f8776d92 with no raw input; any change here is a recipe or source change to review.
const EXPECTED={mark:{'semantic-needed':201,'unresolved:raw-provenance-unavailable':235,'unresolved:missing-resource':39,'unresolved:no-candidates':1},luke:{'unresolved:raw-provenance-unavailable':480,'semantic-needed':217,'unresolved:missing-resource':181,'unresolved:no-candidates':1},markUnits:189,lukeUnits:363};
