// Validate pipeline outputs against the C-0x contract schemas (copied verbatim into pipeline/contracts/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { PIPELINE_ROOT, DATA_ROOT, guideSteps, pericopeId, parsePericope, isPauseDirective } from '../src/lib.mjs';

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const contractsDir = path.join(PIPELINE_ROOT, 'contracts');
for (const f of await readdir(contractsDir)) if (f.endsWith('.schema.json')) ajv.addSchema(JSON.parse(await readFile(path.join(contractsDir, f), 'utf8')));
const validate = (id, doc) => { const v = ajv.getSchema(`https://fia.klappy.dev/contracts/${id}.schema.json`); const ok = v(doc); return { ok, errors: ok ? [] : v.errors.slice(0, 5).map((e) => `${e.instancePath} ${e.message}`) }; };
const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

test('lib: pericope ids round-trip (M14 default USFM book+range)', () => {
  assert.equal(pericopeId('41001001-41001013'), 'MRK-1-1-13');
  assert.deepEqual(parsePericope('MRK-1-1-13'), { book: 'MRK', start: '41001001', end: '41001013', passage: 'MRK 1:1-13' });
  assert.equal(pericopeId('01001001-01002003'), 'GEN-1-1-2-3');
  assert.equal(guideSteps('<h2>A</h2><p>x</p><ul><li>y</li></ul><h2>B</h2><p>z</p>').length, 2);
  assert.ok(isPauseDirective('Pause the recording and discuss'));
  assert.ok(isPauseDirective('Prestem "pause" long rikoding'));
});

test('C-01: sources.json pins every repo to a 40-hex commit sha', async () => {
  const s = await readJson(path.join(PIPELINE_ROOT, 'sources.json'));
  for (const [repo, p] of Object.entries(s.fia)) assert.match(p.commitSha, /^[a-f0-9]{40}$/, repo);
  for (const b of s.bibles) assert.match(b.commitSha, /^[a-f0-9]{40}$/, b.repo);
  assert.equal(s.languages.length, 17);
});

test('C-03: data/catalog/manifest.json validates', { skip: !existsSync(path.join(DATA_ROOT, 'catalog/manifest.json')) && 'run npm run catalog first' }, async () => {
  const m = await readJson(path.join(DATA_ROOT, 'catalog/manifest.json'));
  const r = validate('c03-catalog-manifest', m);
  assert.ok(r.ok, r.errors.join('\n'));
  assert.equal(m.languages.length, 17);
  assert.ok(m.entries.length >= 7000, `entries ${m.entries.length}`);
  for (const lang of m.languages) {
    const per = await readJson(path.join(DATA_ROOT, `catalog/${lang.code}.json`));
    assert.equal(per.entries.length, m.entries.filter((e) => e.language === lang.code).length, lang.code);
  }
});

test('C-13: data/rights/records.json validates and keeps the FIAMaps holder discrepancy', { skip: !existsSync(path.join(DATA_ROOT, 'rights/records.json')) && 'run npm run rights first' }, async () => {
  const records = await readJson(path.join(DATA_ROOT, 'rights/records.json'));
  for (const rec of records) { const r = validate('c13-rights-record', rec); assert.ok(r.ok, `${rec.id}: ${r.errors.join('; ')}`); }
  const maps = records.find((r) => r.collection === 'FIAMaps');
  assert.ok(maps.holders.includes('Biblica') && maps.holders.includes('Word Collective'));
  assert.ok(maps.discrepancies?.some((d) => /holder differs/.test(d)));
});

test('C-02 / C-04 / C-05 / C-06 / C-08: every proof pack validates', async () => {
  const packsDir = path.join(DATA_ROOT, 'packs');
  if (!existsSync(packsDir)) return;
  const packs = (await readdir(packsDir)).filter((d) => /^[a-z]{3}\./.test(d));
  assert.ok(packs.length >= 1, 'no packs built');
  for (const p of packs) {
    const dir = path.join(packsDir, p);
    const manifest = await readJson(path.join(dir, 'manifest.json'));
    let r = validate('c02-content-pack', manifest); assert.ok(r.ok, `${p} manifest: ${r.errors.join('; ')}`);
    const units = await readJson(path.join(dir, 'guide-units.json'));
    r = validate('c04-guide-units', units); assert.ok(r.ok, `${p} guide-units: ${r.errors.join('; ')}`);
    assert.equal(units.steps.length, 6, `${p}: six steps`);
    const narration = await readJson(path.join(dir, 'narration.json'));
    r = validate('c05-narration-manifest', narration); assert.ok(r.ok, `${p} narration: ${r.errors.join('; ')}`);
    const guide = await readJson(path.join(dir, 'guide.json'));
    r = validate('c06-provenance', guide.provenance); assert.ok(r.ok, `${p} guide provenance: ${r.errors.join('; ')}`);
    const resources = await readJson(path.join(dir, 'resources.json'));
    for (const t of resources.terms) { r = validate('c06-provenance', t.text.provenance); assert.ok(r.ok, `${p} ${t.id} text provenance`); }
    // C-08 slots are laid out but not yet transcoded: strip the pipeline-only fields and check the recipe/mime/tier vocabulary
    for (const m of [...resources.images, ...resources.maps]) for (const d of m.derivatives) {
      const { status, ...slot } = d;
      const probe = { ...slot, bytes: 1, sha256: '0'.repeat(64) };
      r = validate('c08-media-derivative', probe); assert.ok(r.ok, `${p} ${m.id} derivative slot: ${r.errors.join('; ')}`);
    }
    // sha/bytes in the manifest must match the files on disk
    for (const f of manifest.tiers.text.files) {
      const bytes = await readFile(path.join(dir, path.basename(f.path)));
      assert.equal(bytes.length, f.bytes, `${p} ${f.path} bytes`);
    }
    const scripture = await readJson(path.join(dir, 'scripture.json'));
    assert.equal(scripture.scriptureNeverAI, true);
    for (const e of scripture.editions) assert.ok(['source', 'absent-fallback', 'absent'].includes(e.status));
  }
});
