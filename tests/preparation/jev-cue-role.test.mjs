import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createJevCueRoleAdapter, canonical, sha256, validateCueRoleDecision, ROLES} from '../../server/fia/preparation/jev/adapter.mjs';
const root = new URL('../../server/fia/preparation/jev/', import.meta.url);
const contractText = await readFile(new URL('cue-role-v1.md', root), 'utf8');
const schemaText = await readFile(new URL('cue-role-v1.schema.json', root), 'utf8');
const h = 'a'.repeat(64), config = {wire: '2fe871ee59387d433411b768be2e5926aea71d33'};
const calibration = {policySha256: h, language: 'eng', modelRevision: 'fixture-version', configSha256: await sha256(canonical(config)), contractSha256: await sha256(contractText), schemaSha256: await sha256(schemaText), falseMax: 0.1, trueMin: 0.9}; // TEST ONLY; not production thresholds.
async function input(text = 'Read the passage, then discuss it.') { return {caseId: 'fixture-case', packId: 'fixture-pack', sourceRevision: 'fixture-revision', language: 'eng', source: {unitId: 'u1', text, sha256: await sha256(text)}, context: []}; }
function answer(values = [0.99, 0.99, 0.01, 0.01]) { return {answers: Object.fromEntries(ROLES.map((key, i) => [key, {noul: values[i]}])), version: 'wire-v1', model_version: 'fixture-version', usage: {input_tokens: 40, output_tokens: 4}}; }
async function adapter(options = {}) { return createJevCueRoleAdapter({contractText, schemaText, modelRevision: 'fixture-version', configuration: config, calibration, ...options}); }
const roles = {readingRequested: true, discussionRequested: true, resourceLookupRequested: false, pauseOnly: false};
function decision(x, extra = {}) { return {contract: 'fia-cue-role@1', caseId: x.caseId, roles: {...roles}, needsReview: false, evidenceUnitIds: ['u1'], ...extra}; }

test('exact Jev wire, wrapper, compound roles and private provenance normalize without playback fields', async () => {
  let calls = 0; const x = await input();
  const a = await adapter({AI: {async run(model, wire) { calls++; assert.equal(model, 'typesafe/jev'); assert.deepEqual(Object.keys(wire).sort(), ['questions', 'state']); assert.deepEqual(Object.keys(wire.questions).sort(), [...ROLES].sort()); for (const q of Object.values(wire.questions)) { assert.equal(q.type, 'noul'); assert.equal(typeof q.criteria.true, 'string'); assert.equal(typeof q.criteria.false, 'string'); } assert.equal(JSON.parse(wire.state).input.source.text, x.source.text); return {result: answer()}; }}});
  const result = await a.decide(x); assert.equal(calls, 1); assert.equal(result.status, 'resolved'); assert.deepEqual(result.decision, decision(x));
  assert.deepEqual(result.provenance.usage, {input_tokens: 40, output_tokens: 4}); assert.equal(result.provenance.version, 'wire-v1'); assert.equal(result.provenance.modelVersion, 'fixture-version');
  assert.equal(result.provenance.responseSha256, await sha256(canonical(result.evidence))); assert.equal(result.cacheKey, (await a.identity(x)).cacheKey);
  assert.equal('acceptedPlaybackRanges' in result, false); assert.equal('ready' in result, false);
});

test('trusted explicit mappings bypass provider and calibration with identity stable across methods', async () => {
  const x = await input(); let calls = 0;
  const mapping = {decision: decision(x), policySha256: h, evidenceSha256: 'b'.repeat(64)};
  const a = await adapter({calibration: null, resolveExplicit: () => mapping, AI: {run() { calls++; throw Error(); }}});
  const result = await a.decide(x); assert.equal(result.status, 'resolved'); assert.equal(result.provenance.mode, 'deterministic'); assert.equal(calls, 0); assert.equal(result.cacheKey, (await a.identity(x)).cacheKey);
  const old = result.cacheKey; mapping.evidenceSha256 = 'c'.repeat(64); assert.notEqual((await a.identity(x)).cacheKey, old);
});

