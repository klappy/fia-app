#!/usr/bin/env node
// Per-language calibration for fia-association-noul@2, fit on TUNING semantic-residue cases only.
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
import {buildQuestions, buildFollowUp, compose, parseWire, createRecordedJevWire, QUESTION_SET, LIMITS} from './jev-noul.mjs';
import {stratumOf} from './report.mjs';
import {MODEL} from '../jev/adapter.mjs';

export const CALIBRATION_SCHEMA = 'fia-association-noul-calibration@1';

/** (probability, gold label) pairs for one tuning case; a question whose gold field was not adjudicated (null) gives no pair. */
export function labelledPairs(probabilities, keys, goldOutput, videoKeys = {}) {
  const k = r => `${r.collection}:${r.id}`, bare = id => id.slice(id.indexOf(':') + 1);
  const requested = new Set((goldOutput.association?.requested ?? []).map(k));
  const primary = goldOutput.display?.primaryAssetId == null ? null : `${goldOutput.display.primaryCollection}:${goldOutput.display.primaryAssetId}`;
  const companions = goldOutput.association?.optionalCompanions == null ? null : new Set(goldOutput.association.optionalCompanions.map(k));
  const pairs = goldOutput.association?.companionPairs == null ? null : new Set(goldOutput.association.companionPairs.map(p => `${k(p.from)}>${k(p.to)}`));
  const related = goldOutput.display?.relatedAssetIds ?? null;
  const out = [];
  for (const [q, p] of Object.entries(probabilities)) {
    let m, label;
    if (q === 'asksVisual') label = goldOutput.decision === 'associate';
    else if ((m = /^requested_(\d+)$/.exec(q))) label = requested.has(keys[m[1]]);
    else if ((m = /^primary_(\d+)$/.exec(q))) label = primary === null ? undefined : primary === keys[m[1]];
    else if ((m = /^companion_(\d+)$/.exec(q))) label = companions === null ? undefined : companions.has(videoKeys[m[1]]);
    else if ((m = /^before_(\d+)_(\d+)$/.exec(q))) {
      const ia = related?.indexOf(bare(keys[m[1]])) ?? -1, ib = related?.indexOf(bare(keys[m[2]])) ?? -1;
      label = ia < 0 || ib < 0 ? undefined : ia < ib;
    } else if ((m = /^pair_(\d+)_(\d+)$/.exec(q))) label = pairs === null ? undefined : pairs.has(`${keys[m[2]]}>${videoKeys[m[1]]}`);
    else throw Error(`unknown-question:${q}`);
    if (label !== undefined) out.push({q, p, label});
  }
  return out;
}

/** cases: [{caseId, language, split, stratum, probabilities, keys, gold}] → calibration document. */
export async function fitCalibration({cases, modelRevision, source}) {
  const languages = {};
  for (const c of cases) {
    if (c.split !== 'tuning') throw Error(`fit-on-non-tuning:${c.caseId}`);
    if (c.stratum !== 'semantic-residue') throw Error(`fit-on-exact-source:${c.caseId}`);
    (languages[c.language] ||= {caseIds: [], pairs: []});
    languages[c.language].caseIds.push(c.caseId);
    languages[c.language].pairs.push(...labelledPairs(c.probabilities, c.keys, c.gold, c.videoKeys ?? {}));
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

/**
 * Recorded-wire probabilities for the tuning semantic-residue cases, in two passes so no request ever depends on gold:
 * pass 1 reads call-1 answers and fits provisional bands on call-1 questions; pass 2 composes call 1 with those bands,
 * builds each call 2 from that composition (never from gold), and reads its answers. Refuses mixed or unverified versions.
 */
export async function tuningProbabilities({inputs, gold, split, wireFile, observe = () => {}}) {
  const AI = createRecordedJevWire(wireFile), splitOf = new Map(split.cases.map(c => [c.caseId, c.split]));
  const goldOf = new Map(gold.cases.map(c => [c.caseId, c.output]));
  const cases = [], versions = new Set();
  const read = async (caseId, q) => {
    let response;
    try { response = await AI.run(MODEL, {state: q.state, questions: q.questions}); } catch { return null; } // no recording: not fit
    const parsed = parseWire(response, q.questions);
    if (parsed.invalid) throw Error(`tuning-response-invalid:${caseId}:${parsed.invalid}`);
    if (parsed.identity.status !== 'resolved') throw Error(`tuning-${parsed.identity.reason}:${caseId}`); // never stamped
    versions.add(parsed.modelVersion);
    return parsed.probabilities;
  };
  for (const input of inputs.cases) {
    if (splitOf.get(input.caseId) !== 'tuning' || stratumOf(input) !== 'semantic-residue') continue;
    observe(input.caseId); // every case the fit reads; held-out, exact-source and Spanish Luke cases never reach here
    const {request} = await buildRequest(input);
    const q = buildQuestions(request);
    if (q.refused) continue;
    const p1 = await read(input.caseId, q);
    if (!p1) continue;
    cases.push({caseId: input.caseId, language: input.language, split: 'tuning', stratum: 'semantic-residue', probabilities: p1, keys: q.keys, videoKeys: q.videoKeys, gold: goldOf.get(input.caseId), request, q});
  }
  const provisional = await fitCalibration({cases, modelRevision: [...versions][0] ?? null});
  for (const c of cases) {
    const bands = provisional.languages[c.language];
    if (bands?.status !== 'calibrated') continue;
    const first = compose(c.probabilities, c.q.keys, bands, c.q.videoKeys);
    if (first.raw.decision !== 'associate') continue;
    const q2 = buildFollowUp(c.request, c.q, first);
    if (!q2 || q2.refused) continue;
    const p2 = await read(c.caseId, q2);
    if (p2) c.probabilities = {...c.probabilities, ...p2};
  }
  if (versions.size > 1) throw Error(`tuning-model-version-mixed:${[...versions].join(',')}`);
  return {cases: cases.map(({request, q, ...c}) => c), modelRevision: [...versions][0] ?? null};
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
