// V1-4: descriptions are short, say what the visual shows and why it matters here, and follow the M9 default
// (shared base per visual + one passage line per occurrence). Model: fia-app-cookbook product/DESCRIPTION-MODEL-V14.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { applyScriptTexts, composeDescriptions } from '../src/pericope.mjs';

const json = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), 'utf8'));
const sha = (s) => createHash('sha256').update(Buffer.from(s)).digest('hex');
const words = (s) => s.trim().split(/\s+/).length;

// Golden set: the reviewed sha256 of each voiced description (base + passage line). Every other hash in this file is
// computed from script-texts.json, so a text edit plus a rebuild would still pass; this pin makes an unreviewed edit fail.
// Changing a description means re-reviewing it against the visual and the BSB text, then updating its hash here.
const REVIEWED_SHA256 = {
  'desc-a112': '44b3fd9ec9ab3bb9929d6cfa670b722fc578a08e38a3d4a6efa92c8147522ce8',
  'desc-a203': '731fbaecd1e4b237bed4fa78fce2b5df530bf78b7a24a7a17e42f8eee3c9568d',
  'desc-a204': '72dc7d4f3efb1a16a3fc9367fd5c57de47192fbed357931b6fdcfe40c5e9b7b5',
  'desc-a111': 'c628084301484541a3d2a880b28d7aa8b3d239796b2bc0c0d62c3895071f71f7',
  'desc-c201': '1f8ad9ec6687fc8c665eab1a310766397c278863dd37ff02735adec376647bbf',
  'desc-c202': '4fd5aa4e4eec9851684b54bd2bb3839c0d673985c50b50541f26da8ac415cfc9',
  'desc-c197': 'd8efdd0de475e8f204b00bf329dcf98b9c74edeec2ea4e7d0734be4e444899ac',
  'desc-c168': 'ba0a088ab59666c3bcb62824aff2e4fb12e8d1398da7949145ecb221710cae35',
};

test('V1-4: every eng Mark 1:1-13 description is a shared base plus a passage line, within the length limits', async () => {
  const doc = await json('../script-texts.json');
  const bases = doc.descriptionBases.eng;
  const plan = await json('../../data/packs/eng.MRK-1-1-13/narration-plan.json');
  const desc = plan.entries.filter((e) => e.kind === 'description');
  assert.equal(desc.length, 8);
  assert.deepEqual(desc.map((e) => e.id).sort(), Object.keys(REVIEWED_SHA256).sort());
  for (const e of desc) {
    const slot = doc.packs['eng.MRK-1-1-13'][e.id];
    const base = bases[e.resourceId];
    assert.equal(slot.base, e.resourceId, e.id);
    assert.ok(words(base.text) <= 40, `${e.id} base ${words(base.text)} words`);
    assert.ok(words(slot.passageLine) <= 20, `${e.id} line ${words(slot.passageLine)} words`);
    assert.ok(words(e.text) <= 60, `${e.id} ${words(e.text)} words (~25 s; R-509 target <= 45 s)`);
    assert.equal(e.text, `${base.text} ${slot.passageLine}`);
    assert.ok(e.text.startsWith(`${(await json('../../data/packs/eng.MRK-1-1-13/resources.json'))[e.resourceKind === 'map' ? 'maps' : 'images'].find((m) => m.id === e.resourceId).title}.`), `${e.id} opens with the visual's title`);
    assert.match(slot.passageLine, /verse|Mark 1|this passage/i, `${e.id} line ties to the passage`);
    assert.deepEqual(e.descriptionBase, { resourceId: e.resourceId, textSha256: sha(base.text) });
    assert.equal(e.sourceSha256, sha(e.text));
    assert.equal(e.sourceSha256, REVIEWED_SHA256[e.id], `${e.id}: description text changed from the reviewed version`);
    assert.equal(e.generator, 'description');
    assert.equal(e.textProvenance.generator, 'description');
  }
});

test('V1-4: the same base in two passages narrates differently (R-509 accept)', () => {
  const bases = { m1: { text: 'A map. It shows a river.' } };
  const texts = composeDescriptions({ 'desc-m1': { base: 'm1', passageLine: 'In verse 5 people come to this river.' } }, bases);
  const other = composeDescriptions({ 'desc-m1': { base: 'm1', passageLine: 'In chapter 10 Jesus crosses this river.' } }, bases);
  assert.notEqual(texts['desc-m1'].text, other['desc-m1'].text);
  assert.deepEqual(texts['desc-m1'].descriptionBase, other['desc-m1'].descriptionBase);
  const entries = [{ id: 'desc-m1', kind: 'description', resourceId: 'm1', generator: 'description', status: 'pending-text', sourceSha256: null }];
  applyScriptTexts(entries, texts);
  assert.equal(entries[0].text, 'A map. It shows a river. In verse 5 people come to this river.');
  assert.equal(entries[0].descriptionBase.resourceId, 'm1');
  assert.throws(() => composeDescriptions({ 'desc-missing': { base: 'missing', passageLine: 'y' } }, bases), /missing/);
});

test('V1-4: a description slot must use its own visual as base (base === resourceId)', () => {
  const bases = { m1: { text: 'A map. It shows a river.' }, m2: { text: 'A map. It shows a lake.' } };
  assert.throws(() => composeDescriptions({ 'desc-m1': { base: 'm2', passageLine: 'In verse 5 people come to this river.' } }, bases), /desc-m1: description base m2 is not this slot's resource/);
  assert.doesNotThrow(() => composeDescriptions({ 'desc-m2': { base: 'm2', passageLine: 'In verse 5 people come to this lake.' } }, bases));
  const texts = composeDescriptions({ 'desc-m1': { base: 'm1', passageLine: 'In verse 5 people come to this river.' } }, bases);
  const entries = [{ id: 'desc-m1', kind: 'description', resourceId: 'm2', generator: 'description', status: 'pending-text', sourceSha256: null }];
  assert.throws(() => applyScriptTexts(entries, texts), /not the slot's resource m2/);
});
