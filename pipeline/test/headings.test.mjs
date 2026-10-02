// BL4a heading gather (cookbook work/active/2026-10-02-fia-pericope-subtitles TICKET.md § 3, § 8 row BL4a).
// Fixtures are whole-chapter excerpts of Mark (test/fixtures/usfm/SOURCES.json); no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { NEVER_READ, PERICOPES, fetchSource, normalizeHeading, parseHeadings, placeHeadings, rungCoverage, unzipEntries } from '../src/headings.mjs';

const fx = (name) => readFileSync(new URL(`./fixtures/usfm/MRK-${name}.usfm`, import.meta.url), 'utf8');
const ENG = { BSB: [], OEB: [], TCENT: [], T4T: [], F35: ['f35-date-tail'], PEV: [] };
const eng = Object.entries(ENG).flatMap(([id, strip]) => placeHeadings(id, fx(id), { strip }).placed);
const inP = (list, id) => list.filter((h) => h.pericope === id);

test('68 MARK-CENSUS pericopes, 6:6 split into a/b parts', () => {
  assert.equal(PERICOPES.length, 68);
  assert.deepEqual(PERICOPES.find((p) => p.id === 'MRK-6-6-13').start, [6, 6, 'b']);
});

test('eng MRK-1-1-13 = 11 inputs from 5 sources (BSB 2, TCENT 3, PEV 3, T4T 2, OEB 1)', () => {
  const hs = inP(eng, 'MRK-1-1-13');
  assert.equal(hs.length, 11);
  const by = {}; for (const h of hs) by[h.source] = (by[h.source] || 0) + 1;
  assert.deepEqual(by, { BSB: 2, OEB: 1, TCENT: 3, T4T: 2, PEV: 3 });
});

test('forward rule: BSB "The Transfiguration" (9:1–9:13) runs past 9:1 and moves into MRK-9-2-13', () => {
  const h = inP(eng, 'MRK-9-2-13').find((x) => x.source === 'BSB' && x.text === 'The Transfiguration');
  assert.ok(h); assert.equal(h.verse, '9:1'); assert.equal(h.last, '9:13'); assert.equal(h.past, false);
  assert.ok(!inP(eng, 'MRK-8-31-9-1').some((x) => x.text === 'The Transfiguration'));
});

test('span-aware forward rule (A1): a heading covering only the last verse stays', () => {
  const fra = placeHeadings('francl', fx('francl')).placed;
  const t = fra.find((h) => h.text === 'La tentation');
  assert.equal(t.pericope, 'MRK-1-1-13'); assert.equal(t.last, '1:13');
  const spa = placeHeadings('spapddpt', fx('spapddpt')).placed;
  const e = spa.find((h) => h.text === 'Entrada de Jesús al Santuario');
  assert.equal(e.pericope, 'MRK-11-1-11'); assert.equal(e.last, '11:11');
  // The original rule (forward everything on the last verse) misfiled both.
  assert.equal(placeHeadings('francl', fx('francl'), { forwardAll: true }).placed.find((h) => h.text === 'La tentation').pericope, 'MRK-1-14-20');
});

test('overrun: BSB 5:21 runs to 5:43 and is `past` in MRK-5-21-34', () => {
  const h = inP(eng, 'MRK-5-21-34').find((x) => x.source === 'BSB' && x.verse === '5:21');
  assert.ok(h); assert.equal(h.last, '5:43'); assert.equal(h.past, true);
});

test('MRK-7-9-13 has no English heading (passage path)', () => {
  assert.equal(inP(eng, 'MRK-7-9-13').length, 0);
});

test('b-part anchor: a heading followed by text of the current verse anchors to its b-part', () => {
  const [h] = parseHeadings('\\c 6\n\\p \\v 5 He could do no miracle there.\n\\v 6 He marveled at their unbelief.\n\\s1 Sending the Twelve\n\\p Then Jesus went around teaching.\n\\v 7 He called the Twelve.\n');
  assert.deepEqual(h.anchor, [6, 6, 'b']);
  const { placed } = placeHeadings('X', '\\c 6\n\\p \\v 5 a\n\\v 6 b\n\\s1 Sending the Twelve\n\\p c\n\\v 7 d\n\\v 13 e\n\\s1 Next\n\\p \\v 14 f\n');
  assert.equal(placed[0].pericope, 'MRK-6-6-13'); assert.equal(placed[0].last, '6:13');
});

