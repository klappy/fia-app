import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {resolve,join} from 'node:path';
import {compilePresentation,digest,resolveResourceLink,termTitle,stageHeaderUnit,siblingTerm,withholdCollidingHeadwords} from '../../server/fia/compiler/presentation/compile.mjs';
import {canonicalSourceActionCandidate,validateCanonicalSourceActionCandidate} from '../../server/fia/compiler/presentation/source-action-candidates.mjs';
const root=process.env.FIA_RAW_PACKS?resolve(process.env.FIA_RAW_PACKS):null;
const archive=JSON.parse(gunzipSync(readFileSync(new URL('../../server/fia/compiler/presentation/source-packs.json.gz',import.meta.url)))),bundled=archive.packs,inventory=archive.inventory;
const luke=JSON.parse(gunzipSync(readFileSync(new URL('../../server/fia/compiler/presentation/source-packs-luk.json.gz',import.meta.url)))).packs;Object.assign(bundled,luke);
const lists=JSON.parse(readFileSync(new URL('../../server/fia/compiler/presentation/lists.json',import.meta.url)));
const examples=JSON.parse(readFileSync(new URL('../../server/fia/compiler/presentation/examples.json',import.meta.url)));
const json=p=>JSON.parse(readFileSync(p));
const input=id=>root?Object.fromEntries(['manifest','guide','guide-units','scripture','resources','rights','narration'].map(k=>[k,json(join(root,id,k+'.json'))])):structuredClone(bundled[id]);
const compile=(data,options={})=>compilePresentation(data,{listEvidence:lists.packs.find(p=>p.packId===data.guide.packId),exampleEvidence:examples.packs.find(p=>p.packId===data.guide.packId),...options});
test('four cross-language source packs use same compiler with exact coverage and no eager media',()=>{
 for(const id of ['eng.MRK-1-1-13','spa.MRK-1-1-13','eng.MRK-1-14-20','spa.MRK-1-14-20']){
  const data=input(id),a=compile(data),b=compile(data),pack=a.pack;
  assert.deepEqual(a,b);assert.equal(pack.id,id);assert.equal(pack.coverage.length,data.guide.steps.flatMap(s=>s.units).length);
  const units=new Map(data.guide.steps.flatMap(s=>s.units).map(u=>[u.id,u]));
  for(const activity of pack.activities.filter(a=>a.sourceUnitId)){assert.equal(activity.sourceText,units.get(activity.sourceUnitId).text);assert.equal(digest(activity.sourceText),activity.sourceSha256);assert.ok(!activity.audioSrc);}
  for(const e of pack.examples)assert.equal(e.text,units.get(e.id).text);
  assert.equal(pack.listContracts.find(g=>g.purpose==='discussion').layout,'separate');assert.ok(pack.listContracts.some(g=>g.layout==='together'));
  for(const g of pack.listContracts.filter(g=>g.layout==='together'))for(const aid of [g.introId,...g.itemIds])assert.equal(pack.activities.find(a=>a.id===aid).readingGroupId,g.id);
  const editions=Object.values(pack.assets).filter(x=>x.kind==='scripture').length;assert.equal(pack.scriptureReadingSequence[0].editionIds.length,Math.min(3,editions));assert.equal(new Set(pack.scriptureReadingSequence[0].editionIds).size,pack.scriptureReadingSequence[0].editionIds.length);assert.ok(pack.assets[a.defaultScriptureId]);
  for(const asset of Object.values(pack.assets)){assert.ok(!asset.src&&!asset.audioSrc&&!asset.descriptionAudio);assert.ok(asset.rights);}
  assert.equal(a.capabilities.guideNarration.status,'unavailable');assert.equal(a.capabilities.generatedAudio.count,0);
  assert.ok(a.capabilities.resourceAudio.count>0);
 }
});
test('semantic bindings and text hashes fail closed, v2 flags cannot change output',()=>{
 const data=input('spa.MRK-1-14-20'),original=compile(data);const flags=structuredClone(data);for(const s of flags.guide.steps)for(const u of s.units){u.pause=!u.pause;u.hidden=!u.hidden;}
 assert.throws(()=>compile(flags),/pinned source identity mismatch/);
 const corrupt=structuredClone(data);corrupt.guide.steps[0].units[0].text+='modified';assert.throws(()=>compile(corrupt),/identity mismatch/);
 const g=structuredClone(data);g.guide.contentSha256='0'.repeat(64);assert.throws(()=>compile(g),/identity mismatch/);
});
test('all 136 packs compile with every original unit accounted for independently',()=>{
 const ids=(root?readdirSync(root):Object.keys(bundled)).filter(id=>/^(eng|spa)\.MRK-/.test(id));assert.equal(ids.length,136);
 for(const id of ids){const data=input(id),{pack}=compile(data),all=data.guide.steps.flatMap(s=>s.units);assert.deepEqual(pack.coverage.map(x=>x.id),all.map(x=>x.id));assert.equal(new Set(pack.coverage.map(x=>x.id)).size,all.length);for(const g of pack.listContracts)for(const item of g.itemIds)assert.ok(pack.activities.some(a=>a.id===item));}
});

