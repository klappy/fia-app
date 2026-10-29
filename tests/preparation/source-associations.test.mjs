import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {readFileSync} from 'node:fs';
import {buildSourceIndex,associatePack,associateAll,verifyDecision,coverageReport,inlineReferences,requestedKinds,SOURCE_ASSOCIATION_RECIPE,RAW_DEPENDENCY} from '../../server/fia/preparation/source-associations/index.mjs';
import {readRetainedArchives} from '../../server/fia/preparation/source-associations/retained.mjs';
const archives=readRetainedArchives(),index=buildSourceIndex(archives),sha=x=>createHash('sha256').update(x).digest('hex');
const of=(ix,packId,unitId)=>associatePack(ix,packId).filter(d=>d.unitId===unitId);
// A one-pack archive cloned from the retained bytes, mutated per case.
function packOf(packId){return structuredClone(archives.find(x=>x.packs[packId]).packs[packId]);}
function mini(packId,mutate,raw=null){const a=archives.find(x=>x.packs[packId]),pack=packOf(packId);mutate?.(pack);return buildSourceIndex([{revision:a.revision,inventory:a.inventory.filter(f=>f.path.startsWith(`data/packs/${packId}/`)),packs:{[packId]:pack}}],{raw});}
const unitOf=(pack,id)=>pack.guide.steps.flatMap(s=>s.units).find(u=>u.id===id);
// Re-hash consistently in guide.json and guide-units.json, as an honest upstream edit would.
const setUnit=(p,id,text,html=text)=>{const u=unitOf(p,id);u.text=text;u.html=html;u.textSha256=sha(text);for(const st of p['guide-units'].steps)for(const x of st.units)if(x.id===id)x.textSha256=u.textSha256;};
// Test data only: one paragraph of verified public publisher bytes (BibleAquifer/FIATranslationGuide 96bb, spa/json/42.content.json),
// with its full extraction provenance. The runtime module never fetches; nothing else from the file is committed.
const FIX=JSON.parse(readFileSync(new URL('./fixtures/source-associations/spa-luk-1-1-4-s05-u003.raw-fragment.json',import.meta.url)));
const realFragment={jsonPath:`${FIX.provenance.jsonPath}#p${FIX.provenance.paragraphIndex}`,html:FIX.fragment,sha256:FIX.provenance.fragmentSha256};
const rawOf=(packId,fragments,over={})=>({packs:{[packId]:{repo:FIX.provenance.repo,revision:FIX.provenance.revision,path:FIX.provenance.path,fileSha256:FIX.provenance.fileSha256,fragments,...over}}});
// Derived fragments (re-hashed edits of the real one) exercise the join rules; they are not publisher evidence.
const derived=(html,jsonPath='derived')=>({jsonPath,html,sha256:sha(html)});
const fixtureRaw=(packId,htmls)=>rawOf(packId,htmls.map(h=>h===FIX.fragment?realFragment:derived(h)));
const LUKE='spa.LUK-1-1-4',GALILEA='<data class="resource-ref" data-content-id="spa-t55-v1" data-resource-code="FIAKeyTerms">Galilea</data>';

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
test('1. Luke 1:1-4 Galilea spa-t55-v1 at S05-U003: a typed provenance gap without raw source, explicit from verified publisher bytes, nothing at S02',()=>{
 const [gap,...rest]=of(index,LUKE,'S05-U003');assert.equal(rest.length,0);
 assert.equal(gap.type,'unresolved');assert.equal(gap.reason,'raw-provenance-unavailable');assert.equal(gap.dependency,RAW_DEPENDENCY);assert.equal(gap.evidence.provenance,'retained-compiled-guide-html');
 assert.deepEqual([gap.namespace,gap.resourceId,gap.evidence.label],['FIAKeyTerms','spa-t55-v1','Galilea']);
 assert.ok(!associatePack(index,LUKE).some(d=>d.stepId==='S02'&&d.resourceId==='spa-t55-v1'));
 assert.equal(sha(FIX.fragment),FIX.provenance.fragmentSha256);assert.deepEqual([FIX.provenance.repo,FIX.provenance.revision,FIX.provenance.path,FIX.provenance.fileSha256],['BibleAquifer/FIATranslationGuide','96bb023ab1852ab8bdc3a469fcc820e9f9ea1e30','spa/json/42.content.json','6d6713a2bfb846d4b7275a9f2c2a76f59e3963fcfbdadc5acf2d5374f789811d']);
 const withRaw=mini(LUKE,null,rawOf(LUKE,[realFragment]));
 const [d]=of(withRaw,LUKE,'S05-U003');assert.equal(d.type,'explicit',JSON.stringify(d));assert.deepEqual([d.namespace,d.resourceId],['FIAKeyTerms','spa-t55-v1']);assert.equal(d.evidence.provenance,'raw-publisher-html');assert.equal(d.evidence.rawFragmentSha256,FIX.provenance.fragmentSha256);assert.equal(d.evidence.rawRevision,FIX.provenance.revision);assert.equal(d.evidence.rawFileSha256,FIX.provenance.fileSha256);
 assert.equal(of(buildSourceIndex(archives,{raw:rawOf(LUKE,[realFragment])}),LUKE,'S05-U003')[0].type,'explicit','the real fragment joins against the full retained index too');
 assert.equal(verifyDecision(d,withRaw).type,'verified');
 assert.ok(!associatePack(withRaw,LUKE).some(x=>x.stepId==='S02'&&x.type==='explicit'));
 for(const k of ['autoplay','pause','order','medium','primary'])assert.equal(k in d,false,'association only');
});
test('2. joins match exactly on namespace, language, source and unit',()=>{
 const html=FIX.fragment;
 assert.equal(of(mini(LUKE,null,fixtureRaw(LUKE,[html.replace('data-resource-code="FIAKeyTerms"','data-resource-code="FIAImages"')])),LUKE,'S05-U003')[0].reason,'compiled-only-annotation','raw tag in another namespace');
 assert.equal(of(mini(LUKE,null,fixtureRaw(LUKE,[html.replace('spa-t55-v1','spa-t55-v2')])),LUKE,'S05-U003')[0].reason,'compiled-only-annotation','raw tag for another source id');
 const other=packOf(LUKE).guide.steps.flatMap(s=>s.units).find(u=>u.id==='S05-U004').html;
 assert.equal(of(mini(LUKE,null,fixtureRaw(LUKE,[other+' '+GALILEA])),LUKE,'S05-U003')[0].reason,'unanchored','raw tag anchored to another unit');
 assert.equal(of(mini(LUKE,p=>{const u=unitOf(p,'S05-U003');setUnit(p,'S05-U003',u.text,u.html.replace('spa-t55-v1','eng-t55-v1'));}),LUKE,'S05-U003')[0].reason,'language-mismatch');
 assert.equal(of(mini(LUKE,null,fixtureRaw('spa.LUK-1-5-25',[html])),LUKE,'S05-U003')[0].reason,'raw-provenance-unavailable','raw evidence for another pack never applies');
});
test('a tampered fragment or a provenance record that does not match fails closed',()=>{
 const run=raw=>of(mini(LUKE,null,raw),LUKE,'S05-U003')[0].reason;
 assert.equal(run(rawOf(LUKE,[{...realFragment,html:FIX.fragment.replace('Galilea<','Judea<')}])),'raw-provenance-invalid','fragment bytes no longer match the recorded sha256');
 assert.equal(run(rawOf(LUKE,[realFragment],{path:'spa/json/41.content.json'})),'raw-provenance-invalid','another publisher file');
 assert.equal(run(rawOf(LUKE,[realFragment],{repo:'someone/OtherGuide'})),'raw-provenance-invalid','another repo');
 assert.equal(run(rawOf(LUKE,[realFragment],{revision:'96bb'})),'raw-provenance-invalid','not an exact revision');
 assert.equal(run(rawOf(LUKE,[realFragment],{fileSha256:'x'})),'raw-provenance-invalid');
 assert.equal(run(rawOf(LUKE,[realFragment],{trusted:true})),'raw-provenance-invalid','a declared trusted flag is never authority');
 const label=FIX.fragment.replace('<data class="resource-ref" data-content-id="spa-t55-v1" data-resource-code="FIAKeyTerms">Galilea</data>','Galilea');
 assert.equal(run(rawOf(LUKE,[derived(label)])),'compiled-only-annotation','a label or text match without the raw tag is not a join');
});
test('3. a stale HTML or reference change with unchanged text is invalidated',()=>{
 const html=FIX.fragment,withRaw=mini(LUKE,null,fixtureRaw(LUKE,[html]));
 const [d]=of(withRaw,LUKE,'S05-U003'),[gap]=of(index,LUKE,'S05-U003');
 for(const change of [h=>h.replace('>Galilea<','>Galilee<'),h=>h.replace('spa-t55-v1','spa-t56-v1'),h=>h.replace(GALILEA,'Galilea')]){
  const moved=mini(LUKE,p=>{unitOf(p,'S05-U003').html=change(unitOf(p,'S05-U003').html);},fixtureRaw(LUKE,[html]));
  assert.equal(verifyDecision(d,moved).reason,'reference-drift');assert.equal(verifyDecision(gap,moved).reason,'reference-drift');
 }
 assert.equal(verifyDecision(d,mini(LUKE,null,rawOf(LUKE,[realFragment],{revision:'1'.repeat(40)}))).reason,'revision-drift');
 const [a293]=of(index,'eng.MRK-4-35-41','S03-U017');
 assert.equal(verifyDecision(a293,mini('eng.MRK-4-35-41',p=>{p.resources.images.find(a=>a.id==='a293').sourceFileSha256='f'.repeat(64);})).reason,'revision-drift');
 const drift=mini('eng.MRK-4-35-41',p=>{p.resources.images.find(a=>a.id==='a293').titleProvenance.revision='0'.repeat(40);});assert.equal(of(drift,'eng.MRK-4-35-41','S03-U017')[0].reason,'revision-drift');
 assert.equal(verifyDecision(a293,mini('eng.MRK-4-35-41',p=>{const u=unitOf(p,'S03-U017');setUnit(p,'S03-U017',u.text+' Changed.',u.html+' Changed.');})).reason,'text-drift');
});
test('4. an ambiguous anchor abstains',()=>{
 const html=FIX.fragment;
 assert.equal(of(mini(LUKE,null,fixtureRaw(LUKE,[html,html])),LUKE,'S05-U003')[0].reason,'ambiguous-anchor','two raw paragraphs anchor to the unit');
 const twin=mini(LUKE,p=>{const u=unitOf(p,'S05-U003');setUnit(p,'S05-U004',u.text,u.text);},fixtureRaw(LUKE,[html]));
 assert.equal(of(twin,LUKE,'S05-U003')[0].reason,'ambiguous-anchor','two units share the anchor text');
 const split=html.replace(GALILEA,GALILEA.replace('>Galilea<','>Gali<')+GALILEA.replace('>Galilea<','>lea<'));assert.equal(of(mini(LUKE,null,fixtureRaw(LUKE,[split])),LUKE,'S05-U003')[0].reason,'ambiguous-anchor','the tag repeats inside the anchor');
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
