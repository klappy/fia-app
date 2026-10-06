#!/usr/bin/env node
// Harness for the fia-cue-role@1 Jev pilot (cookbook unit 2026-10-06-fia-cue-role-jev-pilot, PLAN.md §§3-4, 7, 9).
// Phases: requests | snippet | import | derive | score | report | replay (and --gold-check). Node never holds a
// provider credential: `requests` captures the adapter's own wire through a recording shim, the CF connector (or the
// REST fallback) fires it, `import` stores raw responses, every later phase replays them at zero calls.
import {mkdir, readFile, writeFile, access} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createJevCueRoleAdapter, canonical, sha256, MODEL, ROLES} from '../../server/fia/preparation/jev/adapter.mjs';
import {readCases, loadSourcePacks, assertCaseSet, LISTS} from './cases.mjs';
import {createExplicitCueRules, naiveSourceFlags, ARM_A_LABEL, ARM_C} from './rules.mjs';
import {rawKeyFor, loadRawCache, createReplayAI, normalizeJevResponse, observedModel} from './providers/replay.mjs';
import {scoreSet, costTerms, verdict} from './metrics.mjs';

export const PILOT = new URL('./', import.meta.url);
const JEV = new URL('../../server/fia/preparation/jev/', import.meta.url);
export const DEFAULT_EVIDENCE = fileURLToPath(new URL('evidence/', PILOT));
export const DEFAULT_CALIBRATION = fileURLToPath(new URL('calibration.json', PILOT));
export const DEFAULT_CASES = fileURLToPath(new URL('cases.json', PILOT));

// D7 ceilings. Per pass ≤ 24 cases / 96 primitive questions; three passes = 40 calls / 160 questions.
export const CEILINGS = Object.freeze({casesPerPass: 24, questionsPerPass: 96, totalCalls: 40, estTokensPerCase: 500, inputTokensPerCall: 2000, cumulativeInputTokens: 48000, batchSize: 8, concurrency: 6, spendAbortFraction: 0.05, wallMinutes: 30});
export const BOOTSTRAP_BANDS = Object.freeze({falseMax: 0, trueMin: 1}); // D5: every case reaches the provider, nothing resolves
export const EXPLORATORY_BANDS = Object.freeze({falseMax: 0.4999, trueMin: 0.5}); // DoD 6: uncalibratable language, no verdict
export const BOOTSTRAP_MODEL_REVISION = 'jev-1.13.0'; // last observed (kitchen jev-speed-bottlenecks VERDICT.md:6)
export const CONFIGURATION = Object.freeze({wire: 'connector-ai-run@1', route: 'cf-api:/accounts/{id}/ai/run'});
export const LIMITS = Object.freeze({maxInputBytes: 8192, maxOutputBytes: 16384, maxContextUnits: 2, timeoutMs: 10000});
export const BAND_MARGIN = 0.05;
export const SPA_REVIEWER = /^mirror-eng\+backtranslation:\S+$/;
const ARMS = ['A', 'B', 'C', 'D'], SETS = ['dev', 'heldout'];

const json = x => JSON.stringify(x, null, 2) + '\n';
const exists = p => access(p).then(() => true, () => false);
const round6 = x => Math.round(x * 1e6) / 1e6;

export async function loadFixed() {
  const contractText = await readFile(new URL('cue-role-v1.md', JEV), 'utf8');
  const schemaText = await readFile(new URL('cue-role-v1.schema.json', JEV), 'utf8');
  return {contractText, schemaText, configSha256: await sha256(canonical(CONFIGURATION)), contractSha256: await sha256(contractText), schemaSha256: await sha256(schemaText)};
}

export async function calibrationRecord({fixed, language, modelRevision, bands, policySha256}) {
  return {policySha256, language, modelRevision, configSha256: fixed.configSha256, contractSha256: fixed.contractSha256, schemaSha256: fixed.schemaSha256, falseMax: bands.falseMax, trueMin: bands.trueMin};
}

