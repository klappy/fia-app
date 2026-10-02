#!/usr/bin/env node
// BL4a: gather Bible section headings per Mark pericope from heading-sources.json and print rung coverage per language.
// usage: node bin/gather-headings.mjs [--json out.json] [--grounding]
//   --json       also write {byLang, unplaced, fetched, held, coverage} to a file (no committed output in BL4a)
//   --grounding  fetch each language's grounding edition and print its sha256 (only the sha256 enters a record)
import { writeFile } from 'node:fs/promises';
import { fetchPinned, loadSources, sha256, stableJson } from '../src/lib.mjs';
import { fetchSource, gatherHeadings, loadHeadingSources, markCatalog, rungCoverage } from '../src/headings.mjs';

const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const registry = await loadHeadingSources(); const sources = await loadSources();
const { byLang, unplaced, fetched, held } = await gatherHeadings({ registry, sources });
const catalog = await markCatalog(Object.keys(registry.grounding));
const coverage = rungCoverage(byLang, catalog);

console.log('source    lang  rev        kept  drift');
for (const f of fetched) console.log(`${f.id.padEnd(9)} ${f.lang}   ${f.revision.kind === 'git' ? 'git ' + f.revision.value.slice(0, 7) : 'sha ' + f.revision.value.slice(0, 8)}  ${String(f.kept).padStart(4)}  ${f.drift ? `pinned ${f.drift.pinned.slice(0, 8)}` : '-'}`);
for (const h of held) console.log(`HELD ${h.id}: ${h.reason}`);
console.log('\nrung coverage (entries with >= 1 heading / catalog Mark entries):');
console.log(Object.entries(coverage.perLang).map(([l, c]) => `${l} ${c.withHeadings}/${c.entries}`).join(' · '));
console.log(`rung 1 = ${coverage.totals[1]}, rung 1p = ${coverage.totals['1p']}, rung 2 = ${coverage.totals[2]} (sum ${coverage.totals[1] + coverage.totals['1p'] + coverage.totals[2]})`);
const eng = Object.values(byLang.eng || {}); const counts = eng.map((h) => h.length).sort((a, b) => a - b);
const median = counts.length ? (counts[(counts.length - 1) >> 1] + counts[counts.length >> 1]) / 2 : 0;
console.log(`eng: ${counts.reduce((a, b) => a + b, 0)} headings, median ${median}, max ${counts.at(-1)}, past ${eng.flat().filter((h) => h.past).length}, zero: ${Object.entries(byLang.eng || {}).filter(([, v]) => !v.length).map(([k]) => k).join(', ') || 'none'}`);
if (unplaced.length) console.log(`unplaced: ${unplaced.length}`);

if (args.includes('--grounding')) {
  console.log('\ngrounding (sha256 of the edition file):');
  for (const [lang, g] of Object.entries(registry.grounding)) {
    try {
      const s = g.kind === 'ebible' ? registry.sources.find((x) => x.id === g.source) : null;
      const bytes = s ? Buffer.from((await fetchSource(s, sources)).usfm) : (await fetchPinned(sources, g.repo, g.commit, g.path)).bytes;
      console.log(`${lang} ${g.source} ${sha256(bytes)}`);
    } catch (err) { console.log(`${lang} ${g.source} HELD: ${err.message}`); }
  }
}
if (jsonOut) await writeFile(jsonOut, stableJson({ byLang, unplaced, fetched, held, coverage }));
