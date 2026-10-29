// First executable test and eval for scripts/association-eval (offline; no model, network or paid call).
//   node --test tests/association-eval/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildCases, OUTPUT_FILES, GOLD_ONLY_KEYS, LEDGER_SHA256, APPROVED_SHA256, APPROVED_UNITS, assignSplit, rawGate, collectCases, manualCases, MANUAL_SPA_LUKE, MANUAL_ACCEPTED, MANUAL_PROPOSED} from '../../scripts/association-eval/cases.mjs';
import {score, goldAsDecisions, ERROR_TYPES} from '../../scripts/association-eval/score.mjs';

const dir = new URL('../../scripts/association-eval/', import.meta.url);
const read = f => readFileSync(new URL(f, dir), 'utf8');
const json = f => JSON.parse(read(f));
const sha256 = x => createHash('sha256').update(x).digest('hex');
const built = buildCases();
const inputs = json('inputs.json'), gold = json('gold.json'), split = json('split.json'), coverage = json('coverage.json');
const fragments = json('sources/raw-unit-fragments.json');

test('builder reproduces byte-identical case files from the pinned ledger, approved presentation and archives', () => {
  assert.equal(sha256(readFileSync(new URL('sources/association-ledger.json', dir))), LEDGER_SHA256);
  assert.equal(sha256(readFileSync(new URL('../../server/fia/publication/approved-presentation.json', import.meta.url))), APPROVED_SHA256);
  for (const [k, f] of Object.entries(OUTPUT_FILES)) assert.equal(built[k], read(f), `${f} is not reproducible`);
  assert.deepEqual(buildCases(), built, 'two builds differ');
});

test('case counts: 28 scored cases (24 Mark, 4 accepted Spanish Luke none rows); six English typed-inline cases excluded by the raw gate', () => {
  assert.equal(inputs.cases.length, 28);
  assert.equal(gold.cases.length, 28);
  assert.deepEqual(coverage.byLanguage, {eng: 12, spa: 16});
  assert.deepEqual(coverage.bySource, {'approved-presentation': 6, 'ledger-inline': 6, 'ledger-row': 12, 'manual-spa-luke': 4});
  assert.equal(coverage.candidateCases, 34);
  assert.deepEqual(coverage.excludedByRawGate.map(e => e.caseId), ['eng.MRK-3-7-12:S05-U006', 'eng.MRK-4-1-20:S03-U021', 'eng.MRK-4-35-41:S03-U017',
    'eng.MRK-6-45-56:S05-U005', 'eng.MRK-8-11-21:S05-U009', 'eng.MRK-8-11-21:S05-U013']);
  assert.deepEqual(gold.cases.filter(g => g.provenance.goldSource === 'approved-presentation').map(g => g.caseId.split(':')[1]), [...APPROVED_UNITS]);
  assert.equal(coverage.spanishLuke.adjudicatedGoldCases, 4);
  assert.equal(coverage.spanishLuke.packs, 97);
  assert.deepEqual(inputs.cases.map(c => c.caseId), gold.cases.map(c => c.caseId));
});

test('first-Mark gold matches the approved presentation mappings exactly (assetId, relatedAssetIds, fulfills)', () => {
  const g = Object.fromEntries(gold.cases.filter(c => c.caseId.startsWith('eng.MRK-1-1-13:')).map(c => [c.caseId.split(':')[1], c.output.display]));
  const pick = d => [d.primaryAssetId, d.relatedAssetIds, d.insertions.map(i => `${i.activityId}>${i.fulfills}`)];
  assert.deepEqual(pick(g['S02-U005']), ['a112', ['a112', 'c197'], ['S02-U005-resource-c197>S02-U005']]);
  assert.deepEqual(pick(g['S02-U008']), ['a203', ['a203', 'a204'], ['S02-U008-resource-a204>S02-U008']]);
  assert.deepEqual(pick(g['S03-U007']), ['c168', ['c168'], []]);
  assert.deepEqual(pick(g['S03-U019']), ['a112', ['a112', 'a111'], ['S03-U019-resource-a111>S03-U019']]);
  assert.deepEqual(pick(g['S03-U021']), ['c201', ['c201', 'c202'], ['S03-U021-resource-c202>S03-U021']]);
  assert.deepEqual(pick(g['S05-U015']), ['a111', ['a111'], []]);
  const s15 = gold.cases.find(c => c.caseId === 'eng.MRK-1-1-13:S05-U015').provenance.disclosedNotScored;
  assert.deepEqual(s15.nonVisualRelatedAssetIds, ['eng-t38-v1', 'eng-t145-v1']);
});