export async function bootstrapCalibration(fixed, language, modelRevision = BOOTSTRAP_MODEL_REVISION) {
  return calibrationRecord({fixed, language, modelRevision, bands: BOOTSTRAP_BANDS, policySha256: await sha256(canonical({policy: 'bootstrap-collect@1', bands: BOOTSTRAP_BANDS}))});
}

export function composeAdapter({fixed, AI = null, calibration = null, resolveExplicit = null, modelRevision}) {
  return createJevCueRoleAdapter({AI, contractText: fixed.contractText, schemaText: fixed.schemaText, modelRevision, configuration: CONFIGURATION, calibration, resolveExplicit, limits: LIMITS});
}

/** Recording AI shim: keeps the adapter's exact wire ({state, questions}, adapter.mjs:123-127) and never answers. */
export function recordingShim() {
  const calls = [];
  return {calls, run(model, wire) { calls.push({model, state: wire.state, questions: wire.questions}); throw Error('recording-only'); }};
}

export function selectCases(cases, {set = 'all', language = null} = {}) {
  return cases.filter(c => (set === 'all' || c.meta.split === set) && (!language || c.input.language === language));
}

/** requests phase: one captured wire per case, rawKey bound to the pass (§9). */
export async function captureRequests(cases, {fixed, pass = 1}) {
  const out = [];
  for (const c of cases) {
    const shim = recordingShim();
    const adapter = await composeAdapter({fixed, AI: shim, calibration: await bootstrapCalibration(fixed, c.input.language), modelRevision: BOOTSTRAP_MODEL_REVISION});
    const envelope = await adapter.decide(c.input);
    if (shim.calls.length !== 1 || envelope.reason !== 'provider-outcome-uncertain') throw Error(`capture-failed:${c.caseId}:${envelope.status}:${envelope.reason}`);
    const {model, state, questions} = shim.calls[0];
    const estInputTokens = Math.ceil(new TextEncoder().encode(state + canonical(questions)).length / 4);
    out.push({caseId: c.caseId, rawKey: await rawKeyFor({model, state, questions, pass}), pass, model, estTokens: c.meta.estTokens, estInputTokens, state, questions});
  }
  checkRequestCeilings(out);
  return out;
}

export function checkRequestCeilings(requests, {priorCalls = 0} = {}) {
  if (requests.length > CEILINGS.casesPerPass) throw Error(`ceiling:cases-per-pass:${requests.length}`);
  const questions = requests.reduce((n, r) => n + Object.keys(r.questions).length, 0);
  if (questions > CEILINGS.questionsPerPass) throw Error(`ceiling:questions-per-pass:${questions}`);
  if (priorCalls + requests.length > CEILINGS.totalCalls) throw Error(`ceiling:total-calls:${priorCalls + requests.length}`);
  for (const r of requests) {
    if (r.estTokens > CEILINGS.estTokensPerCase) throw Error(`ceiling:oversize:${r.caseId}:${r.estTokens}`);
    if (r.estInputTokens > CEILINGS.inputTokensPerCall) throw Error(`ceiling:input-per-call:${r.caseId}:${r.estInputTokens}`);
  }
  const total = requests.reduce((n, r) => n + r.estInputTokens, 0);
  if (total > CEILINGS.cumulativeInputTokens) throw Error(`ceiling:cumulative-estimate:${total}`);
  return {calls: requests.length, questions, estInputTokens: total};
}

export function requestsFile(evidenceDir, pass) { return join(evidenceDir, pass === 1 ? 'requests.json' : `requests-pass${pass}.json`); }
export async function readRequests(evidenceDir, pass) { return JSON.parse(await readFile(requestsFile(evidenceDir, pass), 'utf8')); }
export function connectorRequest(r) { return {method: 'POST', path: '/accounts/${accountId}/ai/run', body: {model: r.model, input: {state: r.state, questions: r.questions}}}; }

export async function snippetFor(requests, batch, {probe = false} = {}) {
  const slice = probe ? requests.slice(0, 1) : requests.slice(batch * CEILINGS.batchSize, (batch + 1) * CEILINGS.batchSize);
  if (!slice.length) throw Error(`batch-empty:${batch}`);
  const source = await readFile(new URL('providers/connector-snippet.js', PILOT), 'utf8');
  const body = source.slice(source.indexOf('async () =>'));
  return body.replace('__DATA__', JSON.stringify(slice.map(r => ({rawKey: r.rawKey, state: r.state, questions: r.questions}))));
}

