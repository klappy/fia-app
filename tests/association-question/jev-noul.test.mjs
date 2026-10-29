// WIRE TESTS for fia-association-noul@2. Fixtures are hand-written noul values in the documented wire shape; they test the
// question builder, parser, composer, calibration and transport gates. They are never a measure of Jev quality.
// Inputs, gold and split fixtures are copied verbatim from PR289 e67bb5c (four cases).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildRequest} from '../../server/fia/preparation/association-question/request.mjs';
import {buildQuestions, buildFollowUp, composeFollowUp, orderFrom, parseWire, resolveIdentity, VERSIONED_MODEL, compose, wireOf, createRecordedJevWire, createJevNoulTransport, registrationGaps, registeredPlanCalls, LIMITS, QUESTION_SET, TransportError} from '../../server/fia/preparation/association-question/jev-noul.mjs';
import {fitCalibration, tuningProbabilities, labelledPairs} from '../../server/fia/preparation/association-question/jev-calibrate.mjs';
import {runAdapter, main, WIRE_LABEL} from '../../server/fia/preparation/association-question/cli.mjs';
import {INVALID} from '../../server/fia/preparation/association-question/normalize.mjs';
import {buildReport} from '../../server/fia/preparation/association-question/report.mjs';

const fx = new URL('./fixtures/', import.meta.url), here = new URL('../../server/fia/preparation/association-question/', import.meta.url);
const j = async (n, base = fx) => JSON.parse(await readFile(new URL(n, base), 'utf8'));
const inputs = await j('inputs-wire-subset.json'), gold = await j('gold-wire-subset.json'), split = await j('split-wire-subset.json');
const wire = await j('wire-recorded.json'), observed = await j('wire-observed-shape.json');
const registration = await j('jev-noul-registration.json', here), committedCalibration = await j('jev-noul-calibration.json', here);
const caseOf = id => structuredClone(inputs.cases.find(c => c.caseId === id));
const evalDir = new URL('../../scripts/association-eval/', import.meta.url);
const pr289Present = await access(new URL('score.mjs', evalDir)).then(() => true, () => false);
const lukeEval = pr289Present && JSON.parse(await readFile(new URL('gold.json', evalDir), 'utf8')).cases.some(c => c.caseId.startsWith('spa.LUK-'));

test('wire test: questions are built only from the request, deterministically, within the hard caps', async () => {
  const {request} = await buildRequest(caseOf('eng.MRK-1-1-13:S02-U005'));
  const a = buildQuestions(request), b = buildQuestions(request);
  assert.deepEqual(a, b);
  assert.equal(Object.keys(a.questions).length, 1 + 2 * 8 + 3, 'asksVisual + requested/primary per visual + companion per video');
  for (const q of Object.values(a.questions)) { assert.equal(q.type, 'noul'); assert.deepEqual(Object.keys(q.criteria).sort(), ['false', 'true']); }
  assert.equal((await wireOf(a)).wireRequestSha256, (await wireOf(b)).wireRequestSha256);
  assert.deepEqual(Object.values(a.keys), request.candidates.filter(c => c.collection !== 'VideoBibleDictionary').map(c => c.candidateId));
  assert.deepEqual(Object.values(a.videoKeys), request.candidates.filter(c => c.collection === 'VideoBibleDictionary').map(c => c.candidateId));
  // Gold answers never enter the questions: the gold primary/requested sets appear nowhere as labels.
  const g = gold.cases.find(c => c.caseId === 'eng.MRK-1-1-13:S02-U005');
  assert.ok(!JSON.stringify(a).includes(JSON.stringify(g.output.association.requested)));
  assert.ok(!JSON.stringify(a).includes('S02-U005-resource-'));
  // Caps: 16 visual candidates exceed the question cap; an oversized unit exceeds the state cap. Neither is sent.
  const many = structuredClone(request); many.candidates = Array.from({length: 16}, (_, i) => ({candidateId: `FIAImages:x${i}`, collection: 'FIAImages', id: `x${i}`}));
  many.input.candidates = many.candidates.map(c => ({collection: c.collection, id: c.id, title: 't'}));
  assert.deepEqual(buildQuestions(many), {refused: 'question-cap', visualCandidates: 16, videoCandidates: 0});
  const vids = structuredClone(request); vids.candidates = Array.from({length: 5}, (_, i) => ({candidateId: `VideoBibleDictionary:v${i}`, collection: 'VideoBibleDictionary', id: `v${i}`}));
  vids.input.candidates = vids.candidates.map(c => ({collection: c.collection, id: c.id, title: 't'}));
  assert.equal(buildQuestions(vids).refused, 'question-cap', 'more than 4 video candidates is not sent');
  const big = structuredClone(request); big.input.source.unit.text = 'x'.repeat(LIMITS.maxStateBytes);
  assert.equal(buildQuestions(big).refused, 'input-limit');
  assert.equal(LIMITS.maxQuestions, 1 + 2 * LIMITS.maxVisualCandidates + LIMITS.maxVideoCandidates);
  assert.ok(LIMITS.maxOrderedRequested * (LIMITS.maxOrderedRequested - 1) / 2 <= LIMITS.maxQuestions);
});

