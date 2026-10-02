// BL4b (cookbook work/active/2026-10-02-fia-pericope-subtitles § 5): C-03 / C-06 / C-10 / C-13 1.1.0 are additive.
// Old records still validate; a subtitle entry and a sha256-kind C-13 record validate; enums hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { PIPELINE_ROOT } from '../src/lib.mjs';

const APP_ROOT = path.join(PIPELINE_ROOT, '..');
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const appDir = path.join(APP_ROOT, 'contracts');
for (const f of await readdir(appDir)) if (f.endsWith('.schema.json')) ajv.addSchema(JSON.parse(await readFile(path.join(appDir, f), 'utf8')));
const schema = async (n) => JSON.parse(await readFile(path.join(appDir, `${n}.schema.json`), 'utf8'));
const ok = (id, doc) => ajv.getSchema(`https://fia.klappy.dev/contracts/${id}.schema.json`)(doc);
const clone = (x) => JSON.parse(JSON.stringify(x));
const H = (c) => c.repeat(64);

test('BL4b: the four contracts are 1.1.0 and pipeline mirrors are byte-equal', async () => {
  for (const n of ['c03-catalog-manifest', 'c06-provenance', 'c10-settings', 'c13-rights-record', 'c13-pack-rights']) assert.equal((await schema(n)).version, '1.1.0', n);
  for (const f of await readdir(path.join(PIPELINE_ROOT, 'contracts'))) {
    if (!f.endsWith('.schema.json')) continue;
    assert.equal(await readFile(path.join(PIPELINE_ROOT, 'contracts', f), 'utf8'), await readFile(path.join(appDir, f), 'utf8'), f);
  }
});

const entryWith = async (subtitle) => {
  const m = clone((await schema('c03-catalog-manifest')).examples[0]);
  m.entries[0].ref = { book: 'MRK', start: '1:1', end: '1:13' };
  if (subtitle) m.entries[0].subtitle = subtitle;
  return m;
};
const eng = {
  text: 'John the Baptist prepares the way', lang: 'eng', ai: true, generator: 'subtitle', basis: 'headings',
  model: 'pinned-model', promptSha256: H('a'), key: H('b'),
  licence: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  inputs: [
    { source: 'BereanStandardBible@87858d1', verse: '1:1', last: '1:11', text: 'The Mission of John the Baptist' },
    { source: 'BereanStandardBible@87858d1', verse: '1:1-13', kind: 'passage', textSha256: H('c') },
  ],
  provenance: { status: 'generated', generator: 'subtitle', generatedFrom: `subtitle@${H('b')}:eng.MRK-1-1-13` },
  review: { status: 'pass', receiptSha256: H('d') },
};
const rus = {
  ...clone(eng), text: 'Иоанн Креститель готовит путь', lang: 'rus', generator: 'translation', basis: undefined, key: H('e'),
  inputs: [{ source: 'Synodal@0000000', verse: '1:1-13', kind: 'passage', textSha256: H('f') }],
  translatedFrom: { lang: 'eng', key: H('b'), text: eng.text },
  provenance: { status: 'generated', generator: 'translation', generatedFrom: `subtitle@${H('b')}:eng.MRK-1-1-13` },
};
delete rus.basis;
delete rus.review;

test('C-03 1.1.0: 1.0.0 entry (no ref/subtitle) still validates; rung-1 and rung-2 subtitles validate', async () => {
  assert.ok(ok('c03-catalog-manifest', clone((await schema('c03-catalog-manifest')).examples[0])));
  assert.ok(ok('c03-catalog-manifest', await entryWith(null)));
  assert.ok(ok('c03-catalog-manifest', await entryWith(eng)));
  assert.ok(ok('c03-catalog-manifest', await entryWith(rus)));
  assert.ok(ok('c03-catalog-manifest', await entryWith({ ...eng, licence: null })), 'null licence when every input is CC0/PD');
});

test('C-03 1.1.0: subtitle rules reject bad shapes', async () => {
  const bad = [
    { ...eng, ai: false },
    { ...eng, generator: 'narration' },
    { ...eng, basis: 'guess' },
    { ...eng, licence: { name: 'CC BY-NC 4.0', url: 'https://creativecommons.org/licenses/by-nc/4.0/' } },
    { ...eng, inputs: [{ source: 'BSB@87858d1', verse: '1:1-13', kind: 'passage' }] },
    { ...eng, inputs: [{ source: 'BSB@87858d1', verse: '1:1' }] },
    { ...eng, promptSha256: 'abc' },
    { ...rus, translatedFrom: undefined },
    { ...eng, translatedFrom: rus.translatedFrom },
    (({ basis, ...r }) => r)(eng),
  ];
  for (const [i, s] of bad.entries()) assert.equal(ok('c03-catalog-manifest', await entryWith(JSON.parse(JSON.stringify(s)))), false, `bad[${i}]`);
});

test('C-06 1.1.0: generator gains subtitle; unknown generators still fail', () => {
  assert.ok(ok('c06-provenance', eng.provenance));
  assert.equal(ok('c06-provenance', { ...eng.provenance, generator: 'summary' }), false);
  assert.ok(ok('c06-provenance', { status: 'generated', generatedFrom: 'FIATranslationGuide@5d6d59a22caa8f8539c5ff6a3e1ec74c4cfa5c6d:eng/mark-1-1-13#S01-U001', generator: 'narration' }));
});

