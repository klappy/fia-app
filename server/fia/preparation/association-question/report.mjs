#!/usr/bin/env node
// Q18 evaluation report: scores one decisions file with PR289's score.mjs, unchanged, in separate strata, so that
// easy exact-source cases cannot inflate model quality:
//   exact-source-inline: the unit's own source HTML carries a typed inline resource tag (data-resource-code FIAImages or
//                        FIAMaps plus data-content-id). These belong to the deterministic source index; a model score on
//                        them is reported apart and never counts as model quality.
//   semantic-residue:    every other case; this is where a model decision is measured.
// The stratum comes from the input's source HTML, never from gold. Denominators are the gold case counts per stratum,
// language and split, whether or not a decision exists (a missing decision is scored as missing).
//   node server/fia/preparation/association-question/report.mjs --eval-dir scripts/association-eval --decisions <file>
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export const REPORT_SCHEMA = 'fia-association-question-report@1';
export const STRATA = Object.freeze(['exact-source-inline', 'semantic-residue']);
const TYPED_INLINE_TAG = /<data\b(?=[^>]*\bdata-resource-code="(?:FIAImages|FIAMaps)")(?=[^>]*\bdata-content-id="[^"]+")[^>]*>/;

export const stratumOf = inputCase => (TYPED_INLINE_TAG.test(inputCase.source.unit.html) ? 'exact-source-inline' : 'semantic-residue');

/**
 * @param {{score: Function, inputs: object, gold: object, split: object, decisions: object, label?: string}} args
 * `score` is PR289's exported score(gold, decisions, {split, only}).
 */
export function buildReport({score, inputs, gold, split, decisions}) {
  const stratum = new Map(inputs.cases.map(c => [c.caseId, stratumOf(c)]));
  const splitOf = new Map(split.cases.map(c => [c.caseId, c.split]));
  for (const c of gold.cases) if (!stratum.has(c.caseId)) throw Error(`gold-case-without-input:${c.caseId}`);
  const denominators = {};
  for (const c of gold.cases) {
    const k = `${stratum.get(c.caseId)}/${c.caseId.slice(0, 3)}/${splitOf.get(c.caseId)}`;
    denominators[k] = (denominators[k] ?? 0) + 1;
  }
  const strata = {};
  for (const s of STRATA) {
    const g = {...gold, cases: gold.cases.filter(c => stratum.get(c.caseId) === s)};
    const ids = new Set(g.cases.map(c => c.caseId));
    const d = {...decisions, decisions: decisions.decisions.filter(x => ids.has(x.caseId))};
    strata[s] = {cases: g.cases.length, decidedInStratum: d.decisions.length,
      tuning: score(g, d, {split, only: 'tuning'}), heldout: score(g, d, {split, only: 'heldout'})};
  }
  return {schema: REPORT_SCHEMA, label: decisions.producer?.label ?? null, producer: decisions.producer ?? null,
    note: 'exact-source-inline results never count as model quality; recorded-response runs are pipeline tests, not Jev accuracy',
    denominators: Object.fromEntries(Object.entries(denominators).sort()), strata};
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = args(process.argv.slice(2));
  if (!a['eval-dir'] || !a.decisions) throw Error('usage: --eval-dir <scripts/association-eval> --decisions <file>');
  const dir = resolve(a['eval-dir']), read = async p => JSON.parse(await readFile(p, 'utf8'));
  const {score} = await import(pathToFileURL(`${dir}/score.mjs`));
  const report = buildReport({score, inputs: await read(`${dir}/inputs.json`), gold: await read(`${dir}/gold.json`), split: await read(`${dir}/split.json`), decisions: await read(a.decisions)});
  console.log(JSON.stringify(report, null, 2));
}