function validProbe(response) {
  const r = normalizeJevResponse(response);
  return Boolean(r && typeof r.model === 'string' && r.answers && Object.keys(r.answers).sort().join() === [...ROLES].sort().join());
}

/**
 * import phase: connector/REST rows [{rawKey, ms, response, error?}] → evidence/raw/<rawKey>.json (immutable).
 * Probe gate (gate 4): the first row must carry answers with the four role keys and a `model` string, else nothing is written.
 * Observed usage ceilings (D7) are checked after writing, so evidence of every paid call is kept; a breach fails the phase.
 */
export async function importRows(rows, {evidenceDir, pass = 1, rates = {}, observedAt = null}) {
  if (!Array.isArray(rows)) rows = rows?.result ?? rows?.rows;
  if (!Array.isArray(rows) || !rows.length) throw Error('import-empty');
  const requests = new Map((await readRequests(evidenceDir, pass)).map(r => [r.rawKey, r]));
  if (!validProbe(rows[0].response)) throw Error('probe-failed: first response lacks answers for the four roles or a model string');
  const rawDir = join(evidenceDir, 'raw');
  await mkdir(rawDir, {recursive: true});
  const written = [];
  for (const row of rows) {
    const req = requests.get(row.rawKey);
    if (!req) throw Error(`import-unknown-rawKey:${row.rawKey}`);
    const record = {rawKey: row.rawKey, caseId: req.caseId, pass, model: req.model, ms: Number.isFinite(row.ms) ? row.ms : null, response: row.response ?? null, error: row.error ?? null, ...(observedAt ? {observedAt} : {})};
    const path = join(rawDir, `${row.rawKey}.json`);
    if (await exists(path)) {
      const old = JSON.parse(await readFile(path, 'utf8'));
      if (canonical({r: old.response, e: old.error}, 262144) !== canonical({r: record.response, e: record.error}, 262144)) throw Error(`raw-immutable:${row.rawKey}`);
      continue;
    }
    await writeFile(path, json(record));
    written.push(row.rawKey);
  }
  const usage = await observedUsage(evidenceDir);
  const breaches = [];
  for (const [key, u] of Object.entries(usage.perCall)) if (u.input > CEILINGS.inputTokensPerCall) breaches.push(`input-per-call:${key}:${u.input}`);
  if (usage.input > CEILINGS.cumulativeInputTokens) breaches.push(`cumulative-input:${usage.input}`);
  if (usage.calls > CEILINGS.totalCalls) breaches.push(`total-calls:${usage.calls}`);
  const {ratePerMTokIn, ratePerMTokOut, spendCeiling} = rates;
  if ([ratePerMTokIn, ratePerMTokOut, spendCeiling].every(Number.isFinite)) {
    const spend = (usage.input * ratePerMTokIn + usage.output * ratePerMTokOut) / 1e6;
    if (spend > CEILINGS.spendAbortFraction * spendCeiling) breaches.push('computed-spend-over-abort-fraction');
  }
  return {written, usage: {calls: usage.calls, input: usage.input, output: usage.output}, breaches};
}

export async function observedUsage(evidenceDir) {
  const cache = await loadRawCache(join(evidenceDir, 'raw'));
  let input = 0, output = 0;
  const perCall = {};
  for (const [key, rec] of cache) {
    const u = normalizeJevResponse(rec.response)?.usage ?? {};
    perCall[key] = {input: u.input_tokens ?? 0, output: u.output_tokens ?? 0};
    input += perCall[key].input; output += perCall[key].output;
  }
  return {calls: cache.size, input, output, perCall};
}

