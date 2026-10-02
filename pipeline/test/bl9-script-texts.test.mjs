// BL9: every next-action / transition script and description text for Mark 1:1-13 is written, borrowed from the PoC where it had one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { applyScriptTexts } from '../src/pericope.mjs';

const json = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), 'utf8'));
const sha = (s) => createHash('sha256').update(Buffer.from(s)).digest('hex');

test('BL9: the eng Mark 1:1-13 plan has no pending-script or pending-text slot', async () => {
  const plan = await json('../../data/packs/eng.MRK-1-1-13/narration-plan.json');
  assert.equal(plan.entries.filter((e) => e.status === 'pending-script' || e.status === 'pending-text').length, 0);
  const next = plan.entries.filter((e) => e.kind === 'next-action');
  const desc = plan.entries.filter((e) => e.kind === 'description');
  assert.equal(next.length, 19);
  assert.equal(desc.length, 8);
  for (const e of next) assert.ok(e.script && e.sourceSha256 === sha(e.script), e.id);
  for (const e of desc) {
    assert.ok(e.text && e.sourceSha256 === sha(e.text), e.id);
    assert.equal(e.generator, 'description');
    assert.equal(e.textProvenance.generator, 'description');
  }
});

test('BL9: applyScriptTexts fills only pending text slots and leaves the rest', () => {
  const entries = [
    { id: 'next-S01-U001', kind: 'next-action', status: 'pending-script', sourceSha256: null },
    { id: 'desc-a1', kind: 'description', generator: 'description', status: 'pending-text', sourceSha256: null },
    { id: 'S01-U001', kind: 'guide-unit', status: 'pending', sourceSha256: 'x' },
    { id: 'next-S01-U002', kind: 'next-action', status: 'pending-script', sourceSha256: null },
  ];
  const n = applyScriptTexts(entries, { 'next-S01-U001': { text: 'Look.', from: 'poc#S01-U001', replacesUnitId: 'S01-U001' }, 'desc-a1': { text: 'A river.', from: 'poc#a1' }, 'S01-U001': { text: 'ignored' } });
  assert.equal(n, 2);
  assert.equal(entries[0].script, 'Look.');
  assert.equal(entries[0].status, 'pending');
  assert.equal(entries[0].replacesUnitId, 'S01-U001');
  assert.equal(entries[1].text, 'A river.');
  assert.equal(entries[1].textProvenance.generator, 'description');
  assert.equal(entries[2].sourceSha256, 'x');
  assert.equal(entries[3].status, 'pending-script');
});
