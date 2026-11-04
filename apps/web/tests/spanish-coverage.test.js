import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKER, STATE, mtEnabled, reportPack, resolveItem, summarize } from '../src/lib/spanish-coverage.js';

// TEST FIXTURES ONLY. Invented ids and placeholder strings; no Spanish prose, nothing machine-translated.
const eng = { id: 'eng.X', activities: [{ id: 'S01-U001' }, { id: 'S01-U002' }], assets: {
  a1: { kind: 'image', title: 'River' }, c1: { kind: 'map', title: 'Map title' }, a2: { kind: 'video', title: 'Clip' },
  'eng-t4-v1': { id: 'eng-t4-v1', kind: 'term', title: 'angel', text: 'ENGLISH TEXT 4' },
  'eng-t5-v1': { id: 'eng-t5-v1', kind: 'term', title: 'anoint', text: 'ENGLISH TEXT 5' },
  'eng-t6-v1': { id: 'eng-t6-v1', kind: 'term', title: 'x', text: 'ENGLISH TEXT 6' },
  s1: { kind: 'scripture', title: 'ignored' } } };
const spa = { id: 'spa.X', activities: [{ id: 'S01-U001' }, { id: 'S01-U002' }], assets: {
  a1: { kind: 'image', title: 'ES-TITLE-1' }, c1: { kind: 'map', title: 'Map title' },
  'term-spa-t4': { id: 'term-spa-t4', kind: 'term', title: 'angel', text: 'ES-TEXT-4' },
  'term-spa-t5': { id: 'term-spa-t5', kind: 'term', title: 'anoint', text: 'ENGLISH TEXT 5' } } };
const find = (items, id) => items.find(i => i.id === id);

test('present, english-fallback and missing are told apart per item', () => {
  const r = reportPack(eng, spa);
  assert.equal(find(r, 'a1').state, STATE.PRESENT);
  assert.equal(find(r, 'c1').state, STATE.ENGLISH_FALLBACK);
  assert.equal(find(r, 'a2').state, STATE.MISSING);
  assert.equal(find(r, 'eng-t4-v1').state, STATE.PRESENT);
  assert.equal(find(r, 'eng-t5-v1').state, STATE.ENGLISH_FALLBACK);
  assert.equal(find(r, 'eng-t6-v1').state, STATE.MISSING);
  assert.equal(find(r, 's1'), undefined); // scripture is not a resource or entity here
  assert.equal(find(r, 'spa.X').state, STATE.PRESENT);
});
test('a pericope with a missing Spanish step, or no Spanish pack, is missing', () => {
  const short = { ...spa, activities: [{ id: 'S01-U001' }] };
  assert.deepEqual(reportPack(eng, short)[0], { group: 'pericope', id: 'spa.X', state: STATE.MISSING, missingSteps: ['S01-U002'] });
  const none = reportPack(eng, null);
  assert.equal(none[0].state, STATE.MISSING); assert.equal(none[0].missingSteps.length, 2);
  assert.ok(none.filter(i => i.group !== 'pericope').every(i => i.state === STATE.MISSING));
});
test('empty Spanish text counts as missing', () => {
  const blank = { ...spa, assets: { ...spa.assets, a1: { kind: 'image', title: '  ' } } };
  assert.equal(find(reportPack(eng, blank), 'a1').state, STATE.MISSING);
});
test('MT toggle defaults OFF; only an explicit true turns it on', () => {
  for (const c of [undefined, null, {}, { machineTranslation: false }, { machineTranslation: 'true' }, { machineTranslation: 1 }]) assert.equal(mtEnabled(c), false);
  assert.equal(mtEnabled({ machineTranslation: true }), true);
});
test('default OFF shows the marker, never English and never machine text', () => {
  const miss = { group: 'resource', id: 'a2', state: STATE.MISSING };
  for (const cfg of [undefined, {}, { machineTranslation: false }]) {
    const out = resolveItem(miss, { config: cfg, machineTranslated: '[MT] placeholder' });
    assert.deepEqual(out, { show: 'marker', marker: MARKER, label: STATE.MISSING });
  }
  assert.equal(resolveItem({ ...miss, state: STATE.ENGLISH_FALLBACK }).show, 'marker');
});
test('MT ON with no provider output still shows the marker; with a supplied string it is labelled machine-translated', () => {
  const miss = { group: 'entity', id: 'eng-t6-v1', state: STATE.MISSING };
  assert.equal(resolveItem(miss, { config: { machineTranslation: true } }).show, 'marker');
  assert.deepEqual(resolveItem(miss, { config: { machineTranslation: true }, machineTranslated: '[MT] placeholder' }), { show: 'text', text: '[MT] placeholder', label: STATE.MACHINE_TRANSLATED });
});
test('present Spanish is shown as is, regardless of the toggle', () => {
  const ok = { group: 'resource', id: 'a1', state: STATE.PRESENT };
  assert.deepEqual(resolveItem(ok, { config: { machineTranslation: true }, machineTranslated: '[MT] x' }), { show: 'spanish', label: null });
});
test('summarize counts lacking per group', () => {
  const s = summarize([reportPack(eng, spa)]);
  assert.deepEqual([s.pericope.total, s.pericope.lacking, s.resource.total, s.resource.lacking, s.entity.total, s.entity.lacking], [1, 0, 3, 2, 3, 2]);
});