/** Gate 6 (D10): spa is refused unless every spa row is mirror-eng gold with a recorded back-translation. */
export function assertLanguageAllowed(cases, language) {
  if (!['eng', 'spa'].includes(language)) throw Error('--language must be eng or spa');
  if (language !== 'spa') return;
  const bad = cases.filter(c => c.input.language === 'spa' && !(c.gold && SPA_REVIEWER.test(c.gold.reviewer ?? '') && typeof c.gold.backTranslation === 'string' && c.gold.backTranslation.trim()));
  if (bad.length) throw Error(`spa-gold-refused: ${bad.length} spa rows lack reviewer 'mirror-eng+backtranslation:<cook>' with a recorded backTranslation (PLAN gate 6)`);
}

function assertGold(cases) {
  const missing = cases.filter(c => !c.gold || !c.gold.roles || typeof c.gold.needsReview !== 'boolean').map(c => c.caseId);
  if (missing.length) throw Error(`gold-missing:${missing.join(',')}`);
}

function compact(e) {
  const p = e.provenance ?? {};
  const provenance = {mode: p.mode, invocations: p.invocations};
  for (const k of ['policySha256', 'evidenceSha256', 'responseSha256', 'probabilities', 'modelVersion', 'usage']) if (p[k] !== undefined) provenance[k] = p[k];
  return {status: e.status, reason: e.reason, cacheKey: e.cacheKey, decision: e.decision, provenance};
}

async function rawKeysFor(evidenceDir, pass) {
  try { return new Map((await readRequests(evidenceDir, pass)).map(r => [r.caseId, r.rawKey])); } catch { return new Map(); }
}

/** derive phase (dev only, per language): one band pair across roles (adapter.mjs:148-149 applies one pair). */
export async function deriveCalibration({cases, language, evidenceDir, fixed}) {
  assertLanguageAllowed(cases, language);
  const dev = selectCases(cases, {set: 'dev', language});
  assertGold(dev);
  const cache = await loadRawCache(join(evidenceDir, 'raw'));
  const keys = await rawKeysFor(evidenceDir, 1);
  const models = new Set();
  for (const c of dev) { const rec = cache.get(keys.get(c.caseId)); if (!rec) throw Error(`raw-missing:${c.caseId}`); models.add(observedModel(rec.response)); }
  if (models.size !== 1 || [...models][0] === null) throw Error(`model-revision-ambiguous:${[...models].join(',')}`);
  const modelRevision = [...models][0];
  const adapter = await composeAdapter({fixed, AI: createReplayAI({cache, pass: 1}), calibration: await bootstrapCalibration(fixed, language, modelRevision), modelRevision});
  const falseValues = [], trueValues = [], instances = [];
  for (const c of dev) {
    const e = await adapter.decide(c.input);
    const probs = e.provenance?.probabilities;
    if (!probs) throw Error(`probabilities-missing:${c.caseId}:${e.status}:${e.reason}`);
    if (c.gold.needsReview) continue;
    for (const k of ROLES) { (c.gold.roles[k] ? trueValues : falseValues).push(probs[k]); instances.push({caseId: c.caseId, role: k, gold: c.gold.roles[k], noul: probs[k]}); }
  }
  const falseMax = falseValues.length ? round6(Math.max(...falseValues) + BAND_MARGIN) : null;
  const trueMin = trueValues.length ? round6(Math.min(...trueValues) - BAND_MARGIN) : null;
  const calibratable = falseMax !== null && trueMin !== null && falseMax < trueMin && falseMax >= 0 && trueMin <= 1;
  const policySha256 = await sha256(canonical({policy: 'dev-band-derivation@1', margin: BAND_MARGIN, language, dev: dev.map(c => ({caseId: c.caseId, gold: c.gold.roles, needsReview: c.gold.needsReview}))}));
  const bands = calibratable ? {falseMax, trueMin} : EXPLORATORY_BANDS;
  return {status: calibratable ? 'calibrated' : 'uncalibratable', derived: {falseMax, trueMin}, record: await calibrationRecord({fixed, language, modelRevision, bands, policySha256}), instances};
}

export async function readCalibration(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return {schema: 'fia-cue-role-pilot-calibration@1', bootstrap: {...BOOTSTRAP_BANDS, modelRevision: BOOTSTRAP_MODEL_REVISION}, languages: {}}; }
}

