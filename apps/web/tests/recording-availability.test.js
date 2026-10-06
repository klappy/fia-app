import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectPreparationAvailability} from '../build/preparation-availability.js';
import {guideRecordingAvailability} from '../src/lib/recording-availability.js';
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
 assert.deepEqual(Object.keys(projected[0]).sort(),['edition','language','packId','presentationRevision']);
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
