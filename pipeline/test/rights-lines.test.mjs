// BL8 (F3a S15): each pack carries the holder and licence for each source, read from the C-13 rights record — never invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRightsRecords, packRightsLines } from '../src/rights.mjs';

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const lic = (name, url) => JSON.stringify({ copyright: { holder: { name: 'H' } }, licenses: [{ eng: { name, url } }] });

test('packRightsLines: holder and licence come verbatim from the C-13 record', () => {
  const recs = [{ id: 'A@1234567', collection: 'A', revision: '1234567aaa', licenseInfo: lic('CC BY-SA 4.0', 'https://cc/by-sa'), holders: ['Word Collective', 'Mission Mutual'], url: 'https://github.com/BibleAquifer/A' }];
  assert.deepEqual(packRightsLines(['A@1234567'], recs, 'spa'), [{ id: 'A@1234567', collection: 'A', revision: '1234567aaa', holders: ['Word Collective', 'Mission Mutual'], licence: { name: 'CC BY-SA 4.0', url: 'https://cc/by-sa' }, url: 'https://github.com/BibleAquifer/A', discrepancies: [] }]);
});

test('packRightsLines: missing record, placeholder holder, or no licence stays null', () => {
  const recs = [
    { id: 'B@1', collection: 'B', revision: 'b', licenseInfo: '', holders: ['(metadata unreadable)'], url: 'u' },
    { id: 'C@1', collection: 'C', revision: 'c', licenseInfo: JSON.stringify({ title: 'x' }), holders: ['(no holder named in metadata)'], url: 'u' },
  ];
  const [b, c, d] = packRightsLines(['B@1', 'C@1', 'D@1'], recs, 'eng');
  assert.equal(b.holders, null); assert.equal(b.licence, null);
  assert.equal(c.holders, null); assert.equal(c.licence, null);
  assert.deepEqual(d, { id: 'D@1', collection: 'D', revision: null, holders: null, licence: null, url: null, discrepancies: null });
});

test('packRightsLines: prefers the pack language licence entry, else eng', () => {
  const recs = [{ id: 'E@1', collection: 'E', revision: 'e', licenseInfo: JSON.stringify({ licenses: [{ eng: { name: 'en', url: 'e' } }, { spa: { name: 'es', url: 's' } }] }), holders: ['X'], url: 'u' }];
  assert.equal(packRightsLines(['E@1'], recs, 'spa')[0].licence.name, 'es');
  assert.equal(packRightsLines(['E@1'], recs, 'tpi')[0].licence.name, 'en');
});

// TICKET 2026-10-02 rights-lines hardening, item 2: R-312 provenance reaches the pack.
test('packRightsLines: carries the C-13 discrepancies verbatim (R-312)', () => {
  const d = 'holder differs between license_info ("Biblica") and adaptation_notice ("Word Collective")';
  const recs = [{ id: 'M@1', collection: 'M', revision: 'm', licenseInfo: lic('CC BY-SA 4.0', 'u'), holders: ['Biblica', 'Word Collective'], url: 'u', discrepancies: [d] }];
  assert.deepEqual(packRightsLines(['M@1'], recs, 'eng')[0].discrepancies, [d]);
});

// Item 3: robustness — same reading of licenseInfo as the app's parseLicenseInfo (src/settings/rights.ts:26-46).
test('packRightsLines: a plain-string licenseInfo is the licence name, as the app shows it', () => {
  const recs = [{ id: 'P@1', collection: 'P', revision: 'p', licenseInfo: 'CC BY-SA 4.0', holders: ['X'], url: 'u' }];
  assert.deepEqual(packRightsLines(['P@1'], recs, 'eng')[0].licence, { name: 'CC BY-SA 4.0', url: null });
  const scalar = [{ id: 'Q@1', collection: 'Q', revision: 'q', licenseInfo: '"CC0"', holders: ['X'], url: 'u' }];
  assert.deepEqual(packRightsLines(['Q@1'], scalar, 'eng')[0].licence, { name: '"CC0"', url: null });
});

test('packRightsLines: malformed licenses or holders leave the line null instead of throwing', () => {
  const recs = [
    { id: 'R@1', collection: 'R', revision: 'r', licenseInfo: JSON.stringify({ licenses: { eng: { name: 'n', url: 'u' } } }), holders: ['X'], url: 'u' },
    { id: 'S@1', collection: 'S', revision: 's', licenseInfo: lic('n', 'u'), url: 'u' },
    { id: 'T@1', collection: 'T', revision: 't', licenseInfo: JSON.stringify({ licenses: [null, 'x', { eng: 'not-an-object' }] }), holders: 'X', url: 'u' },
  ];
  const [r, s, t] = packRightsLines(['R@1', 'S@1', 'T@1'], recs, 'eng');
  assert.equal(r.licence, null); assert.deepEqual(r.holders, ['X']);
  assert.equal(s.holders, null); assert.deepEqual(s.licence, { name: 'n', url: 'u' });
  assert.equal(t.licence, null); assert.equal(t.holders, null);
});

