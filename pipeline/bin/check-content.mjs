#!/usr/bin/env node
// Content checks over built packs (offline; CI runs this via `npm test` in test/content-check.test.mjs too).
//   node bin/check-content.mjs                 every pack under data/packs
//   node bin/check-content.mjs --book MRK      only packs of one book
//   node bin/check-content.mjs --chars         also print narration characters per language (for the voice cost ask)
import { checkPack, listPacks, loadPack, loadRightsIds, narrationChars } from '../src/content-check.mjs';
import { loadSources } from '../src/lib.mjs';

const args = process.argv.slice(2);
const book = args.includes('--book') ? args[args.indexOf('--book') + 1] : null;
const sources = await loadSources();
const rightsIds = loadRightsIds();
const ids = listPacks(undefined, (id) => !book || id.split('.')[1].startsWith(`${book}-`));
const problems = [], omitted = [], chars = {};
for (const id of ids) {
  const pack = loadPack(id);
  problems.push(...checkPack(pack, { sources, rightsIds, omitted }));
  if (args.includes('--chars')) {
    const c = narrationChars(pack), lang = pack.manifest.language;
    const t = (chars[lang] ||= { packs: 0, slots: 0, sized: 0, unsized: 0, sourceRecordings: 0, clipChars: 0, uniqueCharsPerPack: 0, byKind: {} });
    t.packs++; t.slots += c.slots; t.sized += c.sized; t.unsized += c.unsized; t.sourceRecordings += c.sourceRecordings; t.clipChars += c.clipChars; t.uniqueCharsPerPack += c.uniqueChars;
    for (const [k, n] of Object.entries(c.byKind)) t.byKind[k] = (t.byKind[k] || 0) + n;
  }
}
for (const p of problems) console.error(`FAIL ${p}`);
console.error(`content check: ${ids.length} packs, ${problems.length} problem(s), ${omitted.length} verse(s) omitted by edition design (KNOWN_OMISSIONS)`);
if (args.includes('--chars')) console.log(JSON.stringify(chars, null, 2));
process.exit(problems.length ? 1 : 0);
