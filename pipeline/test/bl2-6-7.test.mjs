// BL2 autonym, BL6 next- clip ids, BL7 hidden-example anchor in any language.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { markHiddenExamples } from '../src/pericope.mjs';

const json = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), 'utf8'));
const step = (id, texts) => ({ id, units: texts.map((text, i) => ({ id: `${id}-U${String(i + 1).padStart(3, '0')}`, text })) });

test('BL7: the English opener anchors the hidden region in another language by position', () => {
  const eng = [step('S04', ['a', 'b', 'The following is an example of a summary.', 'c'])];
  const spa = [step('S04', ['a', 'b', 'Lo siguiente es un ejemplo de un resumen.', 'c'])];
  assert.equal(markHiddenExamples(spa, eng), 2);
  assert.deepEqual(spa[0].units.map((u) => !!u.hidden), [false, false, true, true]);
});

test('BL7: a step whose unit count differs from the anchor is left unmarked', () => {
  const eng = [step('S04', ['a', 'The following is an example.', 'c'])];
  const spa = [step('S04', ['a', 'Lo siguiente es un ejemplo.'])];
  assert.equal(markHiddenExamples(spa, eng), 0);
});

test('BL7: the Spanish proof pack hides the same units as English', async () => {
  const ids = async (l) => (await json(`../../data/packs/${l}.MRK-1-1-13/guide-units.json`)).steps.flatMap((s) => s.units).filter((u) => u.hidden).map((u) => u.id);
  const eng = await ids('eng');
  assert.equal(eng.length, 13);
  assert.deepEqual(await ids('spa'), eng);
});

test('BL2: pack manifest and catalog carry the autonym', async () => {
  assert.equal((await json('../../data/packs/spa.MRK-1-1-13/manifest.json')).autonym, 'Español');
  assert.equal((await json('../../data/packs/eng.MRK-1-1-13/manifest.json')).autonym, 'English');
  const cat = await json('../../data/catalog/manifest.json');
  assert.ok(cat.entries.every((e) => typeof e.autonym === 'string' && e.autonym.length));
  assert.equal(cat.entries.find((e) => e.packId === 'spa.MRK-1-1-13').autonym, 'Español');
});

test('BL6: the C-05 clip-id pattern accepts next- slots', async () => {
  const c05 = await json('../contracts/c05-narration-manifest.schema.json');
  const re = new RegExp(c05.$defs.clip.properties.id.pattern);
  assert.ok(re.test('next-S02-U005'));
  const plan = await json('../../data/packs/eng.MRK-1-1-13/narration-plan.json');
  const next = plan.entries.filter((e) => e.id.startsWith('next-'));
  assert.ok(next.length > 0 && next.every((e) => re.test(e.id)));
});
