import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, mkdir, rm, readdir, chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ROLES, sha256, canonical} from '../../server/fia/preparation/jev/adapter.mjs';
import {assertCaseSet} from './cases.mjs';
import {main, loadFixed, captureRequests, checkRequestCeilings, composeAdapter, bootstrapCalibration, calibrationRecord, importRows, assertLanguageAllowed, CEILINGS, BOOTSTRAP_MODEL_REVISION, requestsFile, snippetFor, snippetPhase, snippetRequests, batchCount, goldStatus, assertGold, reconcileGold, scoreArm, MISSING_LABEL, DUPLICATES_DIR, REFUSED_DIR, BREACH_FILE, LATENCY_MEASUREMENT} from './run.mjs';
import {createReplayAI, normalizeJevResponse, rawKeyFor, loadRawCache} from './providers/replay.mjs';
import {fireRequests} from './providers/rest.mjs';
import {scoreSet, seriousErrors, needsReviewCorrect, verdict, costTerms} from './metrics.mjs';

const here = new URL('./', import.meta.url);
const casesDoc = JSON.parse(await readFile(new URL('cases.json', here), 'utf8'));
const fixed = await loadFixed();
const R = (a, b, c, d) => Object.fromEntries(ROLES.map((k, i) => [k, [a, b, c, d][i]]));

// Fixture gold for harness tests only — NOT the pilot's gold (labelers fill cases.json.gold, PLAN steps 5-6).
function fixtureGold(c) {
  const id = c.input.source.unitId, dev = c.meta.split === 'dev';
  const table = dev ? {'S01-U002': R(true, true, false, false), 'S05-U004': R(false, true, true, false), 'S02-U012': R(false, false, false, true), 'S01-U003': R(false, true, false, false)}
    : {'S02-U001': R(true, false, false, false), 'S02-U008': R(false, false, true, false), 'S02-U016': R(false, true, false, false), 'S03-U007': R(false, false, false, false), 'S03-U020': R(false, false, false, false), 'S04-U015': R(false, false, false, false), 'S05-U004': R(false, false, false, false), 'S06-U004': R(false, false, false, false)};
  const needsReview = !dev && id === 'S03-U020';
  const gold = {roles: table[id], needsReview, reason: 'fixture', reviewer: 'fixture-a+fixture-d', agreement: true};
  if (c.input.language === 'spa') { delete gold.agreement; Object.assign(gold, {reviewer: 'mirror-eng+backtranslation:fixture-cook', backTranslation: 'fixture back-translation', divergent: false}); }
  return gold;
}
function withGold(doc, f = fixtureGold) { return {...doc, cases: doc.cases.map(c => ({...c, gold: f(c)}))}; }

// Verified wire shape (door probe 2026-10-06): r.result = {state, result:{model, answers:{role:{type, noul}}, usage}} — no model_version.
function wire(nouls, model = 'jev-1.13.0') { return {state: 'Completed', result: {model, answers: Object.fromEntries(ROLES.map((k, i) => [k, {type: 'noul', noul: nouls[i]}])), usage: {input_tokens: 600, output_tokens: 20}}}; }
function fakeRows(requests, goldById, {model} = {}) {
  return requests.map((r, i) => {
    const g = goldById[r.caseId];
    const nouls = g.needsReview ? [0.5, 0.5, 0.5, 0.02] : ROLES.map(k => (g.roles[k] ? 0.93 : 0.03 + (i % 3) * 0.01));
    return {rawKey: r.rawKey, ms: 300 + i, response: wire(nouls, model)};
  });
}

async function tmp() { return mkdtemp(join(tmpdir(), 'jev-cue-pilot-test-')); }

test('cases.json: exactly 24 real cases that rebuild byte-for-byte from source-packs, every gold row reconciled, template overlap refused', async () => {
  await assertCaseSet(casesDoc.cases);
  assert.equal(casesDoc.cases.length, 24);
  // PLAN steps 5-6 / D10-D11: every eng row is dual-labelled (reviewer a+d, agreement boolean) after the blind relabel;
  // a missing label is never recorded as a disagreement. spa mirrors eng. Scoring refuses anything else (assertGold).
  const key = c => `${c.meta.split}|${c.input.source.unitId}`;
  const eng = new Map(casesDoc.cases.filter(c => c.input.language === 'eng').map(c => [key(c), c.gold]));
  const status = goldStatus(casesDoc.cases);
  for (const c of casesDoc.cases) {
    assert.ok(c.gold && ROLES.every(k => typeof c.gold.roles[k] === 'boolean') && typeof c.gold.needsReview === 'boolean' && c.gold.reason, c.caseId);
    assert.doesNotMatch(c.gold.reason, MISSING_LABEL, `${c.caseId}: a missing label is not a disagreement`);
    assert.equal(status.get(c.caseId), 'reconciled', c.caseId);
    if (c.input.language === 'eng') {
      assert.equal(typeof c.gold.agreement, 'boolean', c.caseId);
      assert.match(c.gold.reviewer, /^[^\s+]+\+[^\s+]+$/, c.caseId);
      if (c.gold.agreement === false) { assert.equal(c.gold.needsReview, true, c.caseId); assert.match(c.gold.reason, /^DISAGREE — A: \S.* \| D: \S/, c.caseId); }
      continue;
    }
    assert.match(c.gold.reviewer, /^mirror-eng\+backtranslation:\S+$/);
    assert.ok(c.gold.backTranslation.trim() && typeof c.gold.divergent === 'boolean', c.caseId);
    if (!c.gold.divergent) { assert.deepEqual(c.gold.roles, eng.get(key(c)).roles, c.caseId); assert.equal(c.gold.needsReview, eng.get(key(c)).needsReview, c.caseId); }
  }
  assert.doesNotThrow(() => assertGold(casesDoc.cases), 'held-out scoring is not refused at head');
  execFileSync(process.execPath, [fileURLToPath(new URL('cases.mjs', here)), '--check'], {stdio: 'pipe'});
  const tampered = structuredClone(casesDoc.cases);
  const dev = tampered.find(c => c.meta.split === 'dev'), held = tampered.find(c => c.meta.split === 'heldout');
  held.input.source = {...dev.input.source}; held.meta.templateSha256 = dev.meta.templateSha256;
  await assert.rejects(assertCaseSet(tampered), /template-overlap|source-binding/);
});