test('missing or mismatched calibration returns unknown without an invocation', async () => {
  for (const c of [null, {...calibration, language: 'spa'}, {...calibration, modelRevision: 'changed'}, {...calibration, schemaSha256: h}]) {
    let calls = 0; const a = await adapter({calibration: c, AI: {run() { calls++; return answer(); }}});
    const r = await a.decide(await input()); assert.equal(r.status, 'unknown'); assert.equal(r.reason, 'calibration-unavailable'); assert.equal(r.decision, null); assert.equal(calls, 0);
  }
});

test('calibration bands are supplied and invalid overlapping bands cannot accept', async () => {
  const a = await adapter({calibration: {...calibration, falseMax: 0.95}, AI: {run() { assert.fail('must not run'); }}});
  assert.equal((await a.decide(await input())).status, 'invalid');
});

test('ambiguous model probability stays unknown and preserves measured evidence', async () => {
  const a = await adapter({AI: {run: () => answer([0.5, 0.99, 0, 0])}}); const r = await a.decide(await input());
  assert.equal(r.status, 'unknown'); assert.equal(r.decision, null); assert.equal(r.provenance.probabilities.readingRequested, 0.5);
});

test('all-false content and pause-only classify separately, contradictory pause is invalid', async () => {
  for (const [values, status, pause] of [[[0, 0, 0, 0], 'resolved', false], [[0, 0, 0, 1], 'resolved', true], [[1, 0, 0, 1], 'invalid', null]]) {
    const r = await (await adapter({AI: {run: () => answer(values)}})).decide(await input()); assert.equal(r.status, status); assert.equal(r.decision?.roles.pauseOnly ?? null, pause);
  }
});

test('malformed provider outputs fail closed without retry', async () => {
  const missing = answer(); delete missing.answers.pauseOnly;
  const extra = answer(); extra.answers.unrequested = {noul: 1};
  for (const response of [null, {}, {answers: []}, missing, extra, answer([true, 0, 0, 0]), answer(['0.99', 0, 0, 0]), answer([-0.1, 0, 0, 0]), answer([1.1, 0, 0, 0]), answer([NaN, 0, 0, 0]), {result: {answers: {}}}]) {
    let calls = 0; const a = await adapter({AI: {run() { calls++; return response; }}}); const r = await a.decide(await input()); assert.equal(r.status, 'invalid'); assert.equal(calls, 1); assert.equal(r.decision, null);
  }
});

test('no provider, rejection and deadline have typed outcomes and never retry', async () => {
  assert.equal((await (await adapter()).decide(await input())).reason, 'provider-unavailable');
  for (const run of [() => Promise.reject(Error('private provider message')), () => new Promise(() => {})]) {
    let calls = 0; const a = await adapter({limits: {timeoutMs: 10}, AI: {run() { calls++; return run(); }}}); const r = await a.decide(await input());
    assert.equal(r.status, 'unavailable'); assert.equal(r.reason, 'provider-outcome-uncertain'); assert.equal(calls, 1); assert.equal(JSON.stringify(r).includes('private provider message'), false);
  }
});

test('closed input, actual text digest, unique evidence IDs and byte bounds precede provider', async () => {
  const good = await input(); let calls = 0; const a = await adapter({AI: {run() { calls++; return answer(); }}});
  for (const x of [{...good, prompt: 'override'}, {...good, source: {...good.source, sha256: h}}, {...good, context: [good.source]}, {...good, context: [{...good.source, unitId: 'neighbor', text: 'changed'}]}, {...good, source: {...good.source, text: 'x'.repeat(9000)}}]) assert.equal((await a.decide(x)).status, 'invalid');
  assert.equal(calls, 0);
});