test('verse bridges count as their last verse (A2)', () => {
  const usfm = '\\c 5\n\\s1 Healed\n\\p \\v 35 a\n\\v 42-43 b\n\\c 6\n\\s1 Next\n\\p \\v 1 c\n';
  assert.equal(placeHeadings('X', usfm).placed[0].last, '5:43');
});

test('normalize: \\ms, references and markup dropped; F35 dates, portft TEMA:, OBBR // stripped (A5); NFC; dedup', () => {
  const usfm = '\\c 1\n\\ms BOOK ONE\n\\s1 Mark 1:1-8\n\\s1 John \\w the|x\\w* Baptist\\f + \\ft note\\f*\n\\r (Matt 3:1)\n\\s1 John the Baptist\n\\p \\v 1 a\n';
  const { placed } = placeHeadings('X', usfm);
  assert.deepEqual(placed.map((h) => h.text), ['John the Baptist']);
  assert.equal(normalizeHeading('Jesus is baptized—Sunday, 03/31/30 AD', ['f35-date-tail']), 'Jesus is baptized');
  assert.equal(normalizeHeading('TEMA: Deus mostrou', ['tema-label']), 'Deus mostrou');
  assert.equal(normalizeHeading('Jon Baptaes // i prij', ['line-break-slashes']), 'Jon Baptaes i prij');
  assert.equal(normalizeHeading('José'), 'José');
});

test('rung coverage: 1 with headings, 1p English without, 2 other languages without', () => {
  const byLang = { eng: { A: [1], B: [] }, spa: { A: [], B: [1] } };
  const c = rungCoverage(byLang, { eng: ['A', 'B'], spa: ['A', 'B'], rus: ['A'] });
  assert.deepEqual(c.totals, { 1: 2, '1p': 1, 2: 2 });
  assert.deepEqual(c.perLang.rus, { withHeadings: 0, entries: 1 });
});

test('never-read sources are refused before any fetch', async () => {
  for (const id of ['TBI', 'CUV-T', 'TPI2008', 'VanDyck', 'LSG1910']) assert.ok(NEVER_READ.has(id));
  await assert.rejects(fetchSource({ id: 'TBI', kind: 'aquifer' }, {}), /never read/);
});

test('registry: every USE source carries the BL4a fields; one grounding per language', () => {
  const reg = JSON.parse(readFileSync(new URL('../heading-sources.json', import.meta.url), 'utf8'));
  for (const s of reg.sources) {
    for (const k of ['id', 'lang', 'url', 'licence', 'holder', 'revisionKind', 'freshness', 'rewordOk']) assert.ok(k in s, `${s.id}: ${k}`);
    assert.ok(!NEVER_READ.has(s.id) && !NEVER_READ.has(s.repo), s.id);
    if (s.revisionKind === 'git') assert.match(s.freshness.commit, /^[0-9a-f]{40}$/); else assert.match(s.freshness.sha256, /^[0-9a-f]{64}$/);
  }
  assert.deepEqual(Object.keys(reg.grounding).sort(), ['apd', 'arb', 'bis', 'eng', 'fas', 'fra', 'hin', 'ind', 'nep', 'por', 'rus', 'spa', 'swh', 'tpi', 'zhs', 'zht']);
  const aquiferFirst = reg.sources.findIndex((s) => s.kind !== 'aquifer');
  assert.ok(reg.sources.slice(aquiferFirst).every((s) => s.kind !== 'aquifer'), 'Aquifer pins first');
});

test('zip reader: deflated entry round-trips', () => {
  const data = Buffer.from('\\id MRK\n\\c 1\n'); const comp = deflateRawSync(data); const name = Buffer.from('47-MRKx.usfm');
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(0, 42);
  const cdOff = 30 + name.length + comp.length;
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(46 + name.length, 12); eocd.writeUInt32LE(cdOff, 16);
  const zip = Buffer.concat([local, name, comp, cd, name, eocd]);
  assert.equal(unzipEntries(zip).get('47-MRKx.usfm')().toString(), data.toString());
});