test('no gold-only or provenance field appears anywhere in an input case', () => {
  const banned = new Set(GOLD_ONLY_KEYS);
  const walk = (v, path) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { assert.ok(!banned.has(k), `gold-only key ${path}.${k}`); walk(x, `${path}.${k}`); }
  };
  inputs.cases.forEach(c => walk(c, c.caseId));
  // Inputs carry the whole pack catalog, never a gold-filtered list, and every gold asset is among the candidates.
  const archives = collectCases().archive;
  for (const c of inputs.cases) {
    const p = archives.packs[c.packId].resources;
    assert.equal(c.candidates.length, ['images', 'maps', 'videos'].reduce((n, k) => n + (p[k] || []).length, 0), c.caseId);
    const g = gold.cases.find(x => x.caseId === c.caseId).output;
    for (const r of g.association.requested) assert.ok(c.candidates.some(x => x.collection === r.collection && x.id === r.id), `${c.caseId} ${r.id}`);
  }
  // The guard itself trips on a seeded leak.
  const leaked = structuredClone(inputs.cases[0]); leaked.candidates[0].primaryAssetId = 'x';
  assert.throws(() => walk(leaked, 'leak'), /gold-only key/);
});

test('no input carries a resource tag absent from raw publisher source (pinned and current revisions)', () => {
  assert.equal(fragments.sources.pinned.revision, 'eb744452eb8d7c852caadde9d3181cddfe571119');
  assert.equal(fragments.sources.current.revision, '96bb023ab1852ab8bdc3a469fcc820e9f9ea1e30');
  const tag = /<data\b[^>]*\bdata-resource-code="[^"]*"[^>]*>/g;
  const manualIds = new Set(gold.cases.filter(g => g.provenance.goldSource === 'manual-spa-luke').map(g => g.caseId));
  for (const c of inputs.cases) {
    // Manual Spanish Luke rows have no committed raw fragment; they are admitted only when their html carries no tag at all.
    if (manualIds.has(c.caseId)) { assert.equal((c.source.unit.html.match(tag) || []).length, 0, `${c.caseId}: manual row carries a tag`); continue; }
    const f = fragments.fragments.find(x => x.caseId === c.caseId);
    assert.ok(f, c.caseId);
    assert.equal(sha256(f.pinned.html), f.pinned.htmlSha256);
    assert.equal(sha256(f.current.html), f.current.htmlSha256);
    assert.equal(f.pinned.html, c.source.unit.html, `${c.caseId}: compiled html differs from raw`);
    for (const t of c.source.unit.html.match(tag) || []) {
      assert.ok(f.pinned.resourceTags.includes(t), `${c.caseId}: tag absent from pinned raw`);
      assert.ok(f.current.resourceTags.includes(t), `${c.caseId}: tag absent from current raw`);
    }
  }
  // The gate refuses a compiled-only tag and excludes a tag the publisher removed.
  const {built: all} = collectCases();
  const forged = structuredClone(fragments); const fx = forged.fragments.find(x => x.caseId === 'spa.MRK-4-35-41:S03-U017');
  fx.pinned.resourceTags = [];
  assert.throws(() => rawGate(all, forged), /compiled-only-resource-tag/);
  const removed = structuredClone(fragments); removed.fragments.find(x => x.caseId === 'spa.MRK-4-35-41:S03-U017').current.resourceTags = [];
  assert.ok(rawGate(all, removed).excluded.some(e => e.caseId === 'spa.MRK-4-35-41:S03-U017'));
});

test('split is deterministic by pericope with no pericope in both splits; first Mark is tuning', () => {
  const byPericope = {};
  for (const c of split.cases) (byPericope[c.pericope] ||= new Set()).add(c.split);
  for (const [p, s] of Object.entries(byPericope)) assert.equal(s.size, 1, `pericope ${p} leaks across splits`);
  for (const c of inputs.cases) assert.equal(split.cases.find(x => x.caseId === c.caseId).split, split.assignment[c.pericope]);
  assert.equal(split.assignment['MRK-1-1-13'], 'tuning');
  assert.deepEqual(assignSplit(split.strata).assignment, split.assignment);
  for (const lang of ['eng', 'spa']) for (const s of ['tuning', 'heldout']) assert.ok(split.counts[`${lang}/${s}`] > 0, `${lang}/${s} empty`);
  assert.deepEqual(split.counts, {'eng/heldout': 4, 'eng/tuning': 8, 'spa/heldout': 7, 'spa/tuning': 5});
});

