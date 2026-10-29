// Q18 execution seam tests. Recorded-response results here are a PIPELINE TEST, never a measure of Jev accuracy.
// Fixture inputs are three tuning cases copied verbatim from PR289 (4359d1e) scripts/association-eval/inputs.json.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildRequest, captureCaseInput, GOLD_ONLY_FIELDS, InputError, ALLOWED_DECISIONS} from '../../server/fia/preparation/association-question/request.mjs';
import {normalizeOutput, provenanceFor, INVALID, AUTHORITY} from '../../server/fia/preparation/association-question/normalize.mjs';
import {createRecordedTransport, createNoTransport, createJevTransport, JEV_SEAM} from '../../server/fia/preparation/association-question/transports.mjs';
import {runAdapter, main, RECORDED_LABEL, DECISIONS_SCHEMA, REQUESTS_SCHEMA} from '../../server/fia/preparation/association-question/cli.mjs';
import {buildReport, stratumOf} from '../../server/fia/preparation/association-question/report.mjs';
import {PROMPT_TEMPLATE, POLICY} from '../../server/fia/preparation/association-question/request.mjs';

const fixtures = new URL('./fixtures/', import.meta.url);
const inputsFile = JSON.parse(await readFile(new URL('inputs-tuning-subset.json', fixtures), 'utf8'));
const recordedFile = JSON.parse(await readFile(new URL('recorded-responses.json', fixtures), 'utf8'));
const first = () => structuredClone(inputsFile.cases[0]);
const evalDir = new URL('../../scripts/association-eval/', import.meta.url);
const pr289Present = await access(new URL('score.mjs', evalDir)).then(() => true, () => false);

test('request builder is deterministic: same input, same request and sha; candidate order does not matter', async () => {
  const a = await buildRequest(first()), b = await buildRequest(first());
  assert.equal(a.requestSha256, b.requestSha256);
  assert.deepEqual(a.request, b.request);
  const shuffled = first(); shuffled.candidates.reverse();
  assert.equal((await buildRequest(shuffled)).requestSha256, a.requestSha256);
  const changed = first(); changed.candidates.pop();
  assert.notEqual((await buildRequest(changed)).requestSha256, a.requestSha256);
  assert.match(a.request.promptTemplateSha256, /^[a-f0-9]{64}$/);
  assert.equal(a.request.questionId, 'fia-resource-association-question@1');
  assert.equal(a.request.policyId, 'fia-resource-association-policy@1');
  assert.deepEqual(a.request.allowedDecisions, ['associate', 'none', 'abstain']);
});

test('gold leak guard: every gold-only field is refused at the top level, in the unit and inside a candidate', async () => {
  for (const field of GOLD_ONLY_FIELDS) {
    const top = first(); top[field] = 'leak';
    await assert.rejects(buildRequest(top), e => e instanceof InputError && e.reason === `gold-field-in-input:input.${field}`, field);
    const unit = first(); unit.source.unit[field] = 'leak';
    await assert.rejects(buildRequest(unit), e => e instanceof InputError && e.reason === `gold-field-in-input:input.source.unit.${field}`, field);
    const nested = first(); nested.candidates[0][field] = 'leak';
    await assert.rejects(buildRequest(nested), e => e instanceof InputError && e.reason.startsWith('gold-field-in-input:input.candidates['), field);
  }
});

test('gold leak guard: no request carries a gold-only key', async () => {
  const doc = await runAdapter({casesFile: inputsFile, transport: createNoTransport()});
  const text = JSON.stringify(doc.requests);
  for (const field of GOLD_ONLY_FIELDS) assert.ok(!text.includes(`"${field}":`), field);
});

test('gold leak guard list contains PR289 GOLD_ONLY_KEYS (checked when PR289 is present)', {skip: !pr289Present && 'PR289 scripts/association-eval not on this base'}, async () => {
  const {GOLD_ONLY_KEYS} = await import(new URL('cases.mjs', evalDir));
  for (const k of GOLD_ONLY_KEYS) assert.ok(GOLD_ONLY_FIELDS.includes(k), k);
});