test('wire test: parser accepts the documented shape (bare or under result) and refuses anything else', async () => {
  const q = {asksVisual: {}, requested_0: {}};
  const pw = parseWire({model_version: 'v', answers: {asksVisual: {noul: 0.2}, requested_0: {type: 'noul', noul: 1}}}, q);
  assert.deepEqual([pw.probabilities, pw.modelVersion, pw.observedModel], [{asksVisual: 0.2, requested_0: 1}, 'v', null]);
  assert.equal(parseWire({result: {version: 'v2', answers: {asksVisual: {noul: 0}, requested_0: {noul: 0}}}}, q).modelVersion, 'v2');
  assert.equal(parseWire({state: 'Completed', result: {model: 'jev-1.13.0', answers: {asksVisual: {noul: 0}, requested_0: {noul: 0}}}}, q).modelVersion, 'jev-1.13.0', 'a versioned result.model is an identity (Terry 8ec3901)');
  for (const [raw, reason] of [
    [null, 'not-object'], [{}, 'answers-missing'],
    [{answers: {asksVisual: {noul: 0}}}, 'answers-keys-mismatch'],
    [{answers: {asksVisual: {noul: 0}, requested_0: {noul: 0}, extra: {noul: 0}}}, 'answers-keys-mismatch'],
    [{answers: {asksVisual: {noul: 1.2}, requested_0: {noul: 0}}}, 'noul-range:asksVisual'],
    [{answers: {asksVisual: {noul: '0.5'}, requested_0: {noul: 0}}}, 'noul-range:asksVisual'],
    [{answers: {asksVisual: {noul: 0, why: 'x'}, requested_0: {noul: 0}}}, 'answer-shape:asksVisual'],
    [{answers: {asksVisual: {noul: 0, type: 'boolean'}, requested_0: {noul: 0}}}, 'answer-shape:asksVisual']
  ]) assert.deepEqual(parseWire(raw, q), {invalid: reason}, JSON.stringify(raw));
});

test('wire test: composition is deterministic and abstains on the uncertain band', () => {
  const keys = {0: 'FIAImages:a1', 1: 'FIAMaps:c1'}, bands = {falseMax: 0.2, trueMin: 0.8};
  const p = o => ({asksVisual: 0.9, requested_0: 0.9, requested_1: 0.1, primary_0: 0.9, primary_1: 0.1, ...o});
  assert.deepEqual(compose(p(), keys, bands).raw, {decision: 'associate', association: {requested: [{collection: 'FIAImages', id: 'a1'}], optionalCompanions: [], companionPairs: null},
    display: {primaryCollection: 'FIAImages', primaryAssetId: 'a1', relatedAssetIds: null, insertions: null}});
  assert.equal(compose(p({asksVisual: 0.5}), keys, bands).reason, 'asks-visual-uncertain');
  assert.equal(compose(p({requested_1: 0.5}), keys, bands).reason, 'requested-uncertain');
  assert.equal(compose(p({requested_0: 0.1}), keys, bands).reason, 'no-confident-candidate');
  assert.equal(compose(p({asksVisual: 0.1}), keys, bands).reason, 'contradiction-none-with-requested');
  assert.equal(compose(p({asksVisual: 0.1, requested_0: 0.1}), keys, bands).raw.decision, 'none');
  assert.equal(compose(p({primary_0: 0.5}), keys, bands).raw.display.primaryAssetId, null, 'primary undecided stays null');
  assert.equal(compose(p({requested_1: 0.9, primary_1: 0.9}), keys, bands).raw.display.primaryAssetId, null, 'two primaries: undecided');
  assert.deepEqual(compose(p({asksVisual: 0.5}), keys, bands).raw, {decision: 'abstain', association: null, display: null});
});