export async function buildRules() {
  const packs = await loadSourcePacks();
  const guides = Object.fromEntries(Object.entries(packs.packs).map(([id, p]) => [id, p.guide?.contentSha256]));
  return createExplicitCueRules({lists: JSON.parse(await readFile(LISTS, 'utf8')), pauseRegistry: JSON.parse(await readFile(new URL('pause-only-registry.json', PILOT), 'utf8')), guides});
}

/** score phase: envelopes per arm for one language/set/pass. */
export async function scoreArm({cases, language, set, arm, pass = 1, evidenceDir, calibration, rules, fixed}) {
  assertLanguageAllowed(cases, language);
  const rows = selectCases(cases, {set, language});
  assertGold(rows);
  if (pass !== 1 && (set !== 'heldout' || !['B', 'D'].includes(arm))) throw Error('pass 2 scores held-out arms B and D only');
  const envelopes = {};
  if (arm === 'C') {
    for (const c of rows) envelopes[c.caseId] = {status: 'resolved', reason: 'naive-v2-source-flags', cacheKey: null, decision: {roles: naiveSourceFlags(c.meta)}, provenance: {mode: 'comparator', invocations: 0}};
    return {arm, label: ARM_C.label, language, set, pass, exploratory: false, envelopes};
  }
  let adapter, exploratory = false;
  if (arm === 'A') adapter = await composeAdapter({fixed, resolveExplicit: rules.resolveExplicit, modelRevision: BOOTSTRAP_MODEL_REVISION});
  else {
    const entry = calibration.languages?.[language];
    if (!entry) throw Error(`calibration-missing:${language} (run --phase derive --language ${language})`);
    exploratory = entry.status !== 'calibrated';
    const cache = await loadRawCache(join(evidenceDir, 'raw'));
    adapter = await composeAdapter({fixed, AI: createReplayAI({cache, pass}), calibration: entry.record, resolveExplicit: arm === 'B' ? rules.resolveExplicit : null, modelRevision: entry.record.modelRevision});
  }
  for (const c of rows) envelopes[c.caseId] = compact(await adapter.decide(c.input));
  return {arm, label: arm === 'A' ? ARM_A_LABEL : arm === 'B' ? `rules+jev (${ARM_A_LABEL})` : 'jev-only-probe', language, set, pass, exploratory, envelopes};
}

export function decisionsFile(evidenceDir, {language, arm, set, pass}) { return join(evidenceDir, 'decisions', `${language}-${arm}-${set}-p${pass}.json`); }

async function readDecisions(evidenceDir, key) { try { return JSON.parse(await readFile(decisionsFile(evidenceDir, key), 'utf8')); } catch { return null; } }

