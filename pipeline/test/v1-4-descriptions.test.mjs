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

test('V1-4: every eng Mark 1:1-13 description is a shared base plus a passage line, within the length limits', async () => {
  const doc = await json('../script-texts.json');
  const bases = doc.descriptionBases.eng;
  const plan = await json('../../data/packs/eng.MRK-1-1-13/narration-plan.json');
  const desc = plan.entries.filter((e) => e.kind === 'description');
  assert.equal(desc.length, 8);
  for (const e of desc) {
    const slot = doc.packs['eng.MRK-1-1-13'][e.id];
    const base = bases[e.resourceId];
    assert.equal(slot.base, e.resourceId, e.id);
    assert.ok(words(base.text) <= 50, `${e.id} base ${words(base.text)} words`);
    assert.ok(words(slot.passageLine) <= 25, `${e.id} line ${words(slot.passageLine)} words`);
    assert.ok(words(e.text) <= 75, `${e.id} ${words(e.text)} words (~30 s; R-509 target <= 45 s)`);
    assert.equal(e.text, `${base.text} ${slot.passageLine}`);
    assert.ok(e.text.startsWith(`${(await json('../../data/packs/eng.MRK-1-1-13/resources.json'))[e.resourceKind === 'map' ? 'maps' : 'images'].find((m) => m.id === e.resourceId).title}.`), `${e.id} opens with the visual's title`);
    assert.match(slot.passageLine, /verse|Mark 1|this passage/i, `${e.id} line ties to the passage`);
    assert.deepEqual(e.descriptionBase, { resourceId: e.resourceId, textSha256: sha(base.text) });
    assert.equal(e.sourceSha256, sha(e.text));
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
  const entries = [{ id: 'desc-m1', kind: 'description', generator: 'description', status: 'pending-text', sourceSha256: null }];
  applyScriptTexts(entries, texts);
  assert.equal(entries[0].text, 'A map. It shows a river. In verse 5 people come to this river.');
  assert.equal(entries[0].descriptionBase.resourceId, 'm1');
  assert.throws(() => composeDescriptions({ x: { base: 'missing', passageLine: 'y' } }, bases));
});
