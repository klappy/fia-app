import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectPreparationAvailability} from '../build/preparation-availability.js';
import {projectScripturePassageBindings,scripturePassageBindingsDefinition} from '../build/scripture-passage-availability.js';
import {guideRecordingAvailability,hasGuidePreparation,declaresScripturePassage} from '../src/lib/recording-availability.js';
const catalog=JSON.parse(readFileSync(new URL('../../../server/fia/preparation/catalog.json',import.meta.url),'utf8'));
const registry=JSON.parse(readFileSync(new URL('../public/content/registry.json',import.meta.url),'utf8'));
const pack=registry.packs.find(p=>p.id==='eng.MRK-1-14-20');
test('exact reviewed original admission distinguishes partial on-request from packaged and unavailable',()=>{
 const projected=projectPreparationAvailability(catalog);
 assert.equal(guideRecordingAvailability(pack,projected),'Some guide recordings available on request');
 assert.equal(guideRecordingAvailability({...pack,revision:'f'.repeat(64)},projected),'Guide recordings unavailable');
 assert.equal(guideRecordingAvailability({...pack,language:'spa'},projected),'Guide recordings unavailable');
 assert.equal(guideRecordingAvailability({...pack,id:'eng.MRK-2-1-12'},projected),'Guide recordings unavailable');
 assert.equal(guideRecordingAvailability({...pack,capabilities:{guideNarration:{count:111}}},projected),'Guide recordings available');
 assert.deepEqual(Object.keys(projected[0]).sort(),['activities','edition','language','packId','presentationRevision']);
 assert.ok(!JSON.stringify(projected).includes('https:'));
});
test('unaccepted, ineligible, alternate quality and wrong edition do not advertise preparation',()=>{
 for(const mutate of [row=>row.accepted=null,row=>row.blockedReason='review-required',row=>row.eligibility='blocked',row=>row.selection.quality='medium',row=>row.selection.edition='scripture']){
  const modified=structuredClone(catalog);modified.entries.forEach(mutate);
  assert.equal(guideRecordingAvailability(pack,projectPreparationAvailability(modified)),'Guide recordings unavailable');
 }
});

test('copied selection and malformed identities cannot reuse another acceptance',()=>{
 for(const mutate of [row=>row.selection.presentationRevision='f'.repeat(64),row=>row.identity.language='spa',row=>row.accepted.expected.identity.packId='eng.MRK-2-1-12',row=>{row.selection.language=row.identity.language=row.accepted.expected.identity.language='spa';},row=>{row.selection.presentationRevision=row.identity.presentationRevision=row.accepted.expected.identity.presentationRevision='not-a-hash';}]){
  const modified=structuredClone(catalog);modified.entries.forEach(mutate);assert.deepEqual(projectPreparationAvailability(modified),[]);
 }
});

test('automatic preparation matches the exact accepted activity and source hash',()=>{
 const rows=projectPreparationAvailability(catalog),activity=rows[0].activities[0];
 assert.equal(hasGuidePreparation(pack,activity,rows),true);
 for(const change of [{activityId:'S02-U001'},{sourceUnitId:'other'},{sourceTextSha256:'f'.repeat(64)}])assert.equal(hasGuidePreparation(pack,{...activity,...change},rows),false);
});

// B1-bis (review of #201): the packaged passage-only Scripture binding is declared by the build, by ids only.
test('the packaged passage-only Scripture binding is projected by pack, presentation revision and reading',()=>{
 const rows=JSON.parse(scripturePassageBindingsDefinition());
 assert.deepEqual(rows,[{packId:'eng.MRK-1-14-20',presentationRevision:pack.revision,assetId:'scripture-BereanStandardBible'}]);
 assert.equal(declaresScripturePassage(pack,'scripture-BereanStandardBible',rows),true);
 for(const [p,asset] of [[pack,'scripture-unfoldingWordLiteral'],[{...pack,revision:'f'.repeat(64)},'scripture-BereanStandardBible'],[registry.packs.find(p=>p.id==='eng.MRK-1-21-28'),'scripture-BereanStandardBible'],[null,'scripture-BereanStandardBible']])assert.equal(declaresScripturePassage(p,asset,rows),false);
 assert.equal(declaresScripturePassage(pack,'scripture-BereanStandardBible'),false,'without the build define nothing is declared');
});
test('a sidecar for another revision or with a second candidate is never projected',()=>{
 const sidecar=JSON.parse(readFileSync(new URL('../public/content/delivery/eng.MRK-1-14-20/b40f0de65327a049437b071849300b7366c2267f4746d888a737aa6132caccfe.json',import.meta.url),'utf8'));
 const only=list=>id=>id==='eng.MRK-1-14-20'?list:[];
 assert.throws(()=>projectScripturePassageBindings({packs:[{...pack,revision:'f'.repeat(64)}]},only([sidecar])));
 assert.throws(()=>projectScripturePassageBindings(registry,only([sidecar,sidecar])),/Ambiguous/);
 assert.deepEqual(projectScripturePassageBindings(registry,()=>[]),[]);
});