test('scoring gold against itself gives precision 1.0, zero errors and zero abstentions per language', () => {
  const r = score(gold, goldAsDecisions(gold), {split});
  for (const v of [r.overall, ...Object.values(r.languages)]) {
    assert.equal(v.precision, 1); assert.equal(v.recall, 1); assert.equal(v.casePrecision, 1);
    assert.equal(v.errorCount, 0); assert.equal(v.abstentionRate, 0);
  }
  assert.deepEqual(Object.keys(r.languages), ['eng', 'spa']);
  for (const only of ['tuning', 'heldout']) assert.equal(score(gold, goldAsDecisions(gold), {split, only}).overall.errorCount, 0);
});

test('perturbed decisions file yields exactly the expected errors; provenance is never scored', () => {
  const perturbed = JSON.parse(readFileSync(new URL('./fixtures/perturbed-decisions.json', import.meta.url), 'utf8'));
  // The perturbed fixture predates the Spanish Luke rows, so it is scored against the 24 Mark cases it was built for.
  const r = score({...gold, cases: gold.cases.filter(c => !c.caseId.startsWith('spa.LUK-'))}, perturbed, {split});
  const nonzero = v => Object.fromEntries(Object.entries(v.errors).filter(([, n]) => n));
  assert.deepEqual(nonzero(r.languages.eng), {'missed-association': 1, 'dropped-requested': 1, 'extra-requested': 1, 'related-order-mismatch': 1, 'insertion-mismatch': 1});
  assert.deepEqual(nonzero(r.languages.spa), {'missing-decision': 1, 'collection-mismatch': 1, 'companion-as-requested': 1, 'dropped-companion': 1, 'wrong-primary': 1});
  assert.equal(r.overall.errors['unknown-case'], 1);
  assert.equal(r.languages.eng.abstentionRate, 0);
  assert.equal(r.languages.spa.abstentionRate, round(1 / 12));
  assert.equal(r.languages.eng.precision, round(28 / 29));
  assert.equal(r.languages.spa.precision, round(30 / 32));
  assert.ok(!r.perCase.some(c => c.caseId === 'eng.MRK-1-1-13:S03-U007'), 'provenance-only change was scored');
  for (const t of Object.keys(r.overall.errors)) assert.ok(ERROR_TYPES.includes(t));
});

function round(x) { return Math.round(x * 1e6) / 1e6; }

// ---- Manual Spanish Luke standard (claim d4c4dea): proposed rows, admission by independent acceptance only. ----
const manualDoc = json(MANUAL_SPA_LUKE);
const accept = doc => ({...structuredClone(doc), rows: doc.rows.map(r => ({...structuredClone(r), status: MANUAL_ACCEPTED}))});

const propose = doc => ({...structuredClone(doc), rows: doc.rows.map(r => ({...structuredClone(r), status: MANUAL_PROPOSED}))});

test('Spanish Luke manual rows: accepted by independent review 5693932562; unresolved map cues stay out of gold', () => {
  const m = coverage.spanishLuke.manualStandard;
  assert.equal(manualDoc.acceptance.review, '5693932562');
  for (const r of manualDoc.rows) { assert.equal(r.status, MANUAL_ACCEPTED); assert.equal(r.acceptedBy, 'review 5693932562'); }
  assert.equal(coverage.spanishLuke.adjudicatedGoldCases, 4);
  assert.deepEqual(m.accepted, {cases: 4, byDecision: {associate: 0, none: 4}});
  assert.deepEqual(m.proposedPendingIndependentReview, {cases: 0, byDecision: {associate: 0, none: 0}, caseIds: []});
  assert.equal(m.qualifiesSpanishLukeMappingCoverage, false, 'none rows are negatives, not mapping coverage');
  assert.deepEqual(m.unresolvedNotGold.map(u => [u.caseId, u.requestedKind, u.reason, u.candidates]), [
    ['spa.LUK-1-26-38:S02-U004', 'map', 'no-eligible-candidate-in-pack-catalog', 0], ['spa.LUK-1-26-38:S05-U003', 'map', 'no-eligible-candidate-in-pack-catalog', 0]]);
  const luke = gold.cases.filter(c => c.caseId.startsWith('spa.LUK-'));
  assert.deepEqual(luke.map(c => c.caseId), ['spa.LUK-1-26-38:S02-U003', 'spa.LUK-1-26-38:S02-U013', 'spa.LUK-1-26-38:S03-U011', 'spa.LUK-1-26-38:S04-U015']);
  for (const c of luke) {
    assert.equal(c.output.decision, 'none'); assert.deepEqual(c.output.association.requested, []);
    assert.equal(c.provenance.goldSource, 'manual-spa-luke'); assert.equal(c.provenance.adjudication.acceptance.review, '5693932562');
  }
  assert.ok(!gold.cases.some(c => /S02-U004|S05-U003/.test(c.caseId) && c.caseId.startsWith('spa.LUK-')));
});

