// WIRE TESTS for fia-association-noul@1. Fixtures are hand-written noul values in the documented wire shape; they test the
// question builder, parser, composer, calibration and transport gates. They are never a measure of Jev quality.
// Inputs, gold and split fixtures are copied verbatim from PR289 e67bb5c (four cases).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildRequest} from '../../server/fia/preparation/association-question/request.mjs';
import {buildQuestions, parseWire, compose, wireOf, createRecordedJevWire, createJevNoulTransport, registrationGaps, LIMITS, QUESTION_SET, TransportError} from '../../server/fia/preparation/association-question/jev-noul.mjs';
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
  assert.equal(Object.keys(a.questions).length, 1 + 2 * 8);
  for (const q of Object.values(a.questions)) { assert.equal(q.type, 'noul'); assert.deepEqual(Object.keys(q.criteria).sort(), ['false', 'true']); }
  assert.equal((await wireOf(a)).wireRequestSha256, (await wireOf(b)).wireRequestSha256);
  assert.deepEqual(Object.values(a.keys), request.candidates.filter(c => c.collection !== 'VideoBibleDictionary').map(c => c.candidateId));
  assert.ok(!JSON.stringify(a).includes('VideoBibleDictionary'), 'videos are not asked');
  // Gold answers never enter the questions: the gold primary/requested sets appear nowhere as labels.
  const g = gold.cases.find(c => c.caseId === 'eng.MRK-1-1-13:S02-U005');
  assert.ok(!JSON.stringify(a).includes(JSON.stringify(g.output.association.requested)));
  assert.ok(!JSON.stringify(a).includes('S02-U005-resource-'));
  // Caps: 16 visual candidates exceed the question cap; an oversized unit exceeds the state cap. Neither is sent.
  const many = structuredClone(request); many.candidates = Array.from({length: 16}, (_, i) => ({candidateId: `FIAImages:x${i}`, collection: 'FIAImages', id: `x${i}`}));
  many.input.candidates = many.candidates.map(c => ({collection: c.collection, id: c.id, title: 't'}));
  assert.deepEqual(buildQuestions(many), {refused: 'question-cap', visualCandidates: 16});
  const big = structuredClone(request); big.input.source.unit.text = 'x'.repeat(LIMITS.maxStateBytes);
  assert.equal(buildQuestions(big).refused, 'input-limit');
  assert.equal(LIMITS.maxQuestions, 1 + 2 * LIMITS.maxVisualCandidates);
});

