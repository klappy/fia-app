// BL5: the catalog reads term-supplements.json, so eng.MRK-1-1-13 counts the same 21 key terms as its pack (16 by passage + 5 supplement).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { entryTerms, readTermSupplements } from '../src/inventory.mjs';

const read = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), 'utf8'));

test('entryTerms adds supplement ids after passage overlap, Text only, no duplicates', () => {
  const items = [
    { contentId: 'eng-t1-v1', mediaType: 'Text', hit: true },
    { contentId: 'eng-t1-v1-audio', mediaType: 'Audio', hit: true },
    { contentId: 'eng-t2-v1', mediaType: 'Text', hit: false },
    { contentId: 'eng-t3-v1', mediaType: 'Text', hit: false },
  ];
  const got = entryTerms(items, (i) => i.hit, new Set(['eng-t2-v1', 'eng-t1-v1']));
  assert.deepEqual(got.map((i) => i.contentId), ['eng-t1-v1', 'eng-t2-v1']);
  assert.deepEqual(entryTerms(items, (i) => i.hit).map((i) => i.contentId), ['eng-t1-v1']);
});

test('eng.MRK-1-1-13: catalog counts 21 key terms, the same set as the pack', async () => {
  const supplements = await readTermSupplements();
  assert.equal(supplements['eng.MRK-1-1-13'].size, 5);
  const cat = await read('../../data/catalog/eng.json');
  const entry = cat.entries.find((e) => e.packId === 'eng.MRK-1-1-13');
  assert.equal(entry.terms.length, 21);
  for (const id of supplements['eng.MRK-1-1-13']) assert.ok(entry.terms.some((t) => t.engSourceId === id), `catalog missing ${id}`);
  const pack = await read('../../data/packs/eng.MRK-1-1-13/resources.json');
  const packTerms = (pack.terms || []).map((t) => t.engSourceId).sort();
  assert.deepEqual(entry.terms.map((t) => t.engSourceId).sort(), packTerms);
});