test('input binding: PR289 shape exactly; wrong hashes and unknown fields are refused', async () => {
  const bad = first(); bad.source.unit.textSha256 = 'f'.repeat(64);
  await assert.rejects(buildRequest(bad), e => e.reason === 'unit-text-binding');
  const html = first(); html.source.unit.html += ' ';
  await assert.rejects(buildRequest(html), e => e.reason === 'unit-html-binding');
  const extra = first(); extra.hint = 'x';
  await assert.rejects(buildRequest(extra), e => e.reason === 'input-unknown-field:hint');
  const missing = first(); delete missing.candidates[0].collectionRevision;
  await assert.rejects(buildRequest(missing), e => e.reason === 'candidate-missing:collectionRevision');
  const dup = first(); dup.candidates.push({...dup.candidates[0]});
  await assert.rejects(captureCaseInput(dup), e => e.reason.startsWith('candidate-duplicate:'));
});

const ref = (collection, id) => ({collection, id});
const undecided = () => ({primaryCollection: null, primaryAssetId: null, relatedAssetIds: null, insertions: null});
const full = (over = {}) => ({decision: 'associate',
  association: {requested: [ref('FIAImages', 'a112'), ref('FIAMaps', 'c197')], optionalCompanions: null, companionPairs: null},
  display: {primaryCollection: 'FIAImages', primaryAssetId: 'a112', relatedAssetIds: ['a112', 'c197'], insertions: [{activityId: 'S02-U005-resource-c197', assetId: 'c197', fulfills: 'S02-U005'}]}, ...over});

test('normalizer accepts the full PR289 output shape field for field, keeping nulls as nulls and order as given', async () => {
  const {request} = await buildRequest(first());
  const n = normalizeOutput({...full(), confidence: 0.75}, request);
  assert.deepEqual(n, {output: full(), confidence: 0.75, normalization: {status: 'accepted', reason: null}});
  const withCompanions = full({association: {requested: [ref('FIAImages', 'a112')], optionalCompanions: [ref('VideoBibleDictionary', 'a13')], companionPairs: [{from: ref('VideoBibleDictionary', 'a13'), to: ref('FIAImages', 'a112')}]}});
  assert.deepEqual(normalizeOutput(withCompanions, request).output, withCompanions);
  const partial = full({display: undecided()});
  assert.deepEqual(normalizeOutput(partial, request).output, partial, 'undecided display stays null; no default is filled in');
  const none = {decision: 'none', association: {requested: [], optionalCompanions: null, companionPairs: null}, display: undecided()};
  assert.deepEqual(normalizeOutput(none, request).output, none);
  const abstain = normalizeOutput({decision: 'abstain', association: null, display: null, confidence: 0}, request);
  assert.deepEqual(abstain.output, {decision: 'abstain', association: null, display: null}); assert.equal(abstain.confidence, 0);
  assert.equal(normalizeOutput(full(), request).confidence, null);
});

