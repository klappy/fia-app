import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm, readdir, chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ROLES, sha256, canonical} from '../../server/fia/preparation/jev/adapter.mjs';
import {assertCaseSet} from './cases.mjs';
import {main, loadFixed, captureRequests, checkRequestCeilings, composeAdapter, bootstrapCalibration, calibrationRecord, importRows, assertLanguageAllowed, CEILINGS, BOOTSTRAP_MODEL_REVISION, requestsFile, snippetFor} from './run.mjs';
import {createReplayAI, normalizeJevResponse, rawKeyFor} from './providers/replay.mjs';
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
  const gold = {roles: table[id], needsReview, reason: 'fixture', reviewer: 'fixture'};
  if (c.input.language === 'spa') Object.assign(gold, {reviewer: 'mirror-eng+backtranslation:fixture-cook', backTranslation: 'fixture back-translation'});
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

test('cases.json: exactly 24 real cases that rebuild byte-for-byte from source-packs, gold still null, template overlap refused', async () => {
  await assertCaseSet(casesDoc.cases);
  assert.equal(casesDoc.cases.length, 24);
  assert.ok(casesDoc.cases.every(c => c.gold === null));
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
    await assert.rejects(importRows([bad], {evidenceDir: dir}), /probe-failed/);
    await assert.rejects(readdir(join(dir, 'raw')), /ENOENT/);
    const rows = requests.map((r, i) => ({rawKey: r.rawKey, ms: 10, response: wire([0.1, 0.1, 0.1, 0.1])}));
    rows[1].response.result.usage.input_tokens = 2500;
    rows[2] = {rawKey: requests[2].rawKey, ms: 5, response: null, error: 'fixture failure'};
    const r = await importRows(rows, {evidenceDir: dir});
    assert.equal(r.written.length, 3);
    assert.ok(r.breaches.some(b => b.startsWith('input-per-call')));
    const priced = await importRows(rows, {evidenceDir: dir, rates: {ratePerMTokIn: 1e6, ratePerMTokOut: 0, spendCeiling: 1}});
    assert.ok(priced.breaches.includes('computed-spend-over-abort-fraction'));
    await assert.rejects(importRows([{...rows[0], response: wire([0.9, 0.1, 0.1, 0.1])}], {evidenceDir: dir}), /raw-immutable/);
    await assert.rejects(importRows([{rawKey: 'f'.repeat(64), ms: 1, response: wire([0, 0, 0, 0])}], {evidenceDir: dir}), /unknown-rawKey/);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('gate 6: derive/score need --language, and spa is refused until every spa row is mirror-eng + back-translation gold', async () => {
  assert.throws(() => assertLanguageAllowed(casesDoc.cases, 'spa'), /spa-gold-refused/);
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
    await writeFile(join(dir, 'cases.json'), JSON.stringify(casesDoc));
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
    const quiet = {log() {}};
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
});

test('connector snippet: ≤ 8 per batch, concurrency ≤ 6, verified wire path and body, no retries', async () => {
  const requests = await captureRequests(casesDoc.cases.slice(0, 8), {fixed, pass: 1});
  const code = await snippetFor(requests, 0);
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
  const nine = (await snippetFor([...requests, requests[0]], 0)).replace(/^async \(\) => \{\n  const D = (.*);$/m, (_, d) => `async () => {\n  const D = ${JSON.stringify([...JSON.parse(d), JSON.parse(d)[0]])};`);
  await assert.rejects(new Function('cloudflare', 'accountId', `return (${nine});`)(cloudflare, 'acct')(), /1\.\.8/);
  assert.equal((await snippetFor(requests, 0, {probe: true})).includes(requests[1].rawKey), false);
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