test('wire test: calibration fits per language on tuning semantic-residue only and refuses held-out or exact-source cases', async () => {
  const t = await tuningProbabilities({inputs, gold, split, wireFile: wire});
  assert.deepEqual(t.cases.map(c => c.caseId), ['eng.MRK-1-1-13:S02-U005', 'eng.MRK-2-1-12:S02-U004'], 'held-out and inline cases are never fit on');
  assert.equal(t.modelRevision, 'jev-fixture-1');
  const cal = await fitCalibration({...t, source: {wireLabel: wire.label}});
  assert.deepEqual({...cal.languages.eng, caseIds: undefined}, {status: 'calibrated', falseMax: 0.12, trueMin: 0.8, tuningCases: 2, caseIds: undefined, truePairs: 8, falsePairs: 27});
  assert.ok(Object.keys(t.cases[0].probabilities).includes('before_1_5'), 'call 2 (order) is read in pass 2');
  assert.equal(cal.languages.spa, undefined, 'no Spanish semantic tuning case in this fixture: Spanish is uncalibrated');
  const one = t.cases[0];
  await assert.rejects(fitCalibration({cases: [{...one, split: 'heldout'}], modelRevision: 'v'}), /fit-on-non-tuning/);
  await assert.rejects(fitCalibration({cases: [{...one, stratum: 'exact-source-inline'}], modelRevision: 'v'}), /fit-on-exact-source/);
  const overlap = {...one, probabilities: {...one.probabilities, requested_0: 0.99}}; // a false-label candidate above every true label
  assert.equal((await fitCalibration({cases: [overlap], modelRevision: 'v'})).languages.eng.status, 'not-separable');
  assert.equal(labelledPairs({asksVisual: 0.9}, {}, {decision: 'associate', association: {requested: []}, display: {primaryAssetId: null}}).length, 1);
  assert.deepEqual(committedCalibration.languages, {}, 'the committed calibration is uncalibrated');
  await assert.rejects(tuningProbabilities({inputs, gold, split, wireFile: observed}).then(r => { if (!r.cases.length) throw Error('no tuning recordings'); }), /no tuning recordings/);
});

async function calibrationFromFixtures() {
  return fitCalibration({...(await tuningProbabilities({inputs, gold, split, wireFile: wire})), source: {wireLabel: wire.label}});
}

test('wire test: end to end, recorded wire → composer → normalizer gives PR289 decisions; held-out and inline reported apart', async () => {
  const calibration = await calibrationFromFixtures();
  const heldAndInline = {...inputs, cases: inputs.cases.filter(c => ['eng.MRK-1-14-20:S02-U008', 'spa.MRK-4-35-41:S03-U017'].includes(c.caseId))};
  const AI = createRecordedJevWire(wire);
  const transport = createJevNoulTransport({mode: 'recorded-wire', AI, calibration});
  const doc = await runAdapter({casesFile: heldAndInline, transport});
  assert.equal(doc.producer.label, WIRE_LABEL);
  assert.equal(doc.producer.authority, 'model-resolved');
  const byId = Object.fromEntries(doc.decisions.map(d => [d.caseId, d]));
  const held = byId['eng.MRK-1-14-20:S02-U008'];
  assert.deepEqual(held.output, {decision: 'associate', association: {requested: [{collection: 'FIAImages', id: 'a1400'}, {collection: 'FIAMaps', id: 'c4'}],
    optionalCompanions: [{collection: 'VideoBibleDictionary', id: 'a11'}], companionPairs: [{from: {collection: 'FIAImages', id: 'a1400'}, to: {collection: 'VideoBibleDictionary', id: 'a11'}}]},
    display: {primaryCollection: 'FIAMaps', primaryAssetId: 'c4', relatedAssetIds: ['c4', 'a1400'], insertions: [{activityId: 'S02-U008-resource-a1400', assetId: 'a1400', fulfills: 'S02-U008'}]}});
  assert.equal(held.provenance.authority, 'model-resolved'); assert.equal(held.provenance.normalization, 'accepted');
  assert.equal(held.provenance.modelVersion, 'jev-fixture-1');
  for (const c of held.provenance.jev.calls) { assert.match(c.wireRequestSha256, /^[a-f0-9]{64}$/); assert.match(c.wireResponseSha256, /^[a-f0-9]{64}$/); }
  assert.deepEqual(held.provenance.jev.calls.map(c => c.questionCount), [19, 3]); assert.equal(held.provenance.jev.invocations, 2); assert.equal(held.provenance.jev.status, 'composed');
  const inline = byId['spa.MRK-4-35-41:S03-U017'];
  assert.equal(inline.output.decision, 'abstain'); assert.equal(inline.provenance.jev.reason, 'calibration-unavailable'); assert.equal(inline.provenance.jev.invocations, 0);
  assert.equal(transport.calls, 2, 'held-out case: two calls; the uncalibrated language is never sent');
  assert.ok(!JSON.stringify(doc).includes('source-explicit'));
});