test('requests capture the adapter state exactly and bind rawKey to the pass', async () => {
  const cases = casesDoc.cases.slice(0, 2);
  const [a] = await captureRequests(cases, {fixed, pass: 1});
  const parsed = JSON.parse(a.state);
  assert.deepEqual(parsed.input, JSON.parse(canonical(cases[0].input)));
  assert.equal(typeof parsed.task, 'string');
  assert.deepEqual(Object.keys(a.questions).sort(), [...ROLES].sort());
  assert.equal(a.model, 'typesafe/jev');
  assert.equal(a.rawKey, await rawKeyFor({model: a.model, state: a.state, questions: a.questions, pass: 1}));
  const [b] = await captureRequests(cases, {fixed, pass: 2});
  assert.equal(b.state, a.state); assert.notEqual(b.rawKey, a.rawKey);
  const [again] = await captureRequests(cases, {fixed, pass: 1});
  assert.equal(again.rawKey, a.rawKey);
});

test('D5 bootstrap calibration reaches the provider; D4 normalizes a wire carrying only `model`', async () => {
  const c = casesDoc.cases[1];
  let calls = 0;
  const plain = await composeAdapter({fixed, AI: {run() { calls++; return wire([0.1, 0.9, 0.9, 0.0]); }}, calibration: await bootstrapCalibration(fixed, 'eng'), modelRevision: BOOTSTRAP_MODEL_REVISION});
  const raw = await plain.decide(c.input);
  assert.equal(calls, 1, 'bootstrap bands must not short-circuit to calibration-unavailable');
  assert.equal(raw.reason, 'provider-model-version-unverified', 'without D4 the live wire never verifies');
  const cal = await calibrationRecord({fixed, language: 'eng', modelRevision: 'jev-1.13.0', bands: {falseMax: 0.2, trueMin: 0.8}, policySha256: 'c'.repeat(64)});
  const normalized = await composeAdapter({fixed, AI: {run: () => normalizeJevResponse(wire([0.1, 0.9, 0.9, 0.0]))}, calibration: cal, modelRevision: 'jev-1.13.0'});
  const e = await normalized.decide(c.input);
  assert.equal(e.status, 'resolved'); assert.equal(e.provenance.modelVersion, 'jev-1.13.0');
  assert.deepEqual(e.decision.roles, R(false, true, true, false));
  const boot = await composeAdapter({fixed, AI: {run: () => normalizeJevResponse(wire([0.1, 0.9, 0.9, 0.0]))}, calibration: await bootstrapCalibration(fixed, 'eng'), modelRevision: 'jev-1.13.0'});
  const b = await boot.decide(c.input);
  assert.equal(b.status, 'unknown'); assert.equal(b.reason, 'ambiguous-role'); assert.equal(b.provenance.probabilities.discussionRequested, 0.9);
  assert.equal(normalizeJevResponse({model: 'm', answers: {}}).model_version, 'm');
  assert.equal(normalizeJevResponse({version: 'v', model: 'm', answers: {}}).model_version, 'v');
});

test('ceilings abort before any call', async () => {
  const q = Object.fromEntries(ROLES.map(k => [k, {}]));
  const req = (i, extra = {}) => ({caseId: `c${i}`, estTokens: 100, estInputTokens: 600, questions: q, ...extra});
  assert.throws(() => checkRequestCeilings(Array.from({length: 25}, (_, i) => req(i))), /cases-per-pass/);
  assert.throws(() => checkRequestCeilings([req(0, {estTokens: 501})]), /oversize/);
  assert.throws(() => checkRequestCeilings([req(0, {estInputTokens: 2001})]), /input-per-call/);
  assert.throws(() => checkRequestCeilings([req(0, {questions: {...q, extra: {}}}), ...Array.from({length: 23}, (_, i) => req(i + 1))]), /questions-per-pass/);
  assert.throws(() => checkRequestCeilings(Array.from({length: 17}, (_, i) => req(i)), {priorCalls: 24}), /total-calls/);
  assert.deepEqual(checkRequestCeilings(Array.from({length: 16}, (_, i) => req(i)), {priorCalls: 24}), {calls: 16, questions: 64, estInputTokens: 9600});
  assert.equal(CEILINGS.totalCalls, 40); assert.equal(CEILINGS.cumulativeInputTokens, 48000);
});