test('Spanish Luke lands by the same deterministic split, apart from Spanish Mark, moving nothing else', () => {
  assert.equal(split.assignment['LUK-1-26-38'], 'heldout');
  assert.equal(split.assignment['MRK-1-1-13'], 'tuning');
  assert.deepEqual(split.counts, {'eng/heldout': 4, 'eng/tuning': 8, 'spa/heldout': 7, 'spa/tuning': 5}, 'Spanish Mark coverage is unchanged');
  assert.deepEqual(split.countsSpanishLuke, {heldout: 4});
  const before = JSON.parse(buildCases({manual: propose(manualDoc)}).split);
  for (const [p, v] of Object.entries(before.assignment)) assert.equal(split.assignment[p], v, `${p} moved`);
  assert.equal(JSON.parse(buildCases({manual: propose(manualDoc)}).coverage).spanishLuke.adjudicatedGoldCases, 0, 'proposed rows are never gold');
  const banned = new Set(GOLD_ONLY_KEYS);
  const walk = v => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { assert.ok(!banned.has(k), k); walk(x); } };
  inputs.cases.filter(c => c.caseId.startsWith('spa.LUK-')).forEach(walk);
  // Gold "none" is scored: none is correct, an association is an extra request, abstain is an abstention, absence is missing.
  const luke = gold.cases.filter(c => c.caseId.startsWith('spa.LUK-'));
  const r = score({...gold, cases: luke}, {schema: 'fia-association-eval-decisions@1', decisions: [
    {caseId: 'spa.LUK-1-26-38:S02-U003', output: luke[0].output},
    {caseId: 'spa.LUK-1-26-38:S02-U013', output: {decision: 'associate', association: {requested: [{collection: 'FIAMaps', id: 'c1'}]}, display: {}}},
    {caseId: 'spa.LUK-1-26-38:S03-U011', output: {decision: 'abstain'}}]});
  assert.equal(r.overall.cases, 4); assert.equal(r.overall.abstained, 1); assert.equal(r.overall.missing, 1);
  assert.equal(r.overall.errors['extra-requested'], 1); assert.equal(r.overall.errors['missing-decision'], 1);
  assert.equal(r.overall.casePrecision, 0.5);
});

test('Spanish Luke manual guards: tagged units, uncited associations, false unresolved and text drift are refused', () => {
  const archive = collectCases().archive;
  const base = manualDoc.rows[0];
  const bad = patch => ({...structuredClone(manualDoc), rows: [{...structuredClone(base), ...patch}], unresolved: []});
  assert.throws(() => manualCases(archive, bad({unitId: 'S05-U002', unitTextSha256: archive.packs['spa.LUK-1-26-38'].guide.steps.flatMap(s => s.units).find(u => u.id === 'S05-U002').textSha256})), /manual-row-has-resource-tag/);
  assert.throws(() => manualCases(archive, bad({unitTextSha256: 'f'.repeat(64)})), /manual-text-drift/);
  assert.throws(() => manualCases(archive, bad({output: {...base.output, decision: 'associate', association: {requested: [{collection: 'FIAMaps', id: 'c1'}], optionalCompanions: null, companionPairs: null}}})), /manual-associate-without-cited-evidence/);
  assert.throws(() => manualCases(archive, bad({output: {...base.output, decision: 'abstain'}})), /manual-decision/);
  const withMap = Object.keys(archive.packs).find(id => id.startsWith('spa.LUK-') && (archive.packs[id].resources.maps || []).length);
  const unit = archive.packs[withMap].guide.steps.flatMap(s => s.units).find(u => !/data-resource-code/.test(u.html));
  assert.throws(() => manualCases(archive, {...structuredClone(manualDoc), rows: [], unresolved: [{packId: withMap, unitId: unit.id, unitTextSha256: unit.textSha256, requestedKind: 'map', reason: 'x'}]}), /manual-unresolved-but-candidate-exists/);
});