test('wire test: parser accepts the documented shape (bare or under result) and refuses anything else', async () => {
  const q = {asksVisual: {}, requested_0: {}};
  assert.deepEqual(parseWire({model_version: 'v', answers: {asksVisual: {noul: 0.2}, requested_0: {type: 'noul', noul: 1}}}, q), {probabilities: {asksVisual: 0.2, requested_0: 1}, modelVersion: 'v', observedModel: null});
  assert.equal(parseWire({result: {version: 'v2', answers: {asksVisual: {noul: 0}, requested_0: {noul: 0}}}}, q).modelVersion, 'v2');
  assert.equal(parseWire({state: 'Completed', result: {model: 'jev-1.13.0', answers: {asksVisual: {noul: 0}, requested_0: {noul: 0}}}}, q).modelVersion, null, 'model is not a version');
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
  assert.deepEqual(compose(p(), keys, bands).raw, {decision: 'associate', association: {requested: [{collection: 'FIAImages', id: 'a1'}], optionalCompanions: null, companionPairs: null},
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
  assert.deepEqual({...cal.languages.eng, caseIds: undefined}, {status: 'calibrated', falseMax: 0.12, trueMin: 0.8, tuningCases: 2, caseIds: undefined, truePairs: 7, falsePairs: 25});
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
  assert.deepEqual(held.output, {decision: 'associate', association: {requested: [{collection: 'FIAImages', id: 'a1400'}, {collection: 'FIAMaps', id: 'c4'}], optionalCompanions: null, companionPairs: null},
    display: {primaryCollection: 'FIAMaps', primaryAssetId: 'c4', relatedAssetIds: null, insertions: null}});
  assert.equal(held.provenance.authority, 'model-resolved'); assert.equal(held.provenance.normalization, 'accepted');
  assert.equal(held.provenance.modelVersion, 'jev-fixture-1');
  assert.match(held.provenance.jev.wireRequestSha256, /^[a-f0-9]{64}$/); assert.match(held.provenance.jev.wireResponseSha256, /^[a-f0-9]{64}$/);
  assert.equal(held.provenance.jev.questionCount, 17); assert.equal(held.provenance.jev.status, 'composed');
  const inline = byId['spa.MRK-4-35-41:S03-U017'];
  assert.equal(inline.output.decision, 'abstain'); assert.equal(inline.provenance.jev.reason, 'calibration-unavailable'); assert.equal(inline.provenance.jev.invocations, 0);
  assert.equal(transport.calls, 1, 'an uncalibrated language is never sent');
  assert.ok(!JSON.stringify(doc).includes('source-explicit'));
});

test('wire test: the observed 2026-10-06 envelope (model, no model_version) is refused as unverified and abstains', async () => {
  const calibration = await calibrationFromFixtures();
  const transport = createJevNoulTransport({mode: 'recorded-wire', AI: createRecordedJevWire(observed), calibration});
  const doc = await runAdapter({casesFile: {...inputs, cases: [caseOf('eng.MRK-1-14-20:S02-U008')]}, transport});
  const d = doc.decisions[0];
  assert.equal(d.output.decision, 'abstain');
  assert.equal(d.provenance.jev.reason, 'provider-model-version-unverified');
  assert.equal(d.provenance.jev.observedModel, 'jev-1.13.0');
  assert.equal(d.provenance.modelVersion, null);
});

test('wire test: the live transport refuses without registration plus verified entitlement; recorded mode refuses a non-recorded AI', async () => {
  const calibration = await calibrationFromFixtures();
  const fakeAI = {run: async () => { throw Error('must not be called'); }};
  assert.throws(() => createJevNoulTransport({mode: 'live', AI: fakeAI, calibration, registration, entitlement: null}),
    e => e instanceof TransportError && e.reason === 'not-activated:registration-status:registered-not-funded,no-authorized-calls,entitlement-unverified');
  const funded = {...registration, status: 'registered', authorizedCalls: 1};
  assert.throws(() => createJevNoulTransport({mode: 'live', AI: fakeAI, calibration, registration: funded, entitlement: {verified: false}}), /not-activated:entitlement-unverified/);
  assert.throws(() => createJevNoulTransport({mode: 'live', AI: null, calibration, registration: funded, entitlement: {verified: true, route: 'r', evidence: 'e'}}), /not-activated:no-ai-binding/);
  assert.deepEqual(registrationGaps({...funded, limits: {...funded.limits, maxQuestions: 99}}, {verified: true, route: 'r', evidence: 'e'}), ['registration-limits-mismatch']);
  assert.throws(() => createJevNoulTransport({mode: 'recorded-wire', AI: fakeAI, calibration}), /recorded-wire-needs-recorded-shim/);
  // The ceiling: with a (test-only) funded registration and entitlement over the recorded shim, the second call stops.
  const t = createJevNoulTransport({mode: 'live', AI: createRecordedJevWire(wire), calibration, registration: funded, entitlement: {verified: true, route: 'test-only', evidence: 'test-only'}});
  const req = async id => buildRequest(caseOf(id));
  await t.respond(await req('eng.MRK-1-14-20:S02-U008'));
  await assert.rejects(t.respond(await req('eng.MRK-1-1-13:S02-U005')), e => e.reason === 'budget-exhausted');
  assert.equal(t.calls, 1);
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
    const held = score({...fullGold, cases: fullGold.cases.filter(c => c.caseId === 'eng.MRK-1-14-20:S02-U008')}, decisions, {split: fullSplit, only: 'heldout'});
    assert.equal(held.overall.cases, 1); assert.equal(held.overall.precision, 1); assert.equal(held.overall.errors['wrong-primary'], 0);
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