test('packRightsLines: an empty pack-language entry falls through to eng', () => {
  const recs = [{ id: 'F@1', collection: 'F', revision: 'f', licenseInfo: JSON.stringify({ licenses: [{ spa: {} }, { eng: { name: 'en', url: 'e' } }] }), holders: ['X'], url: 'u' }];
  assert.deepEqual(packRightsLines(['F@1'], recs, 'spa')[0].licence, { name: 'en', url: 'e' });
});

test('packRightsLines: a record without url has url null, the same shape as a missing record', () => {
  const recs = [{ id: 'U@1', collection: 'U', revision: 'u', licenseInfo: '', holders: ['X'] }];
  const line = packRightsLines(['U@1'], recs, 'eng')[0];
  assert.ok(Object.hasOwn(line, 'url')); assert.equal(line.url, null);
  assert.equal(JSON.parse(JSON.stringify(line)).url, null);
});

test('loadRightsRecords: absent or stale records.json fails loudly', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'rights-'));
  try {
    const sources = { fia: { FIAMaps: { commitSha: 'a'.repeat(40) } }, bibles: [{ repo: 'BibleX', commitSha: 'b'.repeat(40) }] };
    const file = path.join(dir, 'records.json');
    await assert.rejects(loadRightsRecords({ file, sources }), /missing/);
    writeFileSync(file, JSON.stringify([{ id: `FIAMaps@${'a'.repeat(7)}` }, { id: `BibleX@${'c'.repeat(7)}` }]));
    await assert.rejects(loadRightsRecords({ file, sources }), /stale.*BibleX@bbbbbbb/s);
    writeFileSync(file, JSON.stringify([{ id: `FIAMaps@${'a'.repeat(7)}` }, { id: `BibleX@${'b'.repeat(7)}` }]));
    assert.equal((await loadRightsRecords({ file, sources })).length, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Item 6: every pack must carry rights.json (no vacuous pass), and each line is checked against the
// C-13 record fields directly — not against packRightsLines' own output.
const records = JSON.parse(readFileSync(path.join(DATA, 'rights/records.json'), 'utf8'));
const packs = readdirSync(path.join(DATA, 'packs')).filter((p) => /^[a-z]{3}\./.test(p));
const PLACEHOLDERS = ['(no holder named in metadata)', '(metadata unreadable)'];
test('every pack: rights.json exists, one line per manifest.rights id, fields equal the C-13 record, listed in the text tier', () => {
  assert.ok(packs.length >= 1, 'at least one pack');
  const byId = new Map(records.map((r) => [r.id, r]));
  for (const p of packs) {
    const file = path.join(DATA, 'packs', p, 'rights.json');
    assert.ok(existsSync(file), `${p}: rights.json missing`);
    const m = JSON.parse(readFileSync(path.join(DATA, 'packs', p, 'manifest.json'), 'utf8'));
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(doc.packId, p);
    assert.deepEqual(doc.sources.map((s) => s.id), m.rights, `${p}: rights.json ids = manifest.rights`);
    for (const line of doc.sources) {
      const rec = byId.get(line.id);
      assert.ok(rec, `${p}: ${line.id} has a C-13 record`);
      assert.equal(line.collection, rec.collection, `${p} ${line.id} collection`);
      assert.equal(line.revision, rec.revision, `${p} ${line.id} revision`);
      assert.equal(line.url, rec.url ?? null, `${p} ${line.id} url`);
      const holders = rec.holders.filter((h) => !PLACEHOLDERS.includes(h));
      assert.deepEqual(line.holders, holders.length ? holders : null, `${p} ${line.id} holders`);
      assert.deepEqual(line.discrepancies, rec.discrepancies ?? [], `${p} ${line.id} discrepancies (R-312)`);
      if (line.licence) {
        if (line.licence.name != null) assert.ok(rec.licenseInfo.includes(JSON.stringify(line.licence.name).slice(1, -1)), `${p} ${line.id} licence name is verbatim in licenseInfo`);
        if (line.licence.url != null) assert.ok(rec.licenseInfo.includes(line.licence.url), `${p} ${line.id} licence url is verbatim in licenseInfo`);
      } else assert.ok(!/"licenses":\[\{/.test(rec.licenseInfo), `${p} ${line.id}: licence null although licenseInfo names one`);
    }
    assert.ok(m.tiers.text.files.some((f) => f.path === `/packs/${p}/rights.json`), `${p}: rights.json listed in tiers.text`);
  }
});