/** report phase: deterministic metrics.json (no clock, no rates unless supplied). */
export async function buildReport({cases, evidenceDir, calibration, rates = {}}) {
  const cache = await loadRawCache(join(evidenceDir, 'raw'));
  const keys = {1: await rawKeysFor(evidenceDir, 1), 2: await rawKeysFor(evidenceDir, 2)};
  const out = {schema: 'fia-cue-role-pilot-metrics@1', armLabels: {A: ARM_A_LABEL, B: `rules+jev (${ARM_A_LABEL})`, C: ARM_C.label, D: 'jev-only-probe'}, ceilings: CEILINGS, languages: {}, keys: []};
  for (const language of ['eng', 'spa']) {
    const cal = calibration.languages?.[language] ?? null;
    const lang = {calibration: cal ? {status: cal.status, derived: cal.derived, modelRevision: cal.record.modelRevision, falseMax: cal.record.falseMax, trueMin: cal.record.trueMin} : null, sets: {}, verdicts: {}};
    let any = false;
    for (const set of SETS) {
      const rows = selectCases(cases, {set, language});
      lang.sets[set] = {};
      for (const arm of ARMS) {
        const d1 = await readDecisions(evidenceDir, {language, arm, set, pass: 1});
        if (!d1) continue;
        any = true;
        const d2 = set === 'heldout' && ['B', 'D'].includes(arm) ? await readDecisions(evidenceDir, {language, arm, set, pass: 2}) : null;
        const calls = {};
        for (const c of rows) {
          const e = d1.envelopes[c.caseId];
          if (e?.provenance?.mode === 'jev') { const rec = cache.get(keys[1].get(c.caseId)); if (rec) calls[c.caseId] = {ms: rec.ms, usage: normalizeJevResponse(rec.response)?.usage}; }
        }
        const score = scoreSet({cases: rows, envelopes: d1.envelopes, rerun: d2?.envelopes ?? null, calls});
        lang.sets[set][arm] = {label: d1.label, exploratory: d1.exploratory, rerun: Boolean(d2), ...score, cost: costTerms(score, rates)};
      }
    }
    const A = lang.sets.heldout?.A, B = lang.sets.heldout?.B;
    if (A && B) {
      const rows = selectCases(cases, {set: 'heldout', language});
      const dA = await readDecisions(evidenceDir, {language, arm: 'A', set: 'heldout', pass: 1});
      const dB = await readDecisions(evidenceDir, {language, arm: 'B', set: 'heldout', pass: 1});
      const dB2 = await readDecisions(evidenceDir, {language, arm: 'B', set: 'heldout', pass: 2});
      const abstained = rows.filter(c => dA.envelopes[c.caseId].status !== 'resolved');
      const pick = (d, list) => Object.fromEntries(list.map(c => [c.caseId, d.envelopes[c.caseId]]));
      const callsFor = list => Object.fromEntries(list.filter(c => dB.envelopes[c.caseId]?.provenance?.mode === 'jev').map(c => { const rec = cache.get(keys[1].get(c.caseId)); return [c.caseId, {ms: rec?.ms, usage: normalizeJevResponse(rec?.response)?.usage}]; }));
      const subA = scoreSet({cases: abstained, envelopes: pick(dA, abstained)});
      const subB = scoreSet({cases: abstained, envelopes: pick(dB, abstained), rerun: dB2 ? pick(dB2, abstained) : null, calls: callsFor(abstained)});
      for (const role of ROLES) lang.verdicts[role] = {
        overall: verdict({role, armA: A, armB: B, costB: B.cost, uncalibratable: cal?.status !== 'calibrated'}),
        armAAbstainedSubset: {cases: abstained.length, ...verdict({role, armA: subA, armB: subB, costB: costTerms(subB, rates), uncalibratable: cal?.status !== 'calibrated'})}
      };
    }
    if (any) out.languages[language] = lang;
  }
  for (const c of cases) {
    const entry = {caseId: c.caseId, rawKeyPass1: keys[1].get(c.caseId) ?? null, rawKeyPass2: keys[2].get(c.caseId) ?? null, cacheKeys: {}};
    for (const arm of ['A', 'B', 'D']) { const d = await readDecisions(evidenceDir, {language: c.input.language, arm, set: c.meta.split, pass: 1}); if (d) entry.cacheKeys[arm] = d.envelopes[c.caseId]?.cacheKey ?? null; }
    out.keys.push(entry);
  }
  return out;
}

export function goldCheck(a, b) {
  const other = new Map(b.map(c => [c.caseId, c.gold]));
  const diffs = [];
  for (const c of a) {
    const g1 = c.gold, g2 = other.get(c.caseId);
    if (!g1 || !g2) { diffs.push({caseId: c.caseId, field: 'gold', a: g1 ? 'present' : null, b: g2 ? 'present' : null}); continue; }
    for (const k of ROLES) if (g1.roles[k] !== g2.roles[k]) diffs.push({caseId: c.caseId, field: k, a: g1.roles[k], b: g2.roles[k], reasons: [g1.reason, g2.reason]});
    if (g1.needsReview !== g2.needsReview) diffs.push({caseId: c.caseId, field: 'needsReview', a: g1.needsReview, b: g2.needsReview, reasons: [g1.reason, g2.reason]});
  }
  return diffs;
}

export function parseArgs(argv) {
  const args = {flags: new Set()};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw Error(`unexpected argument ${a}`);
    const [k, inline] = a.slice(2).split(/=(.*)/s);
    if (inline !== undefined) args[k] = inline;
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) args[k] = argv[++i];
    else args.flags.add(k);
  }
  return args;
}

