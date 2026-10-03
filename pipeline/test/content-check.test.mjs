// Content checks per pack (Mark eng+spa ticket item 2): guide steps have units, every verse has Scripture in each
// listed edition (fallbacks badged, never AI), rights lines resolve to C-13 records, AI slots carry ai: true.
// The URL-200 half is bin/check-urls.mjs (network; run outside CI).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { checkAiSlots, checkGuide, checkPack, checkRights, checkScripture, expectedRefs, listPacks, loadPack, loadRightsIds, narrationChars } from '../src/content-check.mjs';
import { DATA_ROOT, loadSources } from '../src/lib.mjs';

const sources = await loadSources();
const rightsIds = loadRightsIds();
const clone = (o) => JSON.parse(JSON.stringify(o));

test('every built pack passes the content checks', () => {
  const ids = listPacks();
  assert.ok(ids.length >= 1, 'no packs built');
  const problems = ids.flatMap((id) => checkPack(loadPack(id), { sources, rightsIds }));
  assert.deepEqual(problems, []);
});

test('all of Mark is built in eng and spa, and the catalog measures every one from its pack', () => {
  for (const lang of ['eng', 'spa']) {
    const detail = JSON.parse(readFileSync(path.join(DATA_ROOT, 'catalog', `${lang}.json`), 'utf8'));
    const mark = detail.entries.filter((e) => e.book === 'MRK');
    assert.equal(mark.length, 68, `${lang}: 68 Mark pericopes in the catalog`);
    const built = new Set(listPacks(undefined, (id) => id.startsWith(`${lang}.MRK-`)));
    for (const e of mark) {
      assert.ok(built.has(e.packId), `${e.packId}: pack built`);
      assert.equal(e.tierBytesSource, 'pack-manifest', `${e.packId}: catalog size measured from the pack`);
    }
  }
});

test('expectedRefs covers cross-chapter ranges with the Mark versification', () => {
  const refs = expectedRefs('MRK-8-31-9-1');
  assert.deepEqual(refs, ['41008031', '41008032', '41008033', '41008034', '41008035', '41008036', '41008037', '41008038', '41009001']);
  assert.equal(expectedRefs('MRK-16-9-20').length, 12);
  assert.equal(expectedRefs('GEN-1-1-2-3'), null);
});

const pack = loadPack('spa.MRK-5-1-20');

test('guide check flags a step with no units', () => {
  const p = clone(pack);
  p.guide.steps[2].units = [];
  assert.ok(checkGuide(p).some((m) => /step S03 has no units/.test(m)));
});

test('scripture check: a missing verse fails, a bridged verse counts, a fallback must be badged and never AI', () => {
  assert.deepEqual(checkScripture(pack, sources), [], 'ASBRT bridges 5:3-4 and 5:8-9; both count');
  const p = clone(pack);
  p.scripture.editions[0].verses = p.scripture.editions[0].verses.filter((v) => v.ref !== '41005010');
  assert.ok(checkScripture(p, sources).some((m) => /RV1909 has no text for 41005010/.test(m)));
  const q = clone(pack);
  Object.assign(q.scripture.editions[1], { status: 'absent-fallback', ai: true });
  const msgs = checkScripture(q, sources);
  assert.ok(msgs.some((m) => /never AI/.test(m)));
  assert.ok(msgs.some((m) => /not badged/.test(m)));
  assert.ok(msgs.some((m) => /ASBRT is not in the pack as source/.test(m)));
});

test('rights check flags a line with no C-13 record and a source with no line', () => {
  const p = clone(pack);
  p.rights.sources[0].id = 'FIATranslationGuide@0000000';
  p.rights.sources = p.rights.sources.filter((s) => s.collection !== 'FIAMaps');
  const msgs = checkRights(p, rightsIds);
  assert.ok(msgs.some((m) => /FIATranslationGuide@0000000 is not in data\/rights\/records.json/.test(m)));
  assert.ok(msgs.some((m) => /source FIAMaps has no rights line/.test(m)));
});

test('AI slot check flags an absent generator slot or a generated clip without ai: true', () => {
  const p = clone(pack);
  p.resources.images[0].description.ai = false;
  p['narration-plan'].entries[0].ai = false;
  const msgs = checkAiSlots(p);
  assert.ok(msgs.some((m) => /absent description slot without ai: true/.test(m)));
  assert.ok(msgs.some((m) => /generated without ai: true/.test(m)));
});

test('narration characters resolve slot texts by sha256 and skip source recordings', () => {
  const c = narrationChars(pack);
  assert.equal(c.sized + c.unsized, c.slots);
  assert.ok(c.byKind['guide-unit'] > 0 && c.byKind.scripture > 0);
  assert.ok(c.uniqueChars <= c.clipChars);
});