// Honest-text rules (release/changes/2026-11-09-spanish-luke-honest-text.md).
test('raw FIAKeyTerms link ids resolve to the term asset by number, once, and nothing else resolves',()=>{
 const assets={'term-spa-t68':{},'term-eng-t4':{},a112:{}};
 assert.equal(resolveResourceLink('spa-t68-v1',assets),'term-spa-t68');assert.equal(resolveResourceLink('eng-t4-v2',assets),'term-eng-t4');assert.equal(resolveResourceLink('term-spa-t68',assets),'term-spa-t68');assert.equal(resolveResourceLink('a112',assets),'a112');
 assert.equal(resolveResourceLink('spa-t999-v1',assets),null);assert.equal(resolveResourceLink('eng-t68-v1',assets),null);assert.equal(resolveResourceLink('c4',assets),null);
 const {pack,diagnostics}=compile(input('spa.LUK-1-26-38')),linked=new Set(pack.activities.flatMap(a=>a.relatedAssetIds||[]));
 assert.ok(linked.has('term-spa-t68'),'Espíritu Santo reaches a step through its raw spa-t68-vN link');
 for(const d of diagnostics.filter(d=>d.code==='unresolved-resource-link'))assert.ok(!pack.assets[d.resourceId.replace(/^spa-(t\d+)-v\d+$/,'term-spa-$1')],'only links to terms the pack does not carry stay unresolved: '+d.resourceId);
 for(const a of pack.activities)if(a.relatedAssetIds){assert.equal(new Set(a.relatedAssetIds).size,a.relatedAssetIds.length);for(const id of a.relatedAssetIds)assert.ok(pack.assets[id]);}
 const eng=compile(input('eng.LUK-1-26-38'));for(const d of eng.diagnostics.filter(d=>d.code==='unresolved-resource-link'))assert.ok(!eng.pack.assets[d.resourceId.replace(/^eng-(t\d+)-v\d+$/,'term-eng-$1')],d.resourceId);
});
test('term card titles come from the FIAKeyTerms headword, never from a translator; the English fallback is marked, not hidden',()=>{
 const spa=compile(input('spa.LUK-1-26-38')).pack,eng=compile(input('eng.LUK-1-26-38')).pack;
 assert.equal(spa.assets['term-spa-t68'].title,'Espíritu Santo');assert.deepEqual(spa.assets['term-spa-t68'].titleProvenance,{status:'source',from:'FIAKeyTerms headword',derivedFrom:'holy-spirit'});
 assert.equal(spa.assets['term-spa-t68'].sourceEvidence.title,'holy-spirit','the source key stays on the evidence');
 assert.equal(eng.assets['term-eng-t68'].title,'Holy Spirit');
 const key={title:'kingdom-of-god',termNumber:'82',text:{html:'<p>Es el <data class="resource-ref">reino</data> de <b>Dios</b>…</p>'}};
 assert.deepEqual(termTitle(key,{language:'spa'}),{title:'kingdom-of-god',titleProvenance:{status:'missing',badge:'not-yet-in-language',fallback:'eng'}});
 assert.deepEqual(termTitle(key,{language:'eng'}),{title:'Kingdom of God',titleProvenance:{status:'source',from:'FIAKeyTerms key',derivedFrom:'kingdom-of-god'}});
 assert.deepEqual(termTitle({title:'fe',termNumber:'48',text:{html:'<p>…</p>'}},{language:'spa',sibling:{assets:{'term-eng-t48':{sourceEvidence:{title:'faith'}}}}}),{title:'fe',titleProvenance:{status:'source'}},'a Spanish source title that differs from the English key is kept');
 assert.deepEqual(termTitle({title:'gospel',termNumber:'60',text:{html:'<p>…</p>'}},{language:'spa',sibling:{assets:{'term-eng-t60':{sourceEvidence:{title:'gospel'}}}}}).titleProvenance,{status:'missing',badge:'not-yet-in-language',fallback:'eng'});
 assert.deepEqual(termTitle({title:'Dalmanutha',termNumber:'32',text:{html:'<p><b>Dalmanuta</b></p>'}},{language:'spa'}),{title:'Dalmanutha',titleProvenance:{status:'source'}});
 assert.equal(termTitle({title:'angel',termNumber:'4',text:{html:'<p>Un <b>ángel</b> es…</p>'}},{language:'spa',sibling:{assets:{'term-eng-t4':{sourceEvidence:{title:'Angel'}}}}}).title,'Ángel','the English title in key form marks the Spanish title as the key; the headword is capitalised, not translated');
 assert.equal(termTitle({title:'baptism',termNumber:'9',text:{html:'<p>To <b>baptize</b>…</p>'}},{language:'eng'}).title,'Baptism','English keeps the key written out, not the body headword');
});
test('stage-title and passage-reference header units are dropped by rule and stay accounted for in coverage',()=>{
 const data=input('eng.LUK-5-12-16'),{pack,diagnostics}=compile(data),all=data.guide.steps.flatMap(s=>s.units);
 assert.deepEqual(diagnostics.filter(d=>d.code==='stage-header-unit').map(d=>d.unitId),['S05-U001','S05-U002']);
 assert.deepEqual(pack.coverage.map(x=>x.id),all.map(x=>x.id));assert.deepEqual(pack.coverage.filter(c=>c.treatment==='stage-header').map(c=>c.id),['S05-U001','S05-U002']);
 assert.ok(!pack.activities.some(a=>['S05-U001','S05-U002'].includes(a.id)));
 const section={title:'Setting the Stage'},ref={passage:'MRK 2:23-3:6',title:'Mark 2:23–3:6'};
 assert.equal(stageHeaderUnit({text:'SETTING THE STAGEMARK 2:23–3:6'},section,ref),true);assert.equal(stageHeaderUnit({text:'LUKE 5.12–16'},{title:'Filling the Gaps'},{passage:'LUK 5:12-16',title:'Luke 5:12–16'}),true);
 assert.equal(stageHeaderUnit({text:'Setting the stage for Mark 2:23–3:6 begins here.'},section,ref),false);assert.equal(stageHeaderUnit({text:''},section,ref),false);
 const spa=compile(input('spa.LUK-5-12-16'));assert.equal(spa.diagnostics.filter(d=>d.code==='stage-header-unit').length,0);
});
test('a Spanish pack reads each of its editions once; English keeps three readings',()=>{
 const spa=compile(input('spa.LUK-1-1-4')).pack,eng=compile(input('eng.LUK-1-1-4')).pack;
 assert.deepEqual(spa.scriptureReadingSequence[0].editionIds,['scripture-ReinaValera1909','scripture-AquiferSpanishBibleReferenceText']);
 assert.equal(spa.activities.filter(a=>a.kind==='scripture'&&a.fulfills===spa.scriptureReadingSequence[0].sourceUnitId).length,2);
 assert.equal(eng.scriptureReadingSequence[0].editionIds.length,3);assert.equal(new Set(eng.scriptureReadingSequence[0].editionIds).size,3);
});
test('a Spanish pack compiled beside its English twin records where English text is shown; English packs never do',()=>{
 const eng=compile(input('eng.LUK-1-1-4')).pack,spa=compile(input('spa.LUK-1-1-4'),{sibling:eng}).pack,alone=compile(input('spa.LUK-1-1-4')).pack;
 assert.equal(spa.assets['term-spa-t55'].spanishText,'present');assert.equal(spa.assets['term-spa-t55'].title,'Galilea');
 const map=Object.values(spa.assets).find(a=>a.kind==='map');assert.equal(map.spanishText,'english-fallback');assert.equal(map.titleProvenance.fallback,'eng');
 assert.ok(Object.values(eng.assets).every(a=>!('spanishText' in a)));assert.ok(Object.values(alone.assets).every(a=>!('spanishText' in a)));
 assert.ok(['present','missing','english-fallback'].includes(spa.assets['term-spa-t55'].spanishText));
});
test('frozen compilation reproduces the committed English Mark 1:14-20 presentation byte for byte',()=>{
 const registry=JSON.parse(readFileSync(new URL('../../apps/web/public/content/registry.json',import.meta.url))),d=registry.packs.find(p=>p.id==='eng.MRK-1-14-20');
 const sourceFiles=inventory.filter(f=>f.path.startsWith('data/packs/eng.MRK-1-14-20/')).sort((a,b)=>a.path<b.path?-1:1);
 const committed=readFileSync(new URL('../../apps/web/public'+d.presentation.url,import.meta.url),'utf8'),{pack}=compile(input('eng.MRK-1-14-20'),{frozen:true,sourceFiles});
 assert.equal(JSON.stringify(pack,null,2)+'\n',committed);assert.equal(digest(committed),d.revision);
});