test('normalizer rejects malformed, out-of-set and extra output as invalid-provider-output, never repaired', async () => {
  const {request} = await buildRequest(first());
  const d = o => full({display: {...full().display, ...o}});
  const a = o => full({association: {...full().association, ...o}});
  const cases = [
    [null, 'not-object'], ['associate', 'not-object'], [[], 'not-object'],
    [{decision: 'associate', candidateIds: ['FIAImages:a112']}, 'output-extra-field:candidateIds'],
    [{decision: 'abstain'}, 'output-missing-field:association,display'],
    [full({decision: 'explicit'}), 'decision-not-allowed'],
    [full({decision: 'semantic-needed'}), 'decision-not-allowed'],
    [{...full(), reason: 'x'}, 'output-extra-field:reason'],
    [{...full(), confidence: 1.5}, 'confidence-invalid'],
    [{...full(), confidence: '0.5'}, 'confidence-invalid'],
    [{decision: 'abstain', association: full().association, display: null}, 'abstain-with-content'],
    [a({requested: null}), 'association-requested-null'],
    [a({requested: []}), 'requested-invalid'],
    [a({requested: [ref('FIAImages', 'a9999')]}), 'requested-out-of-candidate-set'],
    [a({requested: [ref('FIAImages', 'c197')]}), 'requested-out-of-candidate-set'],
    [a({requested: [ref('FIAMaps', 'c197'), ref('FIAMaps', 'c197')]}), 'requested-duplicate'],
    [a({requested: [{collection: 'FIAMaps', id: 'c197', why: 'x'}]}), 'requested-extra-field:why'],
    [a({extra: 1}), 'association-extra-field:extra'],
    [{decision: 'none', association: full().association, display: undecided()}, 'none-with-requested'],
    [a({optionalCompanions: [ref('VideoBibleDictionary', 'a999')]}), 'optionalCompanions-out-of-candidate-set'],
    [a({companionPairs: [{from: ref('VideoBibleDictionary', 'a13')}]}), 'companionPair-missing-field:to'],
    [d({primaryAssetId: 'a9999'}), 'primary-out-of-candidate-set'],
    [d({primaryCollection: null}), 'primary-half-null'],
    [d({primaryAssetId: ['a112']}), 'primary-not-string'],
    [d({primaryCollection: ['FIAImages'], primaryAssetId: ['a112']}), 'primary-not-string'],
    [d({primaryAssetId: 112}), 'primary-not-string'],
    [d({primaryAssetId: {id: 'a112'}}), 'primary-not-string'],
    [d({primaryCollection: {c: 'FIAImages'}}), 'primary-not-string'],
    [{decision: 'none', association: {requested: [], optionalCompanions: null, companionPairs: null}, display: {...undecided(), primaryCollection: 'FIAImages', primaryAssetId: 'a112'}}, 'none-with-display'],
    [{decision: 'none', association: {requested: [], optionalCompanions: null, companionPairs: null}, display: {...undecided(), relatedAssetIds: []}}, 'none-with-display'],
    [d({relatedAssetIds: ['a112', 'a112']}), 'relatedAssetIds-invalid'],
    [d({relatedAssetIds: ['a9999']}), 'relatedAssetIds-out-of-candidate-set'],
    [d({insertions: [{activityId: 'x', assetId: 'c197', fulfills: 'S09-U009'}]}), 'insertion-fulfills-not-target-unit'],
    [d({insertions: [{activityId: 'x', assetId: 'c197'}]}), 'insertion-missing-field:fulfills'],
    [d({extra: null}), 'display-extra-field:extra']
  ];
  for (const [raw, reason] of cases) assert.deepEqual(normalizeOutput(raw, request), {output: {decision: INVALID, association: null, display: null}, confidence: null, normalization: {status: INVALID, reason}}, JSON.stringify(raw));
});

test('authority: an adapter decision is always model-resolved and can never claim source-explicit', async () => {
  const b = await buildRequest(first());
  for (const raw of [{...full(), authority: 'source-explicit'}, {...full(), provenance: {authority: 'source-explicit'}}, full({decision: 'source-explicit'})]) {
    const n = normalizeOutput(raw, b.request);
    assert.equal(n.output.decision, INVALID, JSON.stringify(raw));
    const p = await provenanceFor({transport: 'recorded', request: b.request, requestSha256: b.requestSha256, raw, normalization: n.normalization});
    assert.equal(p.authority, 'model-resolved');
  }
  const p = await provenanceFor({transport: 'recorded', request: b.request, requestSha256: b.requestSha256, raw: {}, normalization: {status: 'accepted', reason: null}, authority: 'source-explicit'});
  assert.equal(p.authority, 'model-resolved');
  assert.equal(AUTHORITY, 'model-resolved');
  const transport = createRecordedTransport({...recordedFile, records: recordedFile.records.map(r => ({...r, response: {...r.response, authority: 'source-explicit'}}))});
  const doc = await runAdapter({casesFile: inputsFile, transport});
  assert.equal(doc.producer.authority, 'model-resolved');
  for (const d of doc.decisions) { assert.equal(d.provenance.authority, 'model-resolved'); assert.equal(d.output.decision, INVALID); }
  assert.ok(!JSON.stringify(doc).includes('"authority":"source-explicit"'));
});

