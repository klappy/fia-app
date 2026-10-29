#!/usr/bin/env node
// Per-language calibration for fia-association-noul@1, fit on TUNING semantic-residue cases only.
// Exact-source inline cases are never fit on (they belong to the deterministic index) and held-out is never fit on.
// For each language, every (probability, gold label) pair from the tuning questions is pooled:
//   asksVisual        label = gold decision is 'associate'
//   requested_<i>     label = candidate i is in gold association.requested
//   primary_<i>       label = candidate i is gold display.primary (only where gold primary is adjudicated, non-null)
// falseMax = the highest probability on a false label, trueMin = the lowest on a true label. The language is calibrated
// only when both label kinds exist and falseMax < trueMin; otherwise it is reported uncalibrated and every case abstains.
// Probabilities strictly between the two bands are uncertain, and the composer abstains on them.
//   node server/fia/preparation/association-question/jev-calibrate.mjs --eval-dir <scripts/association-eval> --wire <file> --out <file>
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {canonical, sha256} from '../jev/adapter.mjs';
import {buildRequest} from './request.mjs';
import {buildQuestions, parseWire, createRecordedJevWire, QUESTION_SET, LIMITS} from './jev-noul.mjs';
import {stratumOf} from './report.mjs';
import {MODEL} from '../jev/adapter.mjs';

export const CALIBRATION_SCHEMA = 'fia-association-noul-calibration@1';

/** Pairs for one tuning case. */
export function labelledPairs(probabilities, keys, goldOutput) {
  const requested = new Set((goldOutput.association?.requested ?? []).map(r => `${r.collection}:${r.id}`));
  const primary = goldOutput.display?.primaryAssetId == null ? null : `${goldOutput.display.primaryCollection}:${goldOutput.display.primaryAssetId}`;
  const pairs = [{q: 'asksVisual', p: probabilities.asksVisual, label: goldOutput.decision === 'associate'}];
  for (const [i, id] of Object.entries(keys)) {
    pairs.push({q: `requested_${i}`, p: probabilities[`requested_${i}`], label: requested.has(id)});
    if (primary !== null) pairs.push({q: `primary_${i}`, p: probabilities[`primary_${i}`], label: primary === id});
  }
  return pairs;
}

/** cases: [{caseId, language, split, stratum, probabilities, keys, gold}] → calibration document. */
export async function fitCalibration({cases, modelRevision, source}) {
  const languages = {};
  for (const c of cases) {
    if (c.split !== 'tuning') throw Error(`fit-on-non-tuning:${c.caseId}`);
    if (c.stratum !== 'semantic-residue') throw Error(`fit-on-exact-source:${c.caseId}`);
    (languages[c.language] ||= {caseIds: [], pairs: []});
    languages[c.language].caseIds.push(c.caseId);
    languages[c.language].pairs.push(...labelledPairs(c.probabilities, c.keys, c.gold));
  }
  const out = {};
  for (const [lang, v] of Object.entries(languages).sort()) {
    const t = v.pairs.filter(x => x.label).map(x => x.p), f = v.pairs.filter(x => !x.label).map(x => x.p);
    const base = {tuningCases: v.caseIds.length, caseIds: v.caseIds.sort(), truePairs: t.length, falsePairs: f.length};
    if (!t.length || !f.length) { out[lang] = {status: 'insufficient-tuning', ...base}; continue; }
    const falseMax = Math.max(...f), trueMin = Math.min(...t);
    out[lang] = falseMax < trueMin ? {status: 'calibrated', falseMax, trueMin, ...base} : {status: 'not-separable', falseMax, trueMin, ...base};
  }
  return {schema: CALIBRATION_SCHEMA, questionSet: QUESTION_SET, modelRevision, fitOn: 'tuning split, semantic-residue stratum only',
    limits: LIMITS, source, languages: out};
}

/** Recorded-wire probabilities for the tuning semantic-residue cases. Refuses mixed or unverified model versions. */
export async function tuningProbabilities({inputs, gold, split, wireFile}) {
  const AI = createRecordedJevWire(wireFile), splitOf = new Map(split.cases.map(c => [c.caseId, c.split]));
  const goldOf = new Map(gold.cases.map(c => [c.caseId, c.output]));
  const cases = [], versions = new Set();
  for (const input of inputs.cases) {
    if (splitOf.get(input.caseId) !== 'tuning' || stratumOf(input) !== 'semantic-residue') continue;
    const {request} = await buildRequest(input);
    const q = buildQuestions(request);
    if (q.refused) continue;
    let response;
    try { response = await AI.run(MODEL, {state: q.state, questions: q.questions}); } catch { continue; } // no recording: not fit
    const parsed = parseWire(response, q.questions);
    if (parsed.invalid) throw Error(`tuning-response-invalid:${input.caseId}:${parsed.invalid}`);
    if (!parsed.modelVersion) throw Error(`tuning-model-version-unverified:${input.caseId}`);
    versions.add(parsed.modelVersion);
    cases.push({caseId: input.caseId, language: input.language, split: 'tuning', stratum: 'semantic-residue', probabilities: parsed.probabilities, keys: q.keys, gold: goldOf.get(input.caseId)});
  }
  if (versions.size > 1) throw Error(`tuning-model-version-mixed:${[...versions].join(',')}`);
  return {cases, modelRevision: [...versions][0] ?? null};
}

function args(argv) { const o = {}; for (let i = 0; i < argv.length; i += 2) o[argv[i].replace(/^--/, '')] = argv[i + 1]; return o; }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = args(process.argv.slice(2));
  if (!a['eval-dir'] || !a.wire || !a.out) throw Error('usage: --eval-dir <dir> --wire <recorded wire file> --out <file>');
  const dir = resolve(a['eval-dir']), read = async p => JSON.parse(await readFile(p, 'utf8'));
  const wireFile = await read(a.wire);
  const t = await tuningProbabilities({inputs: await read(`${dir}/inputs.json`), gold: await read(`${dir}/gold.json`), split: await read(`${dir}/split.json`), wireFile});
  const doc = await fitCalibration({...t, source: {wireLabel: wireFile.label ?? null, wireSha256: await sha256(JSON.stringify(wireFile))}});
  await writeFile(a.out, JSON.stringify(doc, null, 2) + '\n');
  console.log(JSON.stringify(doc.languages, null, 2));
}