const num = x => (x === undefined ? null : Number(x));

async function runAllScores({cases, language, evidenceDir, calibration, fixed, rules, arms = ARMS, sets = SETS, passes = [1, 2]}) {
  const written = [];
  for (const set of sets) for (const arm of arms) for (const pass of passes) {
    if (pass === 2 && (set !== 'heldout' || !['B', 'D'].includes(arm))) continue;
    if (pass === 2 && !(await exists(requestsFile(evidenceDir, 2)))) continue;
    const d = await scoreArm({cases, language, set, arm, pass, evidenceDir, calibration, rules, fixed});
    const path = decisionsFile(evidenceDir, {language, arm, set, pass});
    await mkdir(join(evidenceDir, 'decisions'), {recursive: true});
    await writeFile(path, json(d));
    written.push(path);
  }
  return written;
}

export async function main(argv = process.argv.slice(2), {log = console.log} = {}) {
  const args = parseArgs(argv);
  const evidenceDir = resolve(args['evidence-dir'] ?? DEFAULT_EVIDENCE);
  const casesPath = resolve(args.cases ?? DEFAULT_CASES);
  const calibrationPath = resolve(args.calibration ?? DEFAULT_CALIBRATION);
  const casesDoc = await readCases(casesPath);
  const cases = casesDoc.cases;
  await assertCaseSet(cases);
  const fixed = await loadFixed();
  const pass = Number(args.pass ?? 1);
  const rates = {ratePerMTokIn: num(args['rate-in']), ratePerMTokOut: num(args['rate-out']), minuteRate: num(args['minute-rate']), spendCeiling: num(args['spend-ceiling'])};

  if (args.flags.has('gold-check')) {
    const other = (await readCases(resolve(args.against))).cases;
    const diffs = goldCheck(cases, other);
    log(json({disagreements: diffs.length, diffs}));
    return 0;
  }
  const phase = args.phase;
  if (phase === 'requests') {
    if (pass === 2 && args.flags.has('no-rerun')) throw Error('--no-rerun: pass 2 is skipped');
    const set = pass === 2 ? 'heldout' : (args.set ?? 'all');
    if (!['all', 'dev', 'heldout'].includes(set)) throw Error('--set must be dev, heldout or all');
    const requests = await captureRequests(selectCases(cases, {set}), {fixed, pass});
    const prior = pass === 2 ? (await readRequests(evidenceDir, 1)).length : 0;
    const totals = checkRequestCeilings(requests, {priorCalls: prior});
    if (args.flags.has('dry-run')) { log(json(connectorRequest(requests[0]))); log(json(totals)); return 0; }
    await mkdir(evidenceDir, {recursive: true});
    await writeFile(requestsFile(evidenceDir, pass), json(requests));
    log(`wrote ${requestsFile(evidenceDir, pass)}: ${totals.calls} requests, ${totals.questions} questions, ~${totals.estInputTokens} estimated input tokens (ceilings: ${CEILINGS.casesPerPass}/${CEILINGS.questionsPerPass} per pass, ${CEILINGS.inputTokensPerCall} per call, ${CEILINGS.cumulativeInputTokens} cumulative)`);
    log(`batches of ${CEILINGS.batchSize}: ${Math.ceil(requests.length / CEILINGS.batchSize)} (probe first: --phase snippet --probe)`);
    return 0;
  }
  if (phase === 'snippet') {
    log(await snippetFor(await readRequests(evidenceDir, pass), Number(args.batch ?? 0), {probe: args.flags.has('probe')}));
    return 0;
  }
  if (phase === 'import') {
    if (!args.from) throw Error('--from <connector-output.json>[,<more>] required');
    let rows = [];
    for (const f of args.from.split(',')) { const x = JSON.parse(await readFile(resolve(f), 'utf8')); rows = rows.concat(Array.isArray(x) ? x : x.result ?? x.rows); }
    const r = await importRows(rows, {evidenceDir, pass, rates, observedAt: args['observed-at'] ?? null});
    log(json(r));
    return r.breaches.length ? 3 : 0;
  }
  if (phase === 'derive' || phase === 'score') {
    const language = args.language;
    if (!language) throw Error(`--phase ${phase} requires --language eng|spa`);
    assertLanguageAllowed(cases, language);
    const calibration = await readCalibration(calibrationPath);
    if (phase === 'derive') {
      const d = await deriveCalibration({cases, language, evidenceDir, fixed});
      calibration.languages = {...calibration.languages, [language]: {status: d.status, derived: d.derived, record: d.record}};
      await writeFile(calibrationPath, json(calibration));
      log(json({language, status: d.status, derived: d.derived, record: d.record}));
      return 0;
    }
    const arms = args.arm ? [args.arm] : ARMS, sets = args.set && args.set !== 'all' ? [args.set] : SETS;
    if (arms.some(a => !ARMS.includes(a))) throw Error('--arm must be A, B, C or D');
    const passes = args.pass ? [pass] : [1, 2];
    const written = await runAllScores({cases, language, evidenceDir, calibration, fixed, rules: await buildRules(), arms, sets, passes});
    log(written.join('\n'));
    return 0;
  }
  if (phase === 'report') {
    const report = await buildReport({cases, evidenceDir, calibration: await readCalibration(calibrationPath), rates});
    await writeFile(join(evidenceDir, 'metrics.json'), json(report));
    log(`wrote ${join(evidenceDir, 'metrics.json')}`);
    return 0;
  }
  if (phase === 'replay') {
    // Zero network: any fetch during replay is an error. Recompute calibration, decisions and metrics from the raw cache.
    const realFetch = globalThis.fetch;
    globalThis.fetch = () => { throw Error('network-forbidden-in-replay'); };
    try {
      const calibration = await readCalibration(calibrationPath);
      const expected = await readFile(join(evidenceDir, 'metrics.json'), 'utf8');
      const tmp = {...calibration, languages: {}};
      for (const language of Object.keys(calibration.languages ?? {})) {
        const d = await deriveCalibration({cases, language, evidenceDir, fixed});
        if (canonical(d.record) !== canonical(calibration.languages[language].record)) throw Error(`replay-calibration-differs:${language}`);
        tmp.languages[language] = {status: d.status, derived: d.derived, record: d.record};
      }
      const {mkdtemp, cp, rm} = await import('node:fs/promises');
      const {tmpdir} = await import('node:os');
      const dir = await mkdtemp(join(tmpdir(), 'jev-cue-replay-'));
      try {
        await cp(join(evidenceDir, 'raw'), join(dir, 'raw'), {recursive: true}).catch(() => {});
        for (const p of [1, 2]) if (await exists(requestsFile(evidenceDir, p))) await cp(requestsFile(evidenceDir, p), requestsFile(dir, p));
        const rules = await buildRules();
        for (const language of ['eng', 'spa']) {
          const has = await exists(decisionsFile(evidenceDir, {language, arm: 'A', set: 'dev', pass: 1})) || await exists(decisionsFile(evidenceDir, {language, arm: 'C', set: 'dev', pass: 1}));
          if (!has) continue;
          const arms = [];
          for (const arm of ARMS) if (await exists(decisionsFile(evidenceDir, {language, arm, set: 'dev', pass: 1}))) arms.push(arm);
          await runAllScores({cases, language, evidenceDir: dir, calibration: tmp, fixed, rules, arms});
        }
        const actual = json(await buildReport({cases, evidenceDir: dir, calibration: tmp, rates}));
        if (actual !== expected) { log('replay: metrics.json DIFFERS'); return 1; }
        log('replay: metrics.json identical, 0 network calls');
        return 0;
      } finally { await rm(dir, {recursive: true, force: true}); }
    } finally { globalThis.fetch = realFetch; }
  }
  throw Error('--phase must be requests | snippet | import | derive | score | report | replay (or --gold-check --against <cases.json>)');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then(code => { process.exitCode = code; }, e => { console.error(String(e?.message ?? e)); process.exitCode = 2; });
}