test('wire test: the observed 2026-10-06 envelope (versioned model jev-1.13.0) resolves its identity but is refused against the jev-fixture-1 calibration', async () => {
  const calibration = await calibrationFromFixtures();
  const transport = createJevNoulTransport({mode: 'recorded-wire', AI: createRecordedJevWire(observed), calibration});
  const doc = await runAdapter({casesFile: {...inputs, cases: [caseOf('eng.MRK-1-14-20:S02-U008')]}, transport});
  const d = doc.decisions[0];
  assert.equal(d.output.decision, 'abstain');
  assert.equal(d.provenance.jev.reason, 'provider-model-version-unverified');
  assert.equal(d.provenance.jev.observedModel, 'jev-1.13.0');
  assert.equal(d.provenance.modelVersion, 'jev-1.13.0', 'identity recorded from result.model (Terry 8ec3901), never stamped');
  assert.deepEqual(d.provenance.jev.identity.suppliedBy, ['model']);
});

test('wire test: the live transport refuses without registration plus verified entitlement; recorded mode refuses a non-recorded AI', async () => {
  const calibration = await calibrationFromFixtures();
  const fakeAI = {run: async () => { throw Error('must not be called'); }};
  assert.throws(() => createJevNoulTransport({mode: 'live', AI: fakeAI, calibration, registration, entitlement: null}),
    e => e instanceof TransportError && e.reason === 'not-activated:registration-status:registered-not-funded,authorized-calls-below-registered-plan,entitlement-unverified');
  const ok = {verified: true, route: 'r', evidence: 'e'};
  // The ceiling must cover the registered plan (v2: tuning 20 + held-out 16 = 36, up to 2 calls per case), read from the budget.
  assert.equal(registeredPlanCalls(registration), 36);
  for (const n of [1, 17, 18, 35]) assert.deepEqual(registrationGaps({...registration, status: 'registered', authorizedCalls: n}, ok), ['authorized-calls-below-registered-plan'], `${n}`);
  assert.deepEqual(registrationGaps({...registration, status: 'registered', authorizedCalls: 36}, ok), []);
  assert.deepEqual(registrationGaps({...registration, status: 'registered', authorizedCalls: 36, budget: {}}, ok), ['registration-budget-missing']);
  assert.throws(() => createJevNoulTransport({mode: 'live', AI: fakeAI, calibration, registration: {...registration, status: 'registered', authorizedCalls: 35}, entitlement: ok}), /not-activated:authorized-calls-below-registered-plan/);
  const funded = {...registration, status: 'registered', authorizedCalls: 36};
  assert.throws(() => createJevNoulTransport({mode: 'live', AI: fakeAI, calibration, registration: funded, entitlement: {verified: false}}), /not-activated:entitlement-unverified/);
  assert.throws(() => createJevNoulTransport({mode: 'live', AI: null, calibration, registration: funded, entitlement: {verified: true, route: 'r', evidence: 'e'}}), /not-activated:no-ai-binding/);
  assert.deepEqual(registrationGaps({...funded, limits: {...funded.limits, maxQuestions: 99}}, {verified: true, route: 'r', evidence: 'e'}), ['registration-limits-mismatch']);
  assert.throws(() => createJevNoulTransport({mode: 'recorded-wire', AI: fakeAI, calibration}), /recorded-wire-needs-recorded-shim/);
  // The ceiling: funded at 36 (test-only entitlement, recorded shim), 18 two-call cases use all 36 calls and the next call stops.
  const t = createJevNoulTransport({mode: 'live', AI: createRecordedJevWire(wire), calibration, registration: funded, entitlement: {verified: true, route: 'test-only', evidence: 'test-only'}});
  const one = await buildRequest(caseOf('eng.MRK-1-14-20:S02-U008'));
  for (let k = 0; k < 18; k++) await t.respond(one);
  assert.equal(t.calls, 36);
  await assert.rejects(t.respond(one), e => e.reason === 'budget-exhausted');
  assert.equal(t.calls, 36);
  // N1: calibrated bands must be finite, inside [0,1] and ordered (as main's calibrationMatches, adapter.mjs:75).
  for (const bad of [{falseMax: 0.8, trueMin: 0.8}, {falseMax: 0.9, trueMin: 0.2}, {falseMax: -0.1, trueMin: 0.8}, {falseMax: 0.1, trueMin: 1.2}, {falseMax: NaN, trueMin: 0.8}, {falseMax: 0.1, trueMin: Infinity}, {falseMax: '0.1', trueMin: 0.8}]) {
    const c = {...calibration, languages: {...calibration.languages, eng: {...calibration.languages.eng, ...bad}}};
    assert.throws(() => createJevNoulTransport({mode: 'recorded-wire', AI: createRecordedJevWire(wire), calibration: c}), e => e.reason === 'calibration-bands:eng', JSON.stringify(bad));
  }
  assert.doesNotThrow(() => createJevNoulTransport({mode: 'recorded-wire', AI: createRecordedJevWire(wire), calibration: {...calibration, languages: {eng: {status: 'not-separable', falseMax: 0.9, trueMin: 0.2}}}}), 'uncalibrated languages are not used, so they are not band-checked');
  assert.equal(registration.questionSet, QUESTION_SET); assert.equal(registration.authorizedCalls, 0);
  await assert.rejects(main(['--cases', new URL('inputs-wire-subset.json', fx).pathname, '--transport', 'jev', '--out', join(tmpdir(), 'never.json')]), /not-activated/);
});