test('transports: recorded miss is an error; none produces requests only; the Jev seam is not activated', async () => {
  const recorded = createRecordedTransport({schema: 'fia-association-question-recorded@1', records: []});
  await assert.rejects(runAdapter({casesFile: inputsFile, transport: recorded}), e => e.reason.startsWith('recorded-response-missing:'));
  const doc = await runAdapter({casesFile: inputsFile, transport: createNoTransport()});
  assert.equal(doc.schema, REQUESTS_SCHEMA); assert.equal(doc.requests.length, 3); assert.equal('decisions' in doc, false);
  await assert.rejects(runAdapter({casesFile: inputsFile, transport: createJevTransport()}), e => e.reason === 'not-activated');
  assert.equal(JEV_SEAM.status, 'not-activated');
});

async function runCli(dir, name) {
  const out = join(dir, name);
  await main(['--cases', new URL('inputs-tuning-subset.json', fixtures).pathname, '--transport', 'recorded', '--responses', new URL('recorded-responses.json', fixtures).pathname, '--out', out]);
  return out;
}

test('end to end: CLI on 3 PR289 tuning cases with recorded responses writes a PR289 decisions file (pipeline test only)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fia-assoc-q-'));
  try {
    const out = await runCli(dir, 'decisions.json');
    const doc = JSON.parse(await readFile(out, 'utf8'));
    assert.equal(doc.schema, DECISIONS_SCHEMA);
    assert.equal(doc.schema, 'fia-association-eval-decisions@1');
    assert.equal(doc.producer.label, RECORDED_LABEL);
    assert.deepEqual(doc.decisions.map(d => [d.caseId, d.output.decision, d.provenance.invalidReason]), [
      ['eng.MRK-1-1-13:S02-U005', 'associate', null],
      ['eng.MRK-2-1-12:S02-U004', 'abstain', null],
      ['spa.MRK-4-35-41:S03-U017', INVALID, 'requested-out-of-candidate-set']
    ]);
    for (const d of doc.decisions) {
      assert.deepEqual(Object.keys(d.output).sort(), ['association', 'decision', 'display']);
      if (d.output.association) assert.deepEqual(Object.keys(d.output.association).sort(), ['companionPairs', 'optionalCompanions', 'requested']);
      if (d.output.display) assert.deepEqual(Object.keys(d.output.display).sort(), ['insertions', 'primaryAssetId', 'primaryCollection', 'relatedAssetIds']);
      for (const k of ['authority', 'modelId', 'modelVersion', 'questionId', 'policyId', 'promptTemplateSha256', 'requestSha256', 'responseSha256']) assert.ok(k in d.provenance, k);
      assert.match(d.provenance.requestSha256, /^[a-f0-9]{64}$/); assert.match(d.provenance.responseSha256, /^[a-f0-9]{64}$/);
      assert.equal(d.provenance.transport, 'recorded');
    }
    const replay = createRecordedTransport(recordedFile);
    await runAdapter({casesFile: inputsFile, transport: replay});
    assert.equal(replay.used.size, recordedFile.records.length, 'every recorded fixture answers a current request');
    assert.equal(await readFile(await runCli(dir, 'again.json'), 'utf8'), await readFile(out, 'utf8'));
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('end to end: PR289 score.mjs accepts the decisions file unchanged (checked when PR289 is present)', {skip: !pr289Present && 'PR289 scripts/association-eval not on this base'}, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fia-assoc-q-'));
  try {
    const {score} = await import(new URL('score.mjs', evalDir));
    const read = async n => JSON.parse(await readFile(new URL(n, evalDir), 'utf8'));
    const gold = await read('gold.json'), split = await read('split.json');
    const decisions = JSON.parse(await readFile(await runCli(dir, 'decisions.json'), 'utf8'));
    const result = score({...gold, cases: gold.cases.filter(c => decisions.decisions.some(d => d.caseId === c.caseId))}, decisions, {split, only: 'tuning'});
    assert.equal(result.overall.cases, 3);
    assert.equal(result.overall.abstained, 1);
    assert.equal(result.overall.errors['invalid-decision'], 1);
    assert.equal(result.overall.errors['dropped-requested'], 0);
    assert.equal(result.overall.errors['extra-requested'], 0);
    assert.equal(result.overall.errors['wrong-primary'], 1, 'display is scored apart from association');
    assert.equal(result.overall.errors['related-order-mismatch'], 1);
    assert.equal(result.overall.errors['insertion-mismatch'], 1, 'null insertions are not filled in');
    assert.equal(result.overall.precision, 1);
    assert.deepEqual(result.unknownCases, []);
    const report = buildReport({score, inputs: await read('inputs.json'), gold, split, decisions});
    assert.deepEqual(report.denominators, {
      'exact-source-inline/spa/heldout': 3, 'exact-source-inline/spa/tuning': 3,
      'semantic-residue/eng/heldout': 4, 'semantic-residue/eng/tuning': 8,
      'semantic-residue/spa/heldout': 4, 'semantic-residue/spa/tuning': 2
    });
    assert.equal(report.strata['exact-source-inline'].decidedInStratum, 1);
    assert.equal(report.strata['semantic-residue'].decidedInStratum, 2);
    assert.equal(report.strata['semantic-residue'].tuning.overall.cases, 10);
    assert.equal(report.strata['semantic-residue'].heldout.overall.cases, 8);
    assert.equal(report.strata['exact-source-inline'].tuning.overall.errors['invalid-decision'], 1);
    assert.equal(report.strata['semantic-residue'].tuning.overall.errors['invalid-decision'], 0, 'inline cases never mix into the model stratum');
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('no gold value appears in the prompt template, and a request carries only values from its own input', {skip: !pr289Present && 'PR289 scripts/association-eval not on this base'}, async () => {
  const read = async n => JSON.parse(await readFile(new URL(n, evalDir), 'utf8'));
  const gold = await read('gold.json'), inputs = await read('inputs.json');
  const strings = (x, out = new Set()) => { if (typeof x === 'string') out.add(x); else if (x && typeof x === 'object') Object.values(x).forEach(v => strings(v, out)); return out; };
  const template = PROMPT_TEMPLATE + JSON.stringify(POLICY);
  // Shared vocabulary (decision values and collection names) is the question's schema, not a gold value.
  const vocabulary = new Set([...ALLOWED_DECISIONS, 'FIAImages', 'FIAMaps', 'VideoBibleDictionary']);
  for (const g of gold.cases) {
    const input = inputs.cases.find(c => c.caseId === g.caseId), inputText = JSON.stringify(input);
    const {request} = await buildRequest(input), requestText = JSON.stringify(request);
    for (const v of strings({output: g.output, provenance: g.provenance})) {
      if (v.length < 4 || vocabulary.has(v)) continue;
      assert.ok(!template.includes(v), `gold value ${v} in prompt template`);
      if (requestText.includes(v)) assert.ok(inputText.includes(v), `${g.caseId}: gold value ${v} reached the request without being in the input`);
    }
    for (const list of [g.output.association.requested, g.output.display.relatedAssetIds, g.output.display.insertions]) if (list?.length) assert.ok(!requestText.includes(JSON.stringify(list)), `${g.caseId}: gold list in request`);
  }
  assert.doesNotMatch(template, /\b[ac]\d{1,5}\b|S\d\d-U\d{3}/, 'template names no asset or unit');
});

test('stratum comes from source HTML: typed inline tags are exact-source, everything else is semantic residue', () => {
  const kinds = inputsFile.cases.map(c => [c.caseId, stratumOf(c)]);
  assert.deepEqual(kinds, [['eng.MRK-1-1-13:S02-U005', 'semantic-residue'], ['eng.MRK-2-1-12:S02-U004', 'semantic-residue'], ['spa.MRK-4-35-41:S03-U017', 'exact-source-inline']]);
});