test('C-10 1.1.0: subtitleMode optional, default off, enum generated|off', async () => {
  const s = await schema('c10-settings');
  assert.equal(s.properties.subtitleMode.default, 'off');
  const base = clone(s.examples[0]);
  assert.equal('subtitleMode' in base, false);
  assert.ok(ok('c10-settings', base), '1.0.0 settings without subtitleMode still validate');
  for (const v of ['generated', 'off']) assert.ok(ok('c10-settings', { ...base, subtitleMode: v }), v);
  for (const v of ['on', true, '']) assert.equal(ok('c10-settings', { ...base, subtitleMode: v }), false, String(v));
});

test('C-13 1.1.0: git records unchanged; sha256-kind records take 64 hex; pack lines mirror', async () => {
  const s = await schema('c13-rights-record');
  const git = clone(s.examples[0]);
  const sha = clone(s.examples.find((e) => e.revisionKind === 'sha256'));
  assert.ok(ok('c13-rights-record', git));
  assert.ok(ok('c13-rights-record', { ...git, revisionKind: 'git' }));
  assert.ok(ok('c13-rights-record', sha));
  assert.equal(ok('c13-rights-record', { ...git, revision: H('a') }), false, 'absent kind = git → 40 hex only');
  assert.equal(ok('c13-rights-record', { ...sha, revision: 'a'.repeat(40) }), false, 'sha256 kind → 64 hex only');
  assert.equal(ok('c13-rights-record', { ...git, revisionKind: 'etag' }), false, 'ETag is never identity');
  assert.equal(ok('c13-rights-record', { ...git, licenceUrl: 'not a uri' }), false);
  const pack = clone((await schema('c13-pack-rights')).examples[0]);
  assert.ok(ok('c13-pack-rights', pack));
  pack.sources.push({ id: sha.id, collection: sha.collection, revisionKind: 'sha256', revision: sha.revision, holders: sha.holders, licence: null, url: sha.url, discrepancies: [] });
  assert.ok(ok('c13-pack-rights', pack));
  pack.sources[pack.sources.length - 1].revisionKind = 'etag';
  assert.equal(ok('c13-pack-rights', pack), false);
});

// BL4 hardening (rev42-1520 non-blocking items): the tightened rules reject; old shapes still validate.
test('C-13 pack rights: revisionKind ties revision length as the record does; licenceUrl is a uri', async () => {
  const pack = clone((await schema('c13-pack-rights')).examples[0]);
  const line = clone(pack.sources[0]);
  const withLine = (l) => ({ ...pack, sources: [l] });
  assert.ok(ok('c13-pack-rights', withLine(line)), 'git line, no kind, 40 hex');
  assert.ok(ok('c13-pack-rights', withLine({ ...line, revisionKind: 'git' })));
  assert.ok(ok('c13-pack-rights', withLine({ ...line, revisionKind: 'sha256', revision: H('a') })));
  assert.ok(ok('c13-pack-rights', withLine({ ...line, revisionKind: 'sha256', revision: null })), 'missing record stays null');
  assert.ok(ok('c13-pack-rights', withLine({ ...line, licenceUrl: 'https://creativecommons.org/licenses/by/4.0/' })));
  assert.equal(ok('c13-pack-rights', withLine({ ...line, revision: H('a') })), false, 'absent kind = git → 40 hex only');
  assert.equal(ok('c13-pack-rights', withLine({ ...line, revisionKind: 'git', revision: H('a') })), false, 'git → 40 hex only');
  assert.equal(ok('c13-pack-rights', withLine({ ...line, revisionKind: 'sha256' })), false, 'sha256 → 64 hex only');
  assert.equal(ok('c13-pack-rights', withLine({ ...line, licenceUrl: 'not a uri' })), false);
});

test('C-06 1.1.0: a sha256-kind source takes a 64-hex revision; git stays 40 hex', () => {
  const src = { status: 'source', collection: 'FIAMaps', revision: '4bc9bb9f1d9082e5d71a047a35bf8e608f473602' };
  assert.ok(ok('c06-provenance', src), 'old git source record');
  assert.ok(ok('c06-provenance', { ...src, revisionKind: 'git' }));
  assert.ok(ok('c06-provenance', { status: 'source', collection: 'engtcent', revisionKind: 'sha256', revision: H('1') }));
  assert.equal(ok('c06-provenance', { ...src, revision: H('1') }), false, 'absent kind = git → 40 hex only');
  assert.equal(ok('c06-provenance', { ...src, revisionKind: 'sha256' }), false, 'sha256 → 64 hex only');
  assert.equal(ok('c06-provenance', { ...src, revisionKind: 'etag' }), false, 'ETag is never identity');
});

test('C-03 1.1.0: a passage input never stores the text; subtitle.inputs is never empty', async () => {
  const passage = { ...eng.inputs[1], text: 'In the beginning of the good news' };
  assert.equal(ok('c03-catalog-manifest', await entryWith(clone({ ...eng, inputs: [eng.inputs[0], passage] }))), false, 'passage + text');
  assert.equal(ok('c03-catalog-manifest', await entryWith(clone({ ...eng, inputs: [] }))), false, 'empty inputs');
  assert.equal(ok('c03-catalog-manifest', await entryWith(clone({ ...rus, inputs: [] }))), false, 'empty inputs (rung 2)');
  assert.ok(ok('c03-catalog-manifest', await entryWith(clone({ ...eng, inputs: [eng.inputs[0]] }))), 'one heading input');
});
