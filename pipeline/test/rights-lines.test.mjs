// BL8 (F3a S15): each pack carries the holder and licence for each source, read from the C-13 rights record — never invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packRightsLines } from '../src/rights.mjs';

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const lic = (name, url) => JSON.stringify({ copyright: { holder: { name: 'H' } }, licenses: [{ eng: { name, url } }] });

test('packRightsLines: holder and licence come verbatim from the C-13 record', () => {
  const recs = [{ id: 'A@1234567', collection: 'A', revision: '1234567aaa', licenseInfo: lic('CC BY-SA 4.0', 'https://cc/by-sa'), holders: ['Word Collective', 'Mission Mutual'], url: 'https://github.com/BibleAquifer/A' }];
  assert.deepEqual(packRightsLines(['A@1234567'], recs, 'spa'), [{ id: 'A@1234567', collection: 'A', revision: '1234567aaa', holders: ['Word Collective', 'Mission Mutual'], licence: { name: 'CC BY-SA 4.0', url: 'https://cc/by-sa' }, url: 'https://github.com/BibleAquifer/A' }]);
});

test('packRightsLines: missing record, placeholder holder, or no licence stays null', () => {
  const recs = [
    { id: 'B@1', collection: 'B', revision: 'b', licenseInfo: '', holders: ['(metadata unreadable)'], url: 'u' },
    { id: 'C@1', collection: 'C', revision: 'c', licenseInfo: JSON.stringify({ title: 'x' }), holders: ['(no holder named in metadata)'], url: 'u' },
  ];
  const [b, c, d] = packRightsLines(['B@1', 'C@1', 'D@1'], recs, 'eng');
  assert.equal(b.holders, null); assert.equal(b.licence, null);
  assert.equal(c.holders, null); assert.equal(c.licence, null);
  assert.deepEqual(d, { id: 'D@1', collection: 'D', revision: null, holders: null, licence: null, url: null });
});

test('packRightsLines: prefers the pack language licence entry, else eng', () => {
  const recs = [{ id: 'E@1', collection: 'E', revision: 'e', licenseInfo: JSON.stringify({ licenses: [{ eng: { name: 'en', url: 'e' } }, { spa: { name: 'es', url: 's' } }] }), holders: ['X'], url: 'u' }];
  assert.equal(packRightsLines(['E@1'], recs, 'spa')[0].licence.name, 'es');
  assert.equal(packRightsLines(['E@1'], recs, 'tpi')[0].licence.name, 'en');
});

const records = JSON.parse(readFileSync(path.join(DATA, 'rights/records.json'), 'utf8'));
const packs = readdirSync(path.join(DATA, 'packs')).filter((p) => existsSync(path.join(DATA, 'packs', p, 'rights.json')));
test('every pack with rights.json: one line per manifest.rights id, matching the C-13 record, listed in the text tier', () => {
  assert.ok(packs.length >= 1, 'at least one pack carries rights.json');
  for (const p of packs) {
    const m = JSON.parse(readFileSync(path.join(DATA, 'packs', p, 'manifest.json'), 'utf8'));
    const doc = JSON.parse(readFileSync(path.join(DATA, 'packs', p, 'rights.json'), 'utf8'));
    assert.equal(doc.packId, p);
    assert.deepEqual(doc.sources.map((s) => s.id), m.rights, `${p}: rights.json ids = manifest.rights`);
    assert.deepEqual(doc.sources, packRightsLines(m.rights, records, m.language), `${p}: lines match data/rights/records.json`);
    assert.ok(m.tiers.text.files.some((f) => f.path === `/packs/${p}/rights.json`), `${p}: rights.json listed in tiers.text`);
  }
});