test('import: probe aborts on a response without `model`; usage ceilings are reported; raw cache is immutable', async () => {
  const dir = await tmp();
  try {
    const requests = await captureRequests(casesDoc.cases.slice(0, 3), {fixed, pass: 1});
    await writeFile(requestsFile(dir, 1), JSON.stringify(requests));
    const bad = {rawKey: requests[0].rawKey, ms: 1, response: {state: 'Completed', result: {answers: wire([0, 0, 0, 0]).result.answers}}};
    await assert.rejects(importRows([bad], {evidenceDir: dir}), /probe-failed.*1 new row/);
    await assert.rejects(readdir(join(dir, 'raw')), /ENOENT/);
    assert.equal((await readdir(join(dir, REFUSED_DIR))).length, 1, 'the refused probe is kept as a paid call');
    const rows = requests.map((r, i) => ({rawKey: r.rawKey, ms: 10, response: wire([0.1, 0.1, 0.1, 0.1])}));
    rows[1].response.result.usage.input_tokens = 2500;
    rows[2] = {rawKey: requests[2].rawKey, ms: 5, response: null, error: 'fixture failure'};
    const r = await importRows(rows, {evidenceDir: dir});
    assert.equal(r.written.length, 3);
    assert.ok(r.breaches.some(b => b.startsWith('input-per-call')));
    assert.equal(r.usage.calls, 4, 'refused probe + 3'); assert.ok(r.breaches.includes('duplicate-calls:1'), 'request 0 was paid for twice');
    assert.equal(r.spend, null); assert.match(r.warnings.join(), /^spend-unchecked/, 'no rates: the spend check is loudly skipped');
    const priced = await importRows(rows, {evidenceDir: dir, rates: {ratePerMTokIn: 1e6, ratePerMTokOut: 0, spendCeiling: 1}});
    assert.ok(priced.breaches.includes('computed-spend-over-abort-fraction'));
    assert.ok(priced.spend.percentOfCeiling > 5); assert.equal(priced.warnings.length, 0);
    assert.deepEqual(priced.reimported, requests.map(q => q.rawKey), 're-importing the same rows is not a call');
    const cheap = await importRows(rows, {evidenceDir: dir, rates: {ratePerMTokIn: 1, ratePerMTokOut: 1, spendCeiling: 1e6}});
    assert.ok(cheap.spend.percentOfCeiling < 5 && !cheap.breaches.includes('computed-spend-over-abort-fraction'));
    assert.equal(cheap.usage.calls, 4);
    assert.ok(JSON.parse(await readFile(join(dir, BREACH_FILE), 'utf8')).breaches.includes('computed-spend-over-abort-fraction'), 'the spend breach outlives the run that saw the rates');
    await assert.rejects(main(['--phase', 'snippet', '--probe', '--evidence-dir', dir], {log() {}}), /ceiling-breached/);
    await assert.rejects(importRows([{rawKey: 'f'.repeat(64), ms: 1, response: wire([0, 0, 0, 0])}], {evidenceDir: dir}), /unknown-rawKey/);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('gate 6: derive/score need --language, and spa is refused until every spa row is mirror-eng + back-translation gold', async () => {
  const ungolded = {...casesDoc, cases: casesDoc.cases.map(c => ({...c, gold: null}))};
  assert.throws(() => assertLanguageAllowed(ungolded.cases, 'spa'), /spa-gold-refused/);
  assertLanguageAllowed(casesDoc.cases, 'spa'); // the committed reconciled gold passes gate 6
  assert.throws(() => assertLanguageAllowed(casesDoc.cases, 'fra'), /eng or spa/);
  assertLanguageAllowed(casesDoc.cases, 'eng');
  const ok = withGold(casesDoc).cases;
  assertLanguageAllowed(ok, 'spa');
  const noBack = withGold(casesDoc, c => ({...fixtureGold(c), backTranslation: c.input.language === 'spa' && c.meta.split === 'dev' ? '' : 'x'})).cases;
  assert.throws(() => assertLanguageAllowed(noBack, 'spa'), /spa-gold-refused/);
  const cookOnly = withGold(casesDoc, c => ({...fixtureGold(c), reviewer: 'cookA'})).cases;
  assert.throws(() => assertLanguageAllowed(cookOnly, 'spa'), /spa-gold-refused/);
  const dir = await tmp();
  try {
    await writeFile(join(dir, 'cases.json'), JSON.stringify(ungolded));
    const common = ['--cases', join(dir, 'cases.json'), '--evidence-dir', dir, '--calibration', join(dir, 'cal.json')];
    await assert.rejects(main(['--phase', 'derive', ...common], {log() {}}), /requires --language/);
    await assert.rejects(main(['--phase', 'score', '--language', 'spa', ...common], {log() {}}), /spa-gold-refused/);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('end to end offline: requests → fake connector rows → import → derive → score → report; replay reproduces metrics.json byte-for-byte', async () => {
  const dir = await tmp();
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw Error('network-forbidden-in-tests'); };
  try {
    const doc = withGold(casesDoc);
    const goldById = Object.fromEntries(doc.cases.map(c => [c.caseId, c.gold]));
    await writeFile(join(dir, 'cases.json'), JSON.stringify(doc));
    const common = ['--cases', join(dir, 'cases.json'), '--evidence-dir', join(dir, 'ev'), '--calibration', join(dir, 'calibration.json')];
    const quiet = {log() {}, warn() {}};
    assert.equal(await main(['--phase', 'requests', '--set', 'all', ...common], quiet), 0);
    const p1 = JSON.parse(await readFile(requestsFile(join(dir, 'ev'), 1), 'utf8'));
    assert.equal(p1.length, 24);
    assert.equal(await main(['--phase', 'requests', '--pass', '2', ...common], quiet), 0);
    const p2 = JSON.parse(await readFile(requestsFile(join(dir, 'ev'), 2), 'utf8'));
    assert.equal(p2.length, 16);
    await writeFile(join(dir, 'out1.json'), JSON.stringify(fakeRows(p1, goldById)));
    await writeFile(join(dir, 'out2.json'), JSON.stringify(fakeRows(p2, goldById)));
    assert.equal(await main(['--phase', 'import', '--from', join(dir, 'out1.json'), ...common], quiet), 0);
    assert.equal(await main(['--phase', 'import', '--pass', '2', '--from', join(dir, 'out2.json'), ...common], quiet), 0);
    for (const language of ['eng', 'spa']) {
      assert.equal(await main(['--phase', 'derive', '--language', language, ...common], quiet), 0);
      assert.equal(await main(['--phase', 'score', '--language', language, ...common], quiet), 0);
    }
    const cal = JSON.parse(await readFile(join(dir, 'calibration.json'), 'utf8'));
    assert.equal(cal.languages.eng.status, 'calibrated');
    assert.equal(cal.languages.eng.record.modelRevision, 'jev-1.13.0');
    assert.equal(cal.languages.eng.record.falseMax, 0.1); assert.equal(cal.languages.eng.record.trueMin, 0.88);
    assert.equal(await main(['--phase', 'report', ...common], quiet), 0);
    const metricsText = await readFile(join(dir, 'ev', 'metrics.json'), 'utf8');
    const m = JSON.parse(metricsText);
    const B = m.languages.eng.sets.heldout.B, A = m.languages.eng.sets.heldout.A, C = m.languages.eng.sets.heldout.C;
    assert.equal(B.seriousCount, 0); assert.equal(B.flips.length, 0); assert.equal(B.needsReview.handled, 1);
    assert.equal(A.resolved, 1, 'arm A resolves only the descriptive-list item on held-out');
    assert.equal(B.tokens.calls, 7, 'arm B calls only where rules abstain (8 held-out, 1 rule hit)');
    assert.equal(m.languages.eng.sets.heldout.D.tokens.calls, 8);
    assert.ok(C.seriousCount > 0, 'naive flags make serious errors on the traps');
    assert.equal(m.languages.eng.verdicts.resourceLookupRequested.overall.verdict, 'REVIEW');
    assert.ok(m.languages.eng.verdicts.resourceLookupRequested.overall.reasons.includes('cost-unpriced'));
    assert.equal(m.keys.length, 24); assert.ok(m.keys.every(k => /^[a-f0-9]{64}$/.test(k.rawKeyPass1)));
    const lines = [];
    assert.equal(await main(['--phase', 'replay', ...common], {log: x => lines.push(x)}), 0);
    assert.match(lines.join('\n'), /identical, 0 network calls/);
    assert.equal(await main(['--phase', 'report', ...common], quiet), 0);
    assert.equal(await readFile(join(dir, 'ev', 'metrics.json'), 'utf8'), metricsText);
    assert.deepEqual(m.measurement, LATENCY_MEASUREMENT); assert.match(m.measurement.latency, /concurrency <= 6/);
    // Priced report: metrics.json lands in the cookbook, so it carries the ratio and review minutes, never an amount.
    assert.equal(await main(['--phase', 'report', '--rate-in', '0.5', '--rate-out', '2', '--minute-rate', '0.75', ...common], quiet), 0);
    const priced = await readFile(join(dir, 'ev', 'metrics.json'), 'utf8');
    assert.doesNotMatch(priced, /aiCost|reviewOnlyPerCase|"costPerCorrect"/);
    const pm = JSON.parse(priced);
    for (const L of Object.values(pm.languages)) for (const S of Object.values(L.sets)) for (const arm of Object.values(S)) assert.deepEqual(Object.keys(arm.cost).sort(), ['costPerCorrectRatio', 'priced', 'reviewMinutes']);
  } finally { globalThis.fetch = realFetch; await rm(dir, {recursive: true, force: true}); }
});

test('fail closed: derive, score (B/D) and report refuse a missing or empty raw cache; nothing is written', async () => {
  const dir = await tmp();
  try {
    await writeFile(join(dir, 'cases.json'), JSON.stringify(withGold(casesDoc)));
    const ev = join(dir, 'ev');
    const common = ['--cases', join(dir, 'cases.json'), '--evidence-dir', ev, '--calibration', join(dir, 'calibration.json')];
    const quiet = {log() {}, warn() {}};
    assert.equal(await main(['--phase', 'requests', '--set', 'all', ...common], quiet), 0);
    await assert.rejects(loadRawCache(join(ev, 'raw'), {required: true}), /raw-cache-missing/);
    assert.equal((await loadRawCache(join(ev, 'raw'))).size, 0, 'pre-import gates still read a missing dir as empty');
    for (const phase of [['derive', '--language', 'eng'], ['score', '--language', 'eng'], ['score', '--language', 'eng', '--arm', 'B'], ['score', '--language', 'eng', '--arm', 'D', '--set', 'heldout', '--pass', '2'], ['report']]) {
      await assert.rejects(main(['--phase', ...phase, ...common], quiet), /raw-cache-missing/, phase.join(' '));
    }
    await mkdir(join(ev, 'raw'));
    await writeFile(join(ev, 'raw', 'notes.txt'), 'not a record');
    await assert.rejects(main(['--phase', 'score', '--language', 'eng', ...common], quiet), /raw-cache-empty/);
    await assert.rejects(main(['--phase', 'report', ...common], quiet), /raw-cache-empty/);
    assert.deepEqual((await readdir(ev)).sort(), ['raw', 'requests.json'], 'no decisions or metrics.json written');
    // Arms A and C make no provider call, so they still score without a raw cache.
    assert.equal(await main(['--phase', 'score', '--language', 'eng', '--arm', 'C', '--set', 'dev', ...common], quiet), 0);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('fail closed: pass-2 raw records without evidence/requests-pass2.json refuse score and report instead of flips=0', async () => {
  const dir = await tmp();
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw Error('network-forbidden-in-tests'); };
  try {
    const doc = withGold(casesDoc);
    const goldById = Object.fromEntries(doc.cases.map(c => [c.caseId, c.gold]));
    await writeFile(join(dir, 'cases.json'), JSON.stringify(doc));
    const ev = join(dir, 'ev');
    const common = ['--cases', join(dir, 'cases.json'), '--evidence-dir', ev, '--calibration', join(dir, 'calibration.json')];
    const quiet = {log() {}, warn() {}};
    assert.equal(await main(['--phase', 'requests', '--set', 'all', ...common], quiet), 0);
    assert.equal(await main(['--phase', 'requests', '--pass', '2', ...common], quiet), 0);
    const p1 = JSON.parse(await readFile(requestsFile(ev, 1), 'utf8')), p2 = JSON.parse(await readFile(requestsFile(ev, 2), 'utf8'));
    await writeFile(join(dir, 'out1.json'), JSON.stringify(fakeRows(p1, goldById)));
    await writeFile(join(dir, 'out2.json'), JSON.stringify(fakeRows(p2, goldById)));
    assert.equal(await main(['--phase', 'import', '--from', join(dir, 'out1.json'), ...common], quiet), 0);
    assert.equal(await main(['--phase', 'import', '--pass', '2', '--from', join(dir, 'out2.json'), ...common], quiet), 0);
    assert.equal(await main(['--phase', 'derive', '--language', 'eng', ...common], quiet), 0);
    const p2Text = await readFile(requestsFile(ev, 2), 'utf8');
    await rm(requestsFile(ev, 2));
    await assert.rejects(main(['--phase', 'score', '--language', 'eng', ...common], quiet), /requests-pass2-missing/);
    await assert.rejects(main(['--phase', 'score', '--language', 'eng', '--arm', 'B', '--set', 'heldout', ...common], quiet), /requests-pass2-missing/);
    await assert.rejects(readdir(join(ev, 'decisions')), /ENOENT/, 'refused before any decisions file is written');
    // An explicit pass-1 score does not read pass 2; the report still refuses, so flips never read as 0.
    assert.equal(await main(['--phase', 'score', '--language', 'eng', '--pass', '1', ...common], quiet), 0);
    await assert.rejects(main(['--phase', 'report', ...common], quiet), /requests-pass2-missing/);
    await assert.rejects(readFile(join(ev, 'metrics.json')), /ENOENT/);
    // Regenerating pass 2 is deterministic: the same bytes, and score + report then run with the rerun.
    assert.equal(await main(['--phase', 'requests', '--pass', '2', ...common], quiet), 0);
    assert.equal(await readFile(requestsFile(ev, 2), 'utf8'), p2Text);
    assert.equal(await main(['--phase', 'score', '--language', 'eng', ...common], quiet), 0);
    assert.equal(await main(['--phase', 'report', ...common], quiet), 0);
    assert.equal(JSON.parse(await readFile(join(ev, 'metrics.json'), 'utf8')).languages.eng.sets.heldout.B.rerun, true);
  } finally { globalThis.fetch = realFetch; await rm(dir, {recursive: true, force: true}); }
});

test('a flip between held-out pass 1 and the rerun is a serious error', async () => {
  const c = casesDoc.cases[8], gold = {roles: R(true, false, false, false), needsReview: false};
  const env = roles => ({status: 'resolved', reason: 'calibrated-cue-roles', decision: {roles}});
  const s = scoreSet({cases: [{...c, gold}], envelopes: {[c.caseId]: env(R(true, false, false, false))}, rerun: {[c.caseId]: {status: 'unknown', reason: 'ambiguous-role', decision: null}}});
  assert.deepEqual(s.flips, [c.caseId]); assert.ok(s.seriousErrors.some(e => e.kind === 'flip'));
});

test('DoD 8 needsReview rule and DoD 7 serious-error classes', () => {
  const nr = {caseId: 'x', gold: {roles: R(false, false, false, false), needsReview: true}};
  assert.equal(needsReviewCorrect({status: 'unknown', reason: 'ambiguous-role'}), true);
  assert.equal(needsReviewCorrect({status: 'invalid', reason: 'input-invalid'}), true);
  assert.equal(needsReviewCorrect({status: 'invalid', reason: 'provider-response-invalid'}), false);
  assert.deepEqual(seriousErrors(nr, {status: 'resolved', decision: {roles: R(false, false, false, false)}}), ['needs-review-resolved']);
  assert.deepEqual(seriousErrors(nr, {status: 'unknown'}), []);
  const sub = {caseId: 'y', gold: {roles: R(false, true, true, false), needsReview: false}};
  assert.deepEqual(seriousErrors(sub, {status: 'resolved', decision: {roles: R(false, false, false, true)}}).sort(), ['dropped-discussionRequested', 'dropped-resourceLookupRequested', 'resolved-wrong', 'substantive-as-pause-only']);
  const s = scoreSet({cases: [nr, sub], envelopes: {x: {status: 'unknown', reason: 'ambiguous-role'}, y: {status: 'unknown', reason: 'ambiguous-role'}}});
  assert.equal(s.scoredForRoles, 1, 'needsReview cases are excluded from role P/R');
  assert.equal(s.roles.discussionRequested.recall, 0); assert.equal(s.roles.discussionRequested.precision, null);
  assert.deepEqual(s.abstentions, {'unknown:ambiguous-role': 2}); assert.equal(s.needsReview.handled, 1);
});

test('§8 verdicts: gain without errors and under the review-only cost expands; a serious error or no gain does not', () => {
  const base = {cases: 4, abstained: 1, coverage: 0.75, seriousErrors: [], seriousCount: 0, flips: [], tokens: {input: 2400, output: 80}, correctResolved: 3, roles: Object.fromEntries(ROLES.map(k => [k, {correctResolved: 3}]))};
  const armA = {...base, coverage: 0.25, seriousCount: 0, roles: Object.fromEntries(ROLES.map(k => [k, {correctResolved: 1}]))};
  const cheap = costTerms(base, {ratePerMTokIn: 0.01, ratePerMTokOut: 0.01, minuteRate: 1});
  assert.equal(verdict({role: 'discussionRequested', armA, armB: base, costB: cheap}).verdict, 'EXPAND-TESTING');
  assert.equal(verdict({role: 'discussionRequested', armA, armB: {...base, seriousErrors: [{caseId: 'z', kind: 'resolved-wrong'}], seriousCount: 1}, costB: cheap}).verdict, 'REVIEW');
  assert.equal(verdict({role: 'discussionRequested', armA: base, armB: base, costB: cheap}).verdict, 'RETAIN-RULES');
  assert.equal(verdict({role: 'discussionRequested', armA, armB: base, costB: cheap, uncalibratable: true}).verdict, 'REVIEW');
  assert.equal(verdict({role: 'discussionRequested', armA, armB: base, costB: costTerms(base)}).reasons[0], 'cost-unpriced');
  // No currency amount leaves costTerms: only review minutes and the unitless ratio to the review-only alternative.
  assert.deepEqual(Object.keys(cheap).sort(), ['costPerCorrectRatio', 'priced', 'reviewMinutes']);
  assert.ok(cheap.costPerCorrectRatio > 0 && cheap.costPerCorrectRatio <= 1);
  const dear = costTerms(base, {ratePerMTokIn: 1e6, ratePerMTokOut: 1e6, minuteRate: 1});
  assert.ok(dear.costPerCorrectRatio > 1);
  assert.deepEqual(verdict({role: 'discussionRequested', armA, armB: base, costB: dear}).reasons, ['cost-over-review-only']);
  assert.equal(costTerms({...base, correctResolved: 0}, {ratePerMTokIn: 1, ratePerMTokOut: 1, minuteRate: 1}).costPerCorrectRatio, null);
});

test('connector snippet: ≤ 8 per batch, concurrency ≤ 6, verified wire path and body, no retries', async () => {
  const all = await captureRequests(casesDoc.cases.slice(0, 9), {fixed, pass: 1});
  const requests = all.slice(1); // batch 0 starts after the probe (request 0)
  const code = await snippetFor(all, 0);
  let active = 0, peak = 0, calls = 0;
  const cloudflare = {async request(opts) {
    const n = ++calls; active++; peak = Math.max(peak, active);
    assert.equal(opts.method, 'POST'); assert.equal(opts.path, '/accounts/acct/ai/run');
    assert.equal(opts.body.model, 'typesafe/jev'); assert.deepEqual(Object.keys(opts.body.input).sort(), ['questions', 'state']);
    await new Promise(r => setTimeout(r, 5)); active--;
    if (n === 3) throw Error('fixture failure');
    return {result: wire([0.1, 0.2, 0.3, 0.0])};
  }};
  const fn = new Function('cloudflare', 'accountId', `return (${code});`)(cloudflare, 'acct');
  const out = await fn();
  assert.equal(out.length, 8); assert.equal(calls, 8, 'a failed call is not retried'); assert.ok(peak <= 6);
  assert.deepEqual(out.map(r => r.rawKey), requests.map(r => r.rawKey));
  assert.equal(out.filter(r => r.response === null && r.error).length, 1);
  assert.equal(out.find(r => r.response).response.state, 'Completed');
  const nine = (await snippetFor(all, 0)).replace(/^async \(\) => \{\n  const D = (.*);$/m, (_, d) => `async () => {\n  const D = ${JSON.stringify([...JSON.parse(d), JSON.parse(d)[0]])};`);
  await assert.rejects(new Function('cloudflare', 'accountId', `return (${nine});`)(cloudflare, 'acct')(), /1\.\.8/);
  const probe = await snippetFor(all, 0, {probe: true});
  assert.ok(probe.includes(all[0].rawKey)); assert.equal(probe.includes(all[1].rawKey), false);
  assert.equal(code.includes(all[0].rawKey), false, 'batch 0 never re-fires the probe');
});

test('D6: probe + batches partition each pass, so no request is fired twice; an already-fired request is refused', async () => {
  const fake = n => Array.from({length: n}, (_, i) => ({caseId: `c${i}`, rawKey: String(i).padStart(64, '0'), state: 's', questions: {}}));
  for (const [n, sizes] of [[24, [8, 8, 7]], [16, [8, 7]]]) {
    const reqs = fake(n);
    assert.equal(batchCount(n), sizes.length);
    const batches = sizes.map((_, b) => snippetRequests(reqs, b));
    assert.deepEqual(batches.map(b => b.length), sizes);
    assert.deepEqual([snippetRequests(reqs, 0, {probe: true}), ...batches].flat().map(r => r.caseId), reqs.map(r => r.caseId), 'every request exactly once');
    await assert.rejects(snippetFor(reqs, sizes.length), /batch-empty/);
  }
  await assert.rejects(snippetFor(fake(24), 0, {fired: new Set([fake(24)[3].rawKey])}), /already-fired:c3/);
  assert.throws(() => snippetRequests(fake(24), -1), /batch-invalid/);
});

test('gate 4: a refused batch is still paid for: its rows are kept, counted and never re-fired; no batch before a valid probe', async () => {
  const dir = await tmp();
  try {
    const requests = await captureRequests(casesDoc.cases.slice(0, 3), {fixed, pass: 1});
    await writeFile(requestsFile(dir, 1), JSON.stringify(requests));
    const timeout = i => ({rawKey: requests[i].rawKey, ms: 10000, response: null, error: 'timeout'});
    // A batch cannot be printed before the pass has a valid probe in evidence/raw.
    await assert.rejects(snippetPhase({evidenceDir: dir, batch: 0}), /probe-not-imported/);
    // Path 1: the probe times out; import refuses, but the call is on record, so the probe cannot be fired again.
    await assert.rejects(importRows([timeout(0)], {evidenceDir: dir}), /probe-failed.*1 new row/);
    await assert.rejects(importRows([timeout(0)], {evidenceDir: dir}), /probe-failed.*0 new row/, 're-importing a refused row is not a call');
    await assert.rejects(snippetPhase({evidenceDir: dir, probe: true}), /already-fired/);
    await assert.rejects(main(['--phase', 'snippet', '--probe', '--evidence-dir', dir], {log() {}}), /already-fired/);
    await assert.rejects(snippetPhase({evidenceDir: dir, batch: 0}), /probe-not-imported/);
    // Path 2: a batch fired without an imported probe, row 0 errored: every row is kept and counted.
    await assert.rejects(importRows([timeout(1), {rawKey: requests[2].rawKey, ms: 20, response: wire([0.1, 0.1, 0.1, 0.1])}], {evidenceDir: dir}), /probe-failed.*2 new row/);
    assert.equal((await readdir(join(dir, REFUSED_DIR))).length, 3);
    await assert.rejects(readdir(join(dir, 'raw')), /ENOENT/);
    // A later answer for a request already paid for is a duplicate call and a D7 breach, wherever the first sits.
    const r = await importRows([{rawKey: requests[1].rawKey, ms: 30, response: wire([0.1, 0.1, 0.1, 0.1])}], {evidenceDir: dir});
    assert.equal(r.usage.calls, 4); assert.equal(r.usage.refused, 3); assert.equal(r.usage.input, 2 * 600);
    assert.ok(r.breaches.includes('duplicate-calls:1'));
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('D7: snippet re-checks the observed ceilings and refuses the next paid batch after a breach', async () => {
  const dir = await tmp();
  try {
    const requests = await captureRequests(casesDoc.cases.slice(0, 3), {fixed, pass: 1});
    await writeFile(requestsFile(dir, 1), JSON.stringify(requests));
    const row = (i, ms = 300) => ({rawKey: requests[i].rawKey, ms, response: wire([0.1, 0.1, 0.1, 0.1])});
    assert.deepEqual((await importRows([row(0)], {evidenceDir: dir})).breaches, []);
    assert.match(await snippetPhase({evidenceDir: dir, batch: 0}), new RegExp(requests[1].rawKey), 'clean evidence: the next batch prints');
    // Total calls: a batch that would take the run past 40 calls is refused before it is printed.
    await mkdir(join(dir, REFUSED_DIR), {recursive: true});
    for (let i = 0; i < 38; i++) await writeFile(join(dir, REFUSED_DIR, `filler-${i}.json`), JSON.stringify({rawKey: `filler-${i}`, ms: 1, response: null, error: 'filler'}));
    await assert.rejects(snippetPhase({evidenceDir: dir, batch: 0}), /ceiling:total-calls:41/);
    await rm(join(dir, REFUSED_DIR), {recursive: true});
    // A wall breach recorded by import: the marker stops the next batch, and the evidence alone stops it too.
    const slow = await importRows([row(1, CEILINGS.wallMinutes * 60000)], {evidenceDir: dir});
    assert.ok(slow.breaches.some(b => b.startsWith('wall-minutes:')));
    assert.ok(JSON.parse(await readFile(join(dir, BREACH_FILE), 'utf8')).breaches.some(b => b.startsWith('wall-minutes:')));
    await assert.rejects(snippetPhase({evidenceDir: dir, batch: 0}), /ceiling-breached:wall-minutes/);
    await assert.rejects(main(['--phase', 'snippet', '--batch', '0', '--evidence-dir', dir], {log() {}}), /ceiling-breached/);
    await rm(join(dir, BREACH_FILE));
    await assert.rejects(snippetPhase({evidenceDir: dir, batch: 0}), /ceiling-breached:wall-minutes/, 'recomputed from evidence');
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('snippet data with `$&`, `$\'` or `$`+backtick in unit text is inserted literally', async () => {
  const state = "a $& b $' c $` d $$ e";
  const reqs = [0, 1].map(i => ({caseId: `c${i}`, rawKey: String(i).padStart(64, '0'), state, questions: {q: {type: 'noul'}}}));
  const code = await snippetFor(reqs, 0);
  const seen = [];
  const cloudflare = {async request(opts) { seen.push(opts.body.input.state); return {result: wire([0.1, 0.1, 0.1, 0.1])}; }};
  const out = await new Function('cloudflare', 'accountId', `return (${code});`)(cloudflare, 'acct')();
  assert.deepEqual(seen, [state]); assert.equal(out[0].rawKey, reqs[1].rawKey);
});

test('import: a second paid call for one request keeps the first response, is counted, and the rest of the batch still lands', async () => {
  const dir = await tmp();
  try {
    const requests = await captureRequests(casesDoc.cases.slice(0, 3), {fixed, pass: 1});
    await writeFile(requestsFile(dir, 1), JSON.stringify(requests));
    const row = (i, noul, ms = 300) => ({rawKey: requests[i].rawKey, ms, response: wire([noul, 0.1, 0.1, 0.1])});
    assert.deepEqual((await importRows([row(0, 0.91)], {evidenceDir: dir})).written, [requests[0].rawKey]);
    const firstRaw = await readFile(join(dir, 'raw', `${requests[0].rawKey}.json`), 'utf8');
    // The old probe-then-batch-0 overlap: request 0 answered again with jitter, plus two new requests.
    const r = await importRows([row(0, 0.88, 280), row(1, 0.2), row(2, 0.3)], {evidenceDir: dir});
    assert.deepEqual(r.written, [requests[1].rawKey, requests[2].rawKey]);
    assert.deepEqual(r.duplicates, [requests[0].rawKey]);
    assert.equal(r.usage.calls, 4, 'the duplicate is a paid call'); assert.equal(r.usage.duplicates, 1);
    assert.equal(r.usage.input, 4 * 600);
    assert.ok(r.breaches.includes('duplicate-calls:1'));
    assert.equal(await readFile(join(dir, 'raw', `${requests[0].rawKey}.json`), 'utf8'), firstRaw, 'first response kept');
    assert.equal((await readdir(join(dir, DUPLICATES_DIR))).length, 1);
    const again = await importRows([row(0, 0.88, 280)], {evidenceDir: dir});
    assert.deepEqual(again.duplicates, []); assert.equal(again.usage.calls, 4, 're-importing the duplicate is not another call');
    const slow = await importRows([row(1, 0.25, CEILINGS.wallMinutes * 60000)], {evidenceDir: dir});
    assert.ok(slow.breaches.some(b => b.startsWith('wall-minutes:')), 'summed call time over the wall ceiling is a breach');
    await writeFile(join(dir, 'out.json'), JSON.stringify([row(2, 0.3)]));
    const warns = [];
    assert.equal(await main(['--phase', 'import', '--from', join(dir, 'out.json'), '--evidence-dir', dir], {log() {}, warn: w => warns.push(w)}), 3);
    assert.match(warns.join(), /spend-unchecked/);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('pass 1 requests are written for all 24 cases only: --set dev|heldout is dry-run only (one requests.json)', async () => {
  const dir = await tmp();
  try {
    await assert.rejects(main(['--phase', 'requests', '--set', 'heldout', '--evidence-dir', dir], {log() {}}), /dry-run only/);
    await assert.rejects(readFile(requestsFile(dir, 1)), /ENOENT/);
    const lines = [];
    assert.equal(await main(['--phase', 'requests', '--set', 'dev', '--dry-run', '--evidence-dir', dir], {log: x => lines.push(x)}), 0);
    assert.equal(JSON.parse(lines[1]).calls, 8);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('PLAN step 6 reconciliation: a missing blind label is refused, real disagreements become needsReview, spa re-mirrors (D10)', async () => {
  const isEng = c => c.input.language === 'eng';
  // At head every row is reconciled. Rebuild the pre-step-6 state (each held-out eng row carries one labeler's gold)
  // so the refusal and disagreement paths run on the real rows.
  const cases = structuredClone(casesDoc.cases).map(c => (isEng(c) && c.meta.split === 'heldout' ? {...c, gold: {roles: c.gold.roles, needsReview: c.gold.needsReview, reason: 'fixture A label', reviewer: c.gold.reviewer.split('+')[0], agreement: null}} : c));
  const pending = cases.filter(c => isEng(c) && goldStatus(cases).get(c.caseId) === 'pending');
  assert.equal(pending.length, 8);
  const label = (c, over = {}) => ({caseId: c.caseId, gold: {roles: {...c.gold.roles}, needsReview: c.gold.needsReview, reason: 'fixture blind label', reviewer: 'fixture-cook-d', ...over}});
  const agree = pending.map(c => label(c));
  // Refusals: a missing label, a label that says it is missing, the same labeler twice.
  assert.throws(() => reconcileGold(cases, agree.slice(1)), new RegExp(`gold-label-missing:D:${pending[0].caseId}:missing`));
  assert.throws(() => reconcileGold(cases, agree.map((l, i) => (i ? l : label(pending[0], {reason: 'D: missing'})))), /gold-label-missing:D:/);
  assert.throws(() => reconcileGold(cases, agree.map((l, i) => (i ? l : label(pending[0], {reason: 'missing'})))), /gold-label-missing:D:/);
  assert.throws(() => reconcileGold(cases, agree.map((l, i) => (i ? l : label(pending[0], {reviewer: pending[0].gold.reviewer})))), /same-labeler/);
  // A real second reason that starts with "missing" is a disagreement, not a missing label, and it scores.
  const p0 = pending[0];
  const missingWord = reconcileGold(cases, agree.map((l, i) => (i ? l : label(p0, {reason: 'missing any explicit discussion cue', roles: {...p0.gold.roles, discussionRequested: !p0.gold.roles.discussionRequested}}))));
  assert.match(missingWord.cases.find(c => c.caseId === p0.caseId).gold.reason, /\| D: missing any explicit discussion cue \{/);
  assert.doesNotThrow(() => assertGold(missingWord.cases));
  // Committed gold + a blind label that agrees: needsReview stays only where a labeler put it — the committed
  // needsReview rows (dev S01-U003; held-out S03-U020 by both labelers, S04-U015 and S06-U004 by the blind labeler)
  // and their spa mirrors, nothing more.
  const r = reconcileGold(cases, agree);
  assertGold(r.cases);
  assert.deepEqual([...goldStatus(r.cases).values()].filter(s => s !== 'reconciled'), []);
  const nr = r.cases.filter(c => c.gold.needsReview).map(c => c.caseId).sort();
  assert.deepEqual(nr, casesDoc.cases.filter(c => c.gold.needsReview).map(c => c.caseId).sort());
  assert.deepEqual(nr, ['eng.MRK-1-1-13:S01-U003', 'eng.MRK-1-14-20:S03-U020', 'eng.MRK-1-14-20:S04-U015', 'eng.MRK-1-14-20:S06-U004', 'spa.MRK-1-1-13:S01-U003', 'spa.MRK-1-14-20:S03-U020', 'spa.MRK-1-14-20:S04-U015', 'spa.MRK-1-14-20:S06-U004']);
  for (const c of cases.filter(c => goldStatus(cases).get(c.caseId) === 'reconciled')) assert.deepEqual(r.cases.find(x => x.caseId === c.caseId).gold, c.gold, `${c.caseId} unchanged`);
  // A real disagreement on one held-out row → needsReview with both reasons and D's label; its spa mirror follows.
  const target = 'eng.MRK-1-14-20:S02-U001';
  const t = cases.find(c => c.caseId === target);
  const split = reconcileGold(cases, cases.filter(isEng).map(c => (c.caseId === target ? label(c, {roles: {...c.gold.roles, discussionRequested: true}}) : label(c))).filter(l => pending.some(p => p.caseId === l.caseId) || l.caseId === target));
  const g = split.cases.find(c => c.caseId === target).gold;
  assert.equal(goldStatus(cases).get(target), 'pending');
  assert.equal(g.agreement, false); assert.equal(g.needsReview, true); assert.deepEqual(g.roles, t.gold.roles);
  assert.match(g.reason, /^DISAGREE — A: .+ \| D: fixture blind label \{.*"discussionRequested":true/);
  assert.deepEqual(split.diffs, [{caseId: target, field: 'discussionRequested', a: t.gold.roles.discussionRequested, d: true}]);
  assert.equal(split.cases.find(c => c.caseId === 'spa.MRK-1-14-20:S02-U001').gold.needsReview, true);
  // A divergent spa row keeps its Spanish-meaning label and is marked mirrors:false.
  const div = structuredClone(cases);
  const spaRow = div.find(c => c.caseId === 'spa.MRK-1-14-20:S05-U004');
  spaRow.gold = {...spaRow.gold, roles: R(false, false, true, false), needsReview: false, reason: 'fixture Spanish meaning', divergent: true};
  const dv = reconcileGold(div, agree);
  assert.deepEqual(dv.divergent, ['spa.MRK-1-14-20:S05-U004']);
  assert.deepEqual(dv.cases.find(c => c.caseId === spaRow.caseId).gold.roles, R(false, false, true, false));
  assert.equal(dv.cases.find(c => c.caseId === spaRow.caseId).gold.mirrors, false);
  // Scoring refuses unreconciled rows; --gold-check --write reconciles on disk and refuses a missing label without writing.
  const fx = withGold(casesDoc).cases;
  const pend = structuredClone(fx);
  Object.assign(pend.find(c => c.caseId === target).gold, {reviewer: 'fixture-a', agreement: null});
  await assert.rejects(scoreArm({cases: pend, language: 'eng', set: 'heldout', arm: 'C', fixed}), /gold-unreconciled:.*S02-U001=pending/);
  await assert.rejects(scoreArm({cases: pend, language: 'spa', set: 'heldout', arm: 'C', fixed}), /gold-unreconciled:spa\.MRK-1-14-20:S02-U001=pending/);
  assert.equal(Object.keys((await scoreArm({cases: pend, language: 'eng', set: 'dev', arm: 'C', fixed})).envelopes).length, 4);
  const dir = await tmp();
  try {
    const casesPath = join(dir, 'cases.json'), labelsPath = join(dir, 'labels.json');
    await writeFile(casesPath, JSON.stringify({...casesDoc, cases: pend}));
    const before = await readFile(casesPath, 'utf8');
    await writeFile(labelsPath, JSON.stringify({cases: []}));
    await assert.rejects(main(['--gold-check', '--against', labelsPath, '--write', '--cases', casesPath], {log() {}}), /gold-label-missing:D:eng\.MRK-1-14-20:S02-U001:missing/);
    assert.equal(await readFile(casesPath, 'utf8'), before, 'nothing written on refusal');
    await writeFile(labelsPath, JSON.stringify({cases: [label(pend.find(c => c.caseId === target), {reviewer: 'fixture-d'})]}));
    assert.equal(await main(['--gold-check', '--against', labelsPath, '--write', '--cases', casesPath], {log() {}}), 0);
    const written = JSON.parse(await readFile(casesPath, 'utf8')).cases;
    assert.deepEqual(written.find(c => c.caseId === target).gold, {...pend.find(c => c.caseId === target).gold, reviewer: 'fixture-a+fixture-d', agreement: true});
    assertGold(written);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('REST fallback: token from a 0600 file, verified path/body, connector-shaped rows, no retries', async () => {
  const dir = await tmp();
  try {
    const tokenFile = join(dir, 'token');
    await writeFile(tokenFile, 'fixture-token\n'); await chmod(tokenFile, 0o600);
    const requests = await captureRequests(casesDoc.cases.slice(0, 2), {fixed, pass: 1});
    const seen = [];
    const fetchImpl = async (url, init) => { seen.push({url, init}); return {ok: seen.length === 1, status: seen.length === 1 ? 200 : 500, async json() { return {success: true, result: wire([0.1, 0.1, 0.1, 0.1])}; }}; };
    const out = await fireRequests(requests, {accountId: 'acct', tokenFile, fetchImpl});
    assert.equal(seen.length, 2);
    assert.equal(seen[0].url, 'https://api.cloudflare.com/client/v4/accounts/acct/ai/run');
    assert.deepEqual(Object.keys(JSON.parse(seen[0].init.body)), ['model', 'input']);
    assert.equal(out[0].response.state, 'Completed'); assert.equal(out[0].response.result.model, 'jev-1.13.0');
    assert.equal(out[1].response, null); assert.equal(out[1].error, 'http-500');
    await chmod(tokenFile, 0o644);
    await assert.rejects(fireRequests(requests, {accountId: 'acct', tokenFile, fetchImpl}), /0600/);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('replay provider answers from the raw cache and fails closed on a miss', async () => {
  const [r] = await captureRequests(casesDoc.cases.slice(0, 1), {fixed, pass: 1});
  const cache = new Map([[r.rawKey, {rawKey: r.rawKey, response: wire([0.2, 0.2, 0.2, 0.2])}]]);
  const ai = createReplayAI({cache, pass: 1});
  const got = await ai.run(r.model, {state: r.state, questions: r.questions});
  assert.equal(got.model_version, 'jev-1.13.0'); assert.deepEqual(ai.hits, [r.rawKey]);
  await assert.rejects(createReplayAI({cache, pass: 2}).run(r.model, {state: r.state, questions: r.questions}), /raw-cache-miss/);
  assert.equal(typeof await sha256('x'), 'string');
});