test('normalized schema rejects extra fields, forged evidence, duplicate evidence and pause conflict', async () => {
  const x = await input();
  for (const d of [decision(x, {timing: [0, 1]}), decision(x, {evidenceUnitIds: ['invented']}), decision(x, {evidenceUnitIds: ['u1', 'u1']}), decision(x, {roles: {...roles, pauseOnly: true}}), decision(x, {caseId: 'other'})]) assert.throws(() => validateCueRoleDecision(d, x));
  assert.deepEqual(validateCueRoleDecision(decision(x), x), decision(x));
});

test('invalid explicit evidence cannot fall through to model and async resolver is refused', async () => {
  const x = await input(); let calls = 0;
  for (const resolveExplicit of [() => ({decision: decision(x, {evidenceUnitIds: ['forged']}), policySha256: h, evidenceSha256: h}), async () => null]) {
    const r = await (await adapter({resolveExplicit, AI: {run() { calls++; return answer(); }}})).decide(x); assert.equal(r.status, 'invalid');
  }
  assert.equal(calls, 0);
});

test('cache identity changes with every semantic dependency; object ordering does not change it', async () => {
  const x = await input(), a = await adapter(), base = (await a.identity(x)).cacheKey;
  assert.equal((await a.identity({...x, source: {sha256: x.source.sha256, text: x.source.text, unitId: x.source.unitId}})).cacheKey, base);
  for (const change of [{...x, language: 'spa'}, {...x, sourceRevision: 'new'}, {...x, packId: 'different'}, {...x, source: {...x.source, unitId: 'u2'}}, await input('Different content'), {...x, context: [{unitId: 'n1', text: 'neighbor', sha256: await sha256('neighbor')}]}]) assert.notEqual((await a.identity(change)).cacheKey, base);
  for (const options of [{modelRevision: 'changed'}, {configuration: {...config, setting: 2}}, {contractText: contractText + '\n'}, {schemaText: schemaText + '\n'}, {calibration: {...calibration, policySha256: 'c'.repeat(64)}}, {limits: {maxOutputBytes: 8000}}]) assert.notEqual((await (await adapter(options)).identity(x)).cacheKey, base);
});

test('configuration and provider binding are captured against caller mutation', async () => {
  const configuration = {...config}; const AI = {run: () => answer()}; const c = {...calibration};
  const a = await adapter({configuration, AI, calibration: c}); const x = await input(), before = await a.identity(x);
  configuration.wire = 'changed'; c.trueMin = 0; AI.run = () => { throw Error('changed'); };
  assert.deepEqual(await a.identity(x), before); assert.equal((await a.decide(x)).status, 'resolved');
});

test('oversize and cyclic provider evidence refuse; no artifact or false acceptance is produced', async () => {
  const cyclic = answer(); cyclic.self = cyclic;
  for (const raw of [cyclic, {...answer(), excess: 'x'.repeat(20000)}]) {
    const r = await (await adapter({AI: {run: () => raw}})).decide(await input()); assert.equal(r.status, 'invalid'); assert.equal(r.decision, null);
  }
});

test('changed or absent returned model version cannot reuse another model calibration', async () => {
  for (const raw of [{...answer(), model_version: 'another-model'}, {answers: answer().answers}]) {
    const r = await (await adapter({AI: {run: () => raw}})).decide(await input()); assert.equal(r.status, 'unknown'); assert.equal(r.reason, 'provider-model-version-unverified'); assert.equal(r.decision, null); assert.ok(r.provenance.responseSha256);
  }
});

test('bounded malformed decision evidence is retained privately with its exact digest', async () => {
  const raw = {answers: {}, usage: {input_tokens: 12}};
  const r = await (await adapter({AI: {run: () => raw}})).decide(await input()); assert.equal(r.status, 'invalid'); assert.deepEqual(r.evidence, raw); assert.equal(r.provenance.responseSha256, await sha256(canonical(raw)));
});