test('wire test: PR289 score.mjs and the stratified report accept the composed decisions (when PR289 is present)', {skip: !pr289Present && 'PR289 scripts/association-eval not on this base'}, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fia-noul-'));
  try {
    const calibration = await calibrationFromFixtures();
    const {score} = await import(new URL('score.mjs', evalDir));
    const read = async n => JSON.parse(await readFile(new URL(n, evalDir), 'utf8'));
    const fullInputs = await read('inputs.json'), fullGold = await read('gold.json'), fullSplit = await read('split.json');
    const AI = createRecordedJevWire(wire);
    const decisions = await runAdapter({casesFile: {...fullInputs, cases: fullInputs.cases.filter(c => wire.records.some(r => r.caseId === c.caseId))}, transport: createJevNoulTransport({mode: 'recorded-wire', AI, calibration})});
    const one = id => ({...decisions, decisions: decisions.decisions.filter(d => d.caseId === id)});
    const held = score({...fullGold, cases: fullGold.cases.filter(c => c.caseId === 'eng.MRK-1-14-20:S02-U008')}, one('eng.MRK-1-14-20:S02-U008'), {split: fullSplit, only: 'heldout'});
    assert.equal(held.overall.cases, 1); assert.equal(held.overall.precision, 1); assert.equal(held.overall.recall, 1);
    assert.equal(held.overall.errorCount, 0, 'v2: companions, pairs, primary and related order all match the held-out gold');
    const report = buildReport({score, inputs: fullInputs, gold: fullGold, split: fullSplit, decisions});
    assert.equal(report.strata['exact-source-inline'].tuning.overall.abstained, 1, 'the inline case is reported apart and abstains');
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('wire test: the fit reads tuning cases only; held-out, exact-source and Spanish Luke cases are never fitted', async () => {
  const seen = [];
  await tuningProbabilities({inputs, gold, split, wireFile: wire, observe: id => seen.push(id)});
  const splitOf = new Map(split.cases.map(c => [c.caseId, c.split]));
  assert.deepEqual(seen, ['eng.MRK-1-1-13:S02-U005', 'eng.MRK-2-1-12:S02-U004']);
  assert.ok(seen.every(id => splitOf.get(id) === 'tuning'));
  assert.ok(!seen.includes('eng.MRK-1-14-20:S02-U008'), 'held-out case read by the fit');
  if (lukeEval) {
    const read = async n => JSON.parse(await readFile(new URL(n, evalDir), 'utf8'));
    const [fi, fg, fs] = await Promise.all(['inputs.json', 'gold.json', 'split.json'].map(read));
    const all = [];
    await tuningProbabilities({inputs: fi, gold: fg, split: fs, wireFile: wire, observe: id => all.push(id)});
    const s = new Map(fs.cases.map(c => [c.caseId, c.split]));
    assert.ok(all.length > 0 && all.every(id => s.get(id) === 'tuning'), 'a held-out case reached the fit');
    assert.ok(!all.some(id => id.startsWith('spa.LUK-')), 'Spanish Luke (held-out) reached the fit');
  }
});

test('wire test (v2): call 2 is built only from call-1 answers and the case candidates; order, companions and pairs abstain field by field', async () => {
  const bands = {falseMax: 0.2, trueMin: 0.8};
  const keys = {0: 'FIAImages:a1', 1: 'FIAImages:a2', 2: 'FIAMaps:c1'}, videoKeys = {0: 'VideoBibleDictionary:v1'};
  const p1 = o => ({asksVisual: 0.9, requested_0: 0.9, requested_1: 0.1, requested_2: 0.9, primary_0: 0.1, primary_1: 0.1, primary_2: 0.9, companion_0: 0.9, ...o});
  const first = compose(p1(), keys, bands, videoKeys);
  assert.deepEqual([first.requestedIdx, first.companionIdx, first.primaryIdx], [[0, 2], [0], 2]);
  // Order: c1 (2) before a1 (0) → related [c1, a1], primary c1 agrees, insertion for a1 per the projector rule.
  const ok = composeFollowUp(first, {before_0_2: 0.1, pair_0_0: 0.9, pair_0_2: 0.1}, keys, videoKeys, bands, 'S09-U001');
  assert.deepEqual(ok.raw.display, {primaryCollection: 'FIAMaps', primaryAssetId: 'c1', relatedAssetIds: ['c1', 'a1'], insertions: [{activityId: 'S09-U001-resource-a1', assetId: 'a1', fulfills: 'S09-U001'}]});
  assert.deepEqual(ok.raw.association.companionPairs, [{from: {collection: 'FIAImages', id: 'a1'}, to: {collection: 'VideoBibleDictionary', id: 'v1'}}]);
  assert.deepEqual(ok.notes, []);
  // Uncertain order: related and insertions stay null; the call-1 primary stands.
  const unsure = composeFollowUp(first, {before_0_2: 0.5, pair_0_0: 0.9, pair_0_2: 0.1}, keys, videoKeys, bands, 'S09-U001');
  assert.deepEqual(unsure.raw.display, {primaryCollection: 'FIAMaps', primaryAssetId: 'c1', relatedAssetIds: null, insertions: null}); assert.ok(unsure.notes.includes('order-uncertain-or-inconsistent'));
  // Contradiction: the decided order puts a1 first but call 1 chose c1 → every display field null.
  const contra = composeFollowUp(first, {before_0_2: 0.9, pair_0_0: 0.9, pair_0_2: 0.1}, keys, videoKeys, bands, 'S09-U001');
  assert.deepEqual(contra.raw.display, {primaryCollection: null, primaryAssetId: null, relatedAssetIds: null, insertions: null}); assert.ok(contra.notes.includes('contradiction-primary-vs-order'));
  // Pairs: uncertain, or a companion that accompanies nothing → companionPairs null.
  assert.equal(composeFollowUp(first, {before_0_2: 0.1, pair_0_0: 0.5, pair_0_2: 0.1}, keys, videoKeys, bands, 'S09-U001').raw.association.companionPairs, null);
  assert.equal(composeFollowUp(first, {before_0_2: 0.1, pair_0_0: 0.1, pair_0_2: 0.1}, keys, videoKeys, bands, 'S09-U001').raw.association.companionPairs, null);
  // Companion uncertain in call 1 → optionalCompanions and companionPairs null.
  const cu = compose(p1({companion_0: 0.5}), keys, bands, videoKeys);
  assert.equal(cu.raw.association.optionalCompanions, null); assert.equal(composeFollowUp(cu, {before_0_2: 0.1}, keys, videoKeys, bands, 'S09-U001').raw.association.companionPairs, null);
  // A cycle is not an order.
  assert.equal(orderFrom({before_0_1: 0.9, before_1_2: 0.9, before_0_2: 0.1}, [0, 1, 2], bands), null);
  assert.deepEqual(orderFrom({before_0_1: 0.9, before_1_2: 0.9, before_0_2: 0.9}, [0, 1, 2], bands), [0, 1, 2]);
  // One requested visual and no companion: no call 2; related [x], insertions [], companionPairs [].
  const single = compose(p1({requested_2: 0.1, primary_0: 0.9, primary_2: 0.1, companion_0: 0.1}), keys, bands, videoKeys);
  const {request} = await buildRequest(caseOf('eng.MRK-1-1-13:S02-U005'));
  assert.equal(buildFollowUp(request, {keys, videoKeys}, single), null);
  assert.deepEqual(composeFollowUp(single, null, keys, videoKeys, bands, 'S09-U001').raw.display.insertions, []);
  // Follow-up cap: more than 8 requested visuals to order → not sent.
  assert.deepEqual(buildFollowUp(request, {keys, videoKeys}, {requestedIdx: [0, 1, 2, 3, 4, 5, 6, 7, 8], companionIdx: []}), {refused: 'follow-up-cap'});
});

test('wire test (v2): no gold-only key or gold value appears in any recorded wire request (call 1 and call 2)', async () => {
  const banned = new Set([...(await import('../../server/fia/preparation/association-question/request.mjs')).GOLD_ONLY_FIELDS]);
  const walk = (v, path) => { if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`)); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { assert.ok(!banned.has(k), `${path}.${k}`); walk(x, `${path}.${k}`); } };
  const calibration = await calibrationFromFixtures();
  const seen = [];
  const AI = createRecordedJevWire(wire), spy = {...AI, async run(model, w) { seen.push(w); return AI.run(model, w); }};
  Object.setPrototypeOf(spy, AI); Object.getOwnPropertySymbols(AI).forEach(s => { spy[s] = AI[s]; });
  await runAdapter({casesFile: inputs, transport: createJevNoulTransport({mode: 'recorded-wire', AI: spy, calibration})});
  assert.ok(seen.length >= 4);
  for (const w of seen) {
    walk(JSON.parse(w.state), 'state'); walk(w.questions, 'questions');
    const text = JSON.stringify(w);
    for (const g of gold.cases) for (const i of g.output.display.insertions ?? []) assert.ok(!text.includes(i.activityId), `gold insertion ${i.activityId} in a request`);
  }
});

test('wire test (v2): per-field measure on adjudicated gold for the fixture cases (wire test, not model quality)', async () => {
  const calibration = await calibrationFromFixtures();
  const doc = await runAdapter({casesFile: inputs, transport: createJevNoulTransport({mode: 'recorded-wire', AI: createRecordedJevWire(wire), calibration})});
  const fields = ['association.requested', 'association.optionalCompanions', 'association.companionPairs', 'display.primaryAssetId', 'display.relatedAssetIds', 'display.insertions'];
  const get = (o, f) => f.split('.').reduce((x, k) => x?.[k], o);
  const norm = (f, v) => v === null || v === undefined ? v : f === 'association.requested' || f === 'association.optionalCompanions' ? [...v].map(r => `${r.collection}:${r.id}`).sort() : v;
  const table = {};
  for (const g of gold.cases) {
    const d = doc.decisions.find(x => x.caseId === g.caseId);
    for (const f of fields) {
      const gv = get(g.output, f), dv = get(d.output, f);
      const row = table[f] ||= {adjudicated: 0, matched: 0, nullByDesign: 0, undecided: 0};
      if (gv === null || gv === undefined) { row.nullByDesign++; continue; }
      row.adjudicated++;
      if (dv === null || dv === undefined) row.undecided++;
      else if (JSON.stringify(norm(f, dv)) === JSON.stringify(norm(f, gv))) row.matched++;
    }
  }
  // The three English semantic cases (two tuning, one held-out) match on every adjudicated field; the Spanish inline case
  // abstains (no Spanish calibration in this fixture), so its adjudicated fields are undecided, never wrong.
  assert.deepEqual(table, {
    'association.requested': {adjudicated: 4, matched: 3, nullByDesign: 0, undecided: 1},
    'association.optionalCompanions': {adjudicated: 2, matched: 2, nullByDesign: 2, undecided: 0},
    'association.companionPairs': {adjudicated: 2, matched: 2, nullByDesign: 2, undecided: 0},
    'display.primaryAssetId': {adjudicated: 4, matched: 3, nullByDesign: 0, undecided: 1},
    'display.relatedAssetIds': {adjudicated: 3, matched: 3, nullByDesign: 1, undecided: 0},
    'display.insertions': {adjudicated: 1, matched: 1, nullByDesign: 3, undecided: 0}
  });
});

// Terry's model-identity rule (fia-app-cookbook ANSWER-JEV-MODEL-IDENTITY-2026-10-29.md, 8ec3901), on recorded-wire fixtures only.
async function identityRun(transform, {modelRevision} = {}) {
  const calibration = {...(await calibrationFromFixtures())};
  if (modelRevision !== undefined) calibration.modelRevision = modelRevision;
  const rec = {...wire, records: wire.records.map(r => r.caseId === 'eng.MRK-1-14-20:S02-U008' && r.call === 1 ? {...r, response: transform(structuredClone(r.response))} : r)};
  const doc = await runAdapter({casesFile: {...inputs, cases: [caseOf('eng.MRK-1-14-20:S02-U008')]}, transport: createJevNoulTransport({mode: 'recorded-wire', AI: createRecordedJevWire(rec), calibration})});
  return doc.decisions[0];
}
const asModel = (model, extra = {}) => r => ({state: 'Completed', result: {model, answers: r.answers, ...extra}});

test('identity rule 1: candidates are non-empty strings; any other present type is invalid', async () => {
  assert.deepEqual(resolveIdentity({model_version: 5}), {observed: {model_version: 5}, resolved: null, suppliedBy: [], status: 'invalid', reason: 'provider-model-identity-invalid'});
  assert.equal(resolveIdentity({version: null}).reason, 'provider-model-identity-invalid');
  assert.equal(resolveIdentity({model: {id: 'jev-1.13.0'}}).reason, 'provider-model-identity-invalid');
  assert.equal(resolveIdentity({model_version: ''}).reason, 'provider-model-version-unverified', 'an empty string is not an identity');
  const d = await identityRun(r => ({...r, model_version: 7}));
  assert.equal(d.output.decision, 'abstain'); assert.equal(d.provenance.jev.reason, 'provider-model-identity-invalid'); assert.equal(d.provenance.jev.status, 'invalid');
});

test('identity rule 2: a versioned result.model is accepted; bare or aliased model ids are not identities', async () => {
  // Accepted: the observed envelope shape with a versioned model equal to the calibrated revision (test-only revision override).
  const ok = await identityRun(asModel('jev-1.13.0'), {modelRevision: 'jev-1.13.0'});
  assert.equal(ok.output.decision, 'associate'); assert.equal(ok.provenance.modelVersion, 'jev-1.13.0');
  assert.deepEqual(ok.provenance.jev.calls[0].identity, {observed: {model: 'jev-1.13.0'}, resolved: 'jev-1.13.0', suppliedBy: ['model'], status: 'resolved', reason: null});
  for (const alias of ['typesafe/jev', 'jev', 'latest', 'jev-fixture-1', 'Jev-1.13.0', 'jev-1.13']) {
    assert.deepEqual(resolveIdentity({model: alias}), {observed: {model: alias}, resolved: null, suppliedBy: [], status: 'unknown', reason: 'provider-model-version-unverified'}, alias);
  }
  const bare = await identityRun(asModel('typesafe/jev'), {modelRevision: 'jev-1.13.0'});
  assert.equal(bare.output.decision, 'abstain'); assert.equal(bare.provenance.jev.reason, 'provider-model-version-unverified');
  // An alias beside a real identity field is ignored, not a conflict.
  assert.equal(resolveIdentity({model: 'typesafe/jev', model_version: 'jev-1.13.0'}).resolved, 'jev-1.13.0');
  assert.ok(VERSIONED_MODEL.test('jev-1.13.0') && VERSIONED_MODEL.test('jev-2.0.0+build.7') && !VERSIONED_MODEL.test('typesafe/jev'));
});

test('identity rule 3: several candidates must be exactly equal, with no precedence override', async () => {
  assert.deepEqual(resolveIdentity({model: 'jev-1.13.0', model_version: 'jev-1.13.0', version: 'jev-1.13.0'}).suppliedBy, ['model_version', 'version', 'model']);
  assert.equal(resolveIdentity({model: 'jev-1.13.0', model_version: 'jev-1.14.0'}).reason, 'provider-model-identity-conflict');
  assert.equal(resolveIdentity({model_version: 'a', version: 'b'}).reason, 'provider-model-identity-conflict');
  const d = await identityRun(asModel('jev-1.13.0', {model_version: 'jev-1.14.0'}), {modelRevision: 'jev-1.14.0'});
  assert.equal(d.output.decision, 'abstain'); assert.equal(d.provenance.jev.reason, 'provider-model-identity-conflict');
});

test('identity rule 4: the resolved identity must equal the calibrated revision exactly; a null revision never matches', async () => {
  const mismatch = await identityRun(asModel('jev-1.13.0'), {modelRevision: 'jev-1.14.0'});
  assert.equal(mismatch.provenance.jev.reason, 'provider-model-version-unverified'); assert.equal(mismatch.output.decision, 'abstain');
  const unset = await identityRun(asModel('jev-1.13.0'), {modelRevision: null});
  assert.equal(unset.provenance.jev.reason, 'provider-model-version-unverified'); assert.equal(unset.output.decision, 'abstain');
  // The observed recorded envelope (jev-1.13.0) against the fixture calibration (jev-fixture-1) stays unverified.
  const calibration = await calibrationFromFixtures();
  const doc = await runAdapter({casesFile: {...inputs, cases: [caseOf('eng.MRK-1-14-20:S02-U008')]}, transport: createJevNoulTransport({mode: 'recorded-wire', AI: createRecordedJevWire(observed), calibration})});
  assert.equal(doc.decisions[0].provenance.jev.reason, 'provider-model-version-unverified');
  assert.equal(doc.decisions[0].provenance.modelVersion, 'jev-1.13.0', 'the observed identity is recorded, not replaced');
});

test('identity rules 5 and 6: a missing identity is never stamped; provenance keeps every observed field', async () => {
  const none = await identityRun(r => ({answers: r.answers}), {modelRevision: 'jev-fixture-1'});
  assert.equal(none.output.decision, 'abstain'); assert.equal(none.provenance.jev.reason, 'provider-model-version-unverified');
  assert.equal(none.provenance.modelVersion, null, 'not stamped from MODEL, configuration or calibration');
  assert.deepEqual(none.provenance.jev.identity, {observed: {}, resolved: null, suppliedBy: [], status: 'unknown', reason: 'provider-model-version-unverified'});
  const both = await identityRun(r => ({...r, version: 'jev-fixture-1'}), {modelRevision: 'jev-fixture-1'});
  assert.equal(both.output.decision, 'associate');
  assert.deepEqual(both.provenance.jev.calls[0].identity, {observed: {model_version: 'jev-fixture-1', version: 'jev-fixture-1'}, resolved: 'jev-fixture-1', suppliedBy: ['model_version', 'version'], status: 'resolved', reason: null});
});