// Codex P2 findings on #356 (compile.mjs): legacy sibling term ids, the executable candidate contract, headword collisions.
test('spa.MRK-1-1-13 beside the approved presentation: legacy eng-tN-vN twins mark the English keys, so no untranslated key ships as a Spanish title',()=>{
 const approved=JSON.parse(readFileSync(new URL('../../server/fia/publication/approved-presentation.json',import.meta.url)));
 assert.equal(approved.assets['eng-t4-v1']?.kind,'term','the approved pack carries legacy term ids');assert.equal(siblingTerm(approved,4),approved.assets['eng-t4-v1']);assert.equal(siblingTerm(approved,999),null);
 assert.equal(siblingTerm({assets:{'term-eng-t4':{id:'term-eng-t4',kind:'term'}}},'4').id,'term-eng-t4');
 const {pack,diagnostics}=compile(input('spa.MRK-1-1-13'),{sibling:approved});
 assert.deepEqual([4,5,9,23,38,63,76,118].map(n=>pack.assets['term-spa-t'+n].title),['Ángel','Ungir','Bautizar','Cristo','Desierto','Cielo','Jerusalén','Satanás'],'headwords from the Spanish text, first letter capitalised');
 for(const n of [4,5,9])assert.deepEqual(pack.assets['term-spa-t'+n].titleProvenance,{status:'source',from:'FIAKeyTerms headword',derivedFrom:pack.assets['term-spa-t'+n].sourceEvidence.title});
 for(const n of [92,145]){const a=pack.assets['term-spa-t'+n];assert.deepEqual(a.titleProvenance,{status:'missing',badge:'not-yet-in-language',fallback:'eng'},a.id+' has no headword: the key stays, marked');assert.equal(a.spanishText,'english-fallback',a.id+' shows [ES needed]');}
 assert.equal(pack.assets['term-spa-t4'].spanishText,'present');assert.equal(pack.assets['term-spa-t88'].title,'Señor');assert.deepEqual(pack.assets['term-spa-t88'].titleProvenance,{status:'source'});
 for(const a of Object.values(pack.assets).filter(a=>a.kind==='term')){const twin=siblingTerm(approved,a.sourceEvidence.termNumber);if(twin&&a.titleProvenance.status==='source'&&!a.titleProvenance.from)assert.notEqual(a.title.toLowerCase(),String(twin.title).toLowerCase(),a.id+': an English key published as a Spanish title');}
 assert.ok(!diagnostics.some(d=>d.code==='term-headword-withheld'),'nothing in this pack collides');
});
test('an executable candidate composes on a retitled term: the derived title is bound to the evidence title it came from',async()=>{
 const eng=compile(input('eng.LUK-1-26-38')).pack,spa=compile(input('spa.LUK-1-26-38'),{sibling:eng}).pack,term=spa.assets['term-spa-t68'];
 assert.equal(term.title,'Espíritu Santo');assert.equal(term.sourceEvidence.title,'holy-spirit');
 const candidate=await canonicalSourceActionCandidate(term,'spa');
 assert.equal(candidate.title,'Espíritu Santo');assert.equal(candidate.language,'spa');assert.equal(candidate.resourceId,term.sourceEvidence.id);assert.equal(await validateCanonicalSourceActionCandidate(candidate,term,'spa'),true);
 const written=eng.assets['term-eng-t68'];assert.equal(written.title,'Holy Spirit');assert.equal((await canonicalSourceActionCandidate(written,'eng')).title,'Holy Spirit','the English key written out composes too');
 const marker=Object.values(spa.assets).find(a=>a.kind==='term'&&a.titleProvenance?.status==='missing');assert.ok(marker);assert.equal((await canonicalSourceActionCandidate(marker,'spa')).title,marker.sourceEvidence.title,'the marker keeps the evidence title');
 const frozen=compile(input('eng.MRK-1-14-20'),{frozen:true}).pack,frozenTerm=Object.values(frozen.assets).find(a=>a.kind==='term');assert.ok(!frozenTerm.titleProvenance);assert.equal((await canonicalSourceActionCandidate(frozenTerm,'eng')).title,frozenTerm.sourceEvidence.title,'frozen English Mark is unchanged');
 for(const bad of [{...term,title:'Spirit'},{...term,title:'Espíritu Malo'},{...term,titleProvenance:{status:'source',from:'FIAKeyTerms headword'}},{...term,titleProvenance:{...term.titleProvenance,derivedFrom:'spirit'}},{...term,titleProvenance:{...term.titleProvenance,status:'missing'}},{...term,titleProvenance:{...term.titleProvenance,from:'translator'}},{...written,title:'Holy Ghost'}])await assert.rejects(()=>canonicalSourceActionCandidate(bad,bad.id.startsWith('term-eng')?'eng':'spa'),/execution-canonical-candidate/,'a title the evidence does not derive is refused: '+bad.title+' '+JSON.stringify(bad.titleProvenance));
});
test('an opening bold phrase is not promoted to the headword when it collides with another term in the pack; word counts are never compared across languages',()=>{
 for(const id of ['spa.MRK-5-21-34','spa.MRK-5-35-43']){
  const {pack,diagnostics}=compile(input(id),{sibling:compile(input('eng.'+id.slice(4))).pack}),t133=pack.assets['term-spa-t133'],t134=pack.assets['term-spa-t134'];
  assert.equal(t133.title,'Sinagoga');assert.equal(t133.titleProvenance.from,'FIAKeyTerms headword');
  assert.equal(t134.title,'synagogue-ruler');assert.deepEqual(t134.titleProvenance,{status:'missing',badge:'not-yet-in-language',fallback:'eng',withheld:'collision'});
  assert.deepEqual(diagnostics.filter(d=>d.code==='term-headword-withheld'),[{code:'term-headword-withheld',assetId:'term-spa-t134',reason:'collision'}]);
  const titles=Object.values(pack.assets).filter(a=>a.kind==='term').map(a=>a.title.toLowerCase());assert.equal(new Set(titles).size,titles.length,id+': every term title is distinct');
 }
 assert.equal(termTitle({title:'synagogue-ruler',termNumber:'134',text:{html:'<p>Una <b>sinagoga</b> es…</p>'}},{language:'spa'}).title,'Sinagoga','alone, the headword stands: only a collision in the pack withholds it');
 assert.equal(termTitle({title:'fig-tree',termNumber:'51',text:{html:'<p>Una <b>higuera</b> es…</p>'}},{language:'spa'}).title,'Higuera','one Spanish word for a two-word key is not a reason to withhold');
 for(const id of ['spa.MRK-11-12-26','spa.MRK-13-24-31','spa.LUK-6-43-49','spa.LUK-13-1-9']){const {pack}=compile(input(id),{sibling:compile(input('eng.'+id.slice(4))).pack});assert.equal(pack.assets['term-spa-t51'].title,'Higuera',id);assert.equal(pack.assets['term-spa-t51'].titleProvenance.from,'FIAKeyTerms headword');}
 assert.equal(termTitle({title:'son-of-god',termNumber:'129',text:{html:'<p>El <b>Hijo de Dios</b> es…</p>'}},{language:'spa'}).title,'Hijo de Dios');
 assert.deepEqual(termTitle({title:'kingdom-of-god',termNumber:'82',text:{html:'<p>El <b>reino</b></p>'}},{language:'spa'}).titleProvenance.withheld,undefined);
 const mk=(id,title,key,from)=>({id,kind:'term',title,titleProvenance:from?{status:'source',from,derivedFrom:key}:{status:'source'},sourceEvidence:{title:key}});
 const assets={a:mk('a','Sinagoga','synagogue','FIAKeyTerms headword'),b:mk('b','sinagoga','sinagoga'),c:mk('c','Fe','faith','FIAKeyTerms headword'),s:{id:'s',kind:'scripture',title:'Fe'}};
 assert.deepEqual(withholdCollidingHeadwords(assets),['a']);
 assert.deepEqual(assets.a,{id:'a',kind:'term',title:'synagogue',titleProvenance:{status:'missing',badge:'not-yet-in-language',fallback:'eng',withheld:'collision'},sourceEvidence:{title:'synagogue'}},'a headword that collides with another term\'s source title falls back to the marker');
 assert.equal(assets.b.title,'sinagoga');assert.equal(assets.c.title,'Fe','no collision, no change (scripture titles are not terms)');
 const two={x:mk('x','Sinagoga','synagogue','FIAKeyTerms headword'),y:mk('y','Sinagoga','synagogue-ruler','FIAKeyTerms headword')};
 assert.deepEqual(withholdCollidingHeadwords(two),['y']);assert.equal(two.x.title,'Sinagoga');assert.equal(two.y.title,'synagogue-ruler','the base concept keeps the shared phrase; its compound is withheld');
 const tie={x:mk('x','Maestro','teacher','FIAKeyTerms headword'),y:mk('y','Maestro','rabbi','FIAKeyTerms headword')};
 assert.deepEqual(withholdCollidingHeadwords(tie).sort(),['x','y'],'no base among colliding headwords: all withheld, never a guess');
});
