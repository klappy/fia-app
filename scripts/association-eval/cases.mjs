// Association evaluation case builder (fia-association-eval@1). Offline and pure apart from reading pinned files.
//
// Two accepted gold sources, each sha-pinned:
//   1. the independently reviewed ledger fia-unit-media-associations@1 (cookbook
//      work/active/2026-10-05-generalized-media-associations/association-ledger.json, vendored byte-identical here);
//   2. the approved first-Mark presentation server/fia/publication/approved-presentation.json.
// Inputs are built only from the retained source archives (source-packs*.json.gz): the unit's own text/html and
// the pack's whole image/map/video catalog as candidates. Gold bindings, focal ids, order and insertions never
// enter an input. Gold reuses the ledger's field names and the presentation's assetId/relatedAssetIds/fulfills.
// A raw-source gate (sources/raw-unit-fragments.json, built by raw-fragments.mjs from the public publisher files)
// refuses any compiled-only resource tag and excludes cases whose tag the publisher has since removed.
//
//   node scripts/association-eval/cases.mjs --write   # regenerate the checked-in case files
//   node scripts/association-eval/cases.mjs --check   # fail unless a fresh build is byte-identical
//
// No model, network, paid or credentialed call is made anywhere in this directory.
import {readFileSync, writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';

export const SCHEMA = 'fia-association-eval@1';
export const SPLIT_SEED = 'fia-association-eval-split@1';
export const HELD_OUT_FRACTION = 0.5;
// First Mark is the user's named manual reference ("whatever is proven approved in manual mapping such as the first
// pericope in mark"); it is the pattern to repeat, so it is pinned to tuning rather than hidden from the tuner.
export const PINNED_SPLIT = Object.freeze({'MRK-1-1-13': 'tuning'});

export const LEDGER_SHA256 = '123733d7aa1c127d8929efa2493b2ae5078657629c0f7b2647e1c44a916656c1';
export const APPROVED_SHA256 = 'ccd72f23c23f932651b500b730b285f32fabd37e50037b5af91d8881f1403975';
export const APPROVED_BYTES = 454295;
// Proven first-Mark visual mappings the coordinator named; each is checked against the approved file.
export const APPROVED_UNITS = Object.freeze(['S02-U005', 'S02-U008', 'S03-U007', 'S03-U019', 'S03-U021', 'S05-U015']);

// Keys that belong to gold (answers) or provenance and must never appear anywhere inside an input case.
export const GOLD_ONLY_KEYS = Object.freeze([
  'output', 'gold', 'provenance', 'decision', 'requested', 'optionalCompanions', 'companionPairs', 'primaryAssetId',
  'primaryCollection', 'primaryDecision', 'relatedAssetIds', 'relatedIds', 'insertions', 'fulfills', 'assetId',
  'availableAssetIds', 'typedGuideAssociation', 'relationEvidence', 'associationBasis', 'referenceTag', 'status', 'split',
]);

const KIND_COLLECTION = Object.freeze({images: 'FIAImages', maps: 'FIAMaps', videos: 'VideoBibleDictionary'});
const VISUAL_KIND_COLLECTION = Object.freeze({image: 'FIAImages', map: 'FIAMaps', video: 'VideoBibleDictionary'});
const sha256 = x => createHash('sha256').update(x).digest('hex');
const here = p => new URL(p, import.meta.url);
const repo = p => new URL('../../' + p, import.meta.url);
const ref = a => ({collection: a.collection, id: a.id});
const fail = m => { throw Error(m); };

// Manual Spanish Luke standard (claim d4c4dea). Rows count as gold only once accepted by an independent reviewer.
export const MANUAL_SPA_LUKE = 'sources/manual-spa-luke.json';
export const MANUAL_ACCEPTED = 'accepted-by-independent-review';
export const MANUAL_PROPOSED = 'proposed-pending-independent-review';
export const OUTPUT_FILES = Object.freeze({inputs: 'inputs.json', gold: 'gold.json', split: 'split.json', coverage: 'coverage.json'});

function pinned(url, sha, bytes) {
  const raw = readFileSync(url);
  if (sha256(raw) !== sha) fail(`pinned-sha-mismatch:${url.pathname}`);
  if (bytes !== undefined && raw.length !== bytes) fail(`pinned-bytes-mismatch:${url.pathname}`);
  return raw;
}

export function loadArchives() {
  const mark = JSON.parse(gunzipSync(readFileSync(repo('server/fia/compiler/presentation/source-packs.json.gz'))));
  const luke = JSON.parse(gunzipSync(readFileSync(repo('server/fia/compiler/presentation/source-packs-luk.json.gz'))));
  if (mark.revision !== luke.revision) fail('source revision mismatch: luk');
  const archiveSha = {
    'server/fia/compiler/presentation/source-packs.json.gz': sha256(readFileSync(repo('server/fia/compiler/presentation/source-packs.json.gz'))),
    'server/fia/compiler/presentation/source-packs-luk.json.gz': sha256(readFileSync(repo('server/fia/compiler/presentation/source-packs-luk.json.gz'))),
  };
  return {revision: mark.revision, packs: {...mark.packs, ...luke.packs}, archiveSha};
}

const unitsOf = pack => new Map(pack.guide.steps.flatMap(s => s.units).map(u => [u.id, u]));

function catalog(pack) {
  const out = [];
  for (const kind of ['images', 'maps', 'videos']) for (const r of pack.resources[kind] || []) {
    out.push({collection: KIND_COLLECTION[kind], id: r.id, kind: r.kind, title: r.title, sourceFile: r.sourceFile,
      sourceFileSha256: r.sourceFileSha256, collectionRevision: pack.manifest.sourceRevisions[KIND_COLLECTION[kind]]});
  }
  const keys = out.map(c => c.collection + ':' + c.id);
  if (new Set(keys).size !== keys.length) fail(`duplicate-catalog-entry:${pack.manifest.packId}`);
  return out;
}

function buildInput(archive, packId, unitId) {
  const pack = archive.packs[packId] || fail(`pack-missing:${packId}`);
  const unit = unitsOf(pack).get(unitId) || fail(`unit-missing:${packId}:${unitId}`);
  if (sha256(unit.text) !== unit.textSha256) fail(`unit-text-hash:${packId}:${unitId}`);
  const g = pack.guide;
  return {
    caseId: `${packId}:${unitId}`,
    packId,
    pericope: pack.manifest.pericope,
    language: pack.manifest.language,
    source: {
      sourceRevision: archive.revision,
      guide: {sourceId: g.sourceId, revision: g.provenance.revision, sourceFile: g.sourceFile, fileSha256: g.sourceFileSha256, contentSha256: g.contentSha256},
      unit: {unitId, kind: unit.kind, text: unit.text, textSha256: unit.textSha256, html: unit.html, htmlSha256: sha256(unit.html)},
    },
    candidates: catalog(pack),
  };
}

// Every gold reference must be one of the input's candidates with the same file identity; otherwise the binding is stale.
function bindAgainst(input, refs, label) {
  for (const r of refs) {
    const c = input.candidates.find(x => x.collection === r.collection && x.id === r.id);
    if (!c) fail(`gold-not-a-candidate:${input.caseId}:${label}:${r.collection}:${r.id}`);
    if (r.sourceFileSha256 && r.sourceFileSha256 !== c.sourceFileSha256) fail(`stale-file-sha:${input.caseId}:${r.id}`);
    if (r.sourceFile && r.sourceFile !== c.sourceFile) fail(`stale-source-file:${input.caseId}:${r.id}`);
  }
}

function checkLedgerUnit(input, row) {
  const {guide, unit} = input.source;
  if (row.unitTextSha256 !== unit.textSha256 || row.unitText !== unit.text) fail(`ledger-text-drift:${input.caseId}`);
  if (row.guideFileSha256 !== guide.fileSha256) fail(`ledger-guide-file-drift:${input.caseId}`);
  if (row.guideContentSha256 !== guide.contentSha256) fail(`ledger-guide-content-drift:${input.caseId}`);
  if (row.htmlSha256 && row.htmlSha256 !== unit.htmlSha256) fail(`ledger-html-drift:${input.caseId}`);
}

function ledgerCases(archive, ledger) {
  const adjudication = {author: 'jobs_author', reviewer: 'jobs_review', acceptedAt: '2026-10-05',
    status: ledger.status, receipt: 'fia-app-cookbook work/active/2026-10-05-generalized-media-associations/RESULTS.md'};
  const out = [];
  for (const row of ledger.rows) {
    const input = buildInput(archive, row.packId, row.unitId);
    checkLedgerUnit(input, row);
    bindAgainst(input, row.requested, 'requested');
    bindAgainst(input, row.optionalCompanions, 'optionalCompanions');
    const output = {
      decision: 'associate',
      association: {
        requested: row.requested.map(ref),
        optionalCompanions: row.optionalCompanions.map(ref),
        companionPairs: row.companionPairs.map(p => ({from: ref(p.from), to: ref(p.to)})),
      },
      display: {primaryCollection: row.primaryCollection, primaryAssetId: row.primaryAssetId, relatedAssetIds: [...row.relatedAssetIds], insertions: null},
    };
    out.push({input, gold: {caseId: input.caseId, output, provenance: {
      goldSource: 'ledger-row', ledgerSchema: ledger.schema, ledgerSha256: LEDGER_SHA256,
      ledgerSourceRevision: ledger.sourceRevision, ledgerGuideRevision: ledger.guideRevision, adjudication,
      evidence: {associationBasis: row.associationBasis, guideSourceId: row.guideSourceId, primaryDecision: row.primaryDecision,
        requested: row.requested.map(r => ({...ref(r), relationEvidence: r.relationEvidence, typedGuideAssociation: r.typedGuideAssociation})),
        optionalCompanions: row.optionalCompanions.map(r => ({...ref(r), relationEvidence: r.relationEvidence})),
        companionBehavior: [...new Set(row.companionPairs.map(p => p.behavior))], companionBasis: [...new Set(row.companionPairs.map(p => p.basis))]},
      notScored: {'display.insertions': 'ledger does not adjudicate activity insertions'},
    }}});
  }
  for (const row of ledger.inlineCandidates) {
    const input = buildInput(archive, row.packId, row.unitId);
    checkLedgerUnit(input, row);
    const asset = {collection: row.collection, id: row.id, sourceFile: row.sourceFile, sourceFileSha256: row.sourceFileSha256};
    bindAgainst(input, [asset], 'inline');
    if (!input.source.unit.html.includes(row.referenceTag)) fail(`inline-tag-absent:${input.caseId}`);
    const output = {
      decision: 'associate',
      association: {requested: [ref(asset)], optionalCompanions: null, companionPairs: null},
      display: {primaryCollection: row.primaryCollection, primaryAssetId: row.primaryAssetId, relatedAssetIds: null, insertions: null},
    };
    out.push({input, gold: {caseId: input.caseId, output, provenance: {
      goldSource: 'ledger-inline', ledgerSchema: ledger.schema, ledgerSha256: LEDGER_SHA256,
      ledgerSourceRevision: ledger.sourceRevision, ledgerGuideRevision: ledger.guideRevision, adjudication,
      evidence: {status: row.status, primaryDecision: row.primaryDecision, referenceTag: row.referenceTag, htmlSha256: row.htmlSha256},
      notScored: {'association.optionalCompanions': 'not adjudicated for inline rows', 'association.companionPairs': 'not adjudicated for inline rows',
        'display.relatedAssetIds': 'not adjudicated for inline rows', 'display.insertions': 'not adjudicated for inline rows'},
    }}});
  }
  return out;
}

// Manual rows bind the exact unit text, guide revision, guide file and content shas from the retained archive. A row is
// admitted only when its compiled unit html carries no resource tag: without an outside read the raw-fragment gate cannot
// verify a tag, and a tagless unit has none to leak. Unresolved rows must truly lack a candidate of the requested kind.
export function manualCases(archive, doc) {
  if (doc.schema !== 'fia-association-eval-manual@1' || doc.language !== 'spa' || doc.book !== 'LUK') fail('manual-schema');
  if (doc.sourceRevision !== archive.revision) fail('manual-source-revision-drift');
  const check = (input, row) => {
    const {guide, unit} = input.source;
    if (row.unitTextSha256 !== unit.textSha256) fail(`manual-text-drift:${input.caseId}`);
    if (row.guideRevision !== undefined && row.guideRevision !== guide.revision) fail(`manual-guide-revision-drift:${input.caseId}`);
    if (row.guideFileSha256 !== undefined && row.guideFileSha256 !== guide.fileSha256) fail(`manual-guide-file-drift:${input.caseId}`);
    if (row.guideContentSha256 !== undefined && row.guideContentSha256 !== guide.contentSha256) fail(`manual-guide-content-drift:${input.caseId}`);
    if ((unit.html.match(RAW_TAG) || []).length) fail(`manual-row-has-resource-tag:${input.caseId}`);
    if (!input.packId.startsWith('spa.LUK-')) fail(`manual-row-not-spanish-luke:${input.caseId}`);
  };
  const rows = [], unresolved = [];
  for (const row of doc.rows) {
    const input = buildInput(archive, row.packId, row.unitId);
    check(input, row);
    if (![MANUAL_ACCEPTED, MANUAL_PROPOSED].includes(row.status)) fail(`manual-status:${input.caseId}`);
    const o = row.output;
    if (!['associate', 'none'].includes(o.decision)) fail(`manual-decision:${input.caseId}`);
    if (o.decision === 'none' && o.association.requested.length) fail(`manual-none-with-requested:${input.caseId}`);
    if (o.decision === 'associate') {
      if (!o.association.requested.length || !row.evidence?.citation) fail(`manual-associate-without-cited-evidence:${input.caseId}`);
      bindAgainst(input, o.association.requested, 'manual');
      bindAgainst(input, o.association.optionalCompanions || [], 'manual-companion');
    }
    if (!row.evidence?.basis || !row.evidence?.reason) fail(`manual-evidence-missing:${input.caseId}`);
    rows.push({row, input, gold: {caseId: input.caseId, output: structuredClone(o), provenance: {
      goldSource: 'manual-spa-luke', manualSchema: doc.schema, manualPath: 'scripts/association-eval/' + MANUAL_SPA_LUKE,
      adjudication: {author: doc.author, authoredAt: doc.authoredAt, status: row.status, claim: doc.claim, method: doc.method},
      evidence: row.evidence,
      notScored: Object.fromEntries([['association.optionalCompanions', o.association.optionalCompanions], ['association.companionPairs', o.association.companionPairs],
        ...Object.entries(o.display).map(([k, v]) => ['display.' + k, v])].filter(([, v]) => v === null).map(([k]) => [k, 'not adjudicated'])),
    }}});
  }
  for (const u of doc.unresolved) {
    const input = buildInput(archive, u.packId, u.unitId);
    check(input, u);
    if (input.candidates.some(c => c.kind === u.requestedKind)) fail(`manual-unresolved-but-candidate-exists:${input.caseId}`);
    unresolved.push({caseId: input.caseId, requestedKind: u.requestedKind, reason: u.reason, candidates: input.candidates.length});
  }
  const ids = [...rows.map(r => r.input.caseId), ...unresolved.map(u => u.caseId)];
  if (new Set(ids).size !== ids.length) fail('manual-duplicate-unit');
  return {rows, unresolved};
}

function approvedCases(archive, approved) {
  const packId = 'eng.MRK-1-1-13';
  const acts = approved.activities;
  const out = [];
  for (const unitId of APPROVED_UNITS) {
    const input = buildInput(archive, packId, unitId);
    const act = acts.find(a => a.id === unitId && a.sourceUnitId === unitId) || fail(`approved-activity-missing:${unitId}`);
    if (act.sourceSha256 !== input.source.unit.textSha256 || act.sourceText !== input.source.unit.text) fail(`approved-text-drift:${unitId}`);
    const visual = id => Boolean(VISUAL_KIND_COLLECTION[approved.assets[id]?.kind]);
    const asRef = id => ({collection: VISUAL_KIND_COLLECTION[approved.assets[id].kind], id});
    if (!visual(act.assetId)) fail(`approved-focal-not-visual:${unitId}`);
    const related = act.relatedAssetIds.filter(visual);
    const insertionActs = acts.filter(a => a.fulfills === unitId);
    const insertions = insertionActs.filter(a => visual(a.assetId)).map(a => ({activityId: a.id, assetId: a.assetId, fulfills: a.fulfills}));
    for (const i of insertions) if (!related.includes(i.assetId) || i.assetId === act.assetId) fail(`approved-insertion-outside-related:${unitId}`);
    bindAgainst(input, related.map(asRef), 'approved');
    const output = {
      decision: 'associate',
      association: {requested: related.map(asRef), optionalCompanions: null, companionPairs: null},
      display: {primaryCollection: asRef(act.assetId).collection, primaryAssetId: act.assetId, relatedAssetIds: related, insertions},
    };
    const nonVisualRelated = act.relatedAssetIds.filter(id => !visual(id));
    out.push({input, gold: {caseId: input.caseId, output, provenance: {
      goldSource: 'approved-presentation', presentationPath: 'server/fia/publication/approved-presentation.json',
      presentationSha256: APPROVED_SHA256, presentationBytes: APPROVED_BYTES, presentationId: approved.id,
      prototypeCommit: '0af90274f13b32a776466e436cd114e6de759783', recipeCommit: '35fcbe52170dacea23ffe9f0aa070a1c92fed508',
      approvedSource: {repository: approved.source.repository, commit: approved.source.commit, guideCommit: approved.source.guide.commit,
        guideFileSha256: approved.source.guide.fileSha256, guideContentSha256: approved.source.guide.contentSha256},
      adjudication: {basis: 'approved manual first-Mark presentation (bundled-passage-v1; 2026-09-11 independent review)',
        receipt: 'apps/web/docs/V3-BLUEPRINT.md L161; fia-app-cookbook product/guidance/bundled-passage-v1.md L13'},
      evidence: {activityId: act.id, activityKind: act.kind, unitTextMatchesArchive: true},
      disclosedNotScored: {
        nonVisualRelatedAssetIds: nonVisualRelated,
        nonVisualInsertions: insertionActs.filter(a => !visual(a.assetId)).map(a => ({activityId: a.id, assetId: a.assetId, fulfills: a.fulfills})),
        assetLevelVideoCompanions: Object.fromEntries(related.map(id => [id, approved.assets[id].relatedIds || []])),
        note: 'Key-term assets are outside the visual candidate set. Video companions are asset-level, optional and not autoplay; the approved file adjudicates no unit-level companion, so companion fields are null (not scored). Historical generated descriptions are provenance only and authorize no new text or voice.',
      },
      notScored: {'association.optionalCompanions': 'asset-level only in the approved file', 'association.companionPairs': 'asset-level only in the approved file'},
    }}});
  }
  return out;
}

// Deterministic split by pericope. Pericopes are grouped into strata by the kind of gold they carry (a pericope with any
// reviewed semantic row is "semantic", otherwise its gold source), so tuning and held-out each see every kind the
// stratum size allows. Within a stratum, pericopes rank by sha256(seed:pericope); the first round(n*fraction) are
// held out. Pinned pericopes bypass ranking. Every language of one pericope lands in the same split.
export function assignSplit(strata, seed = SPLIT_SEED, fraction = HELD_OUT_FRACTION, pin = PINNED_SPLIT) {
  const all = Object.keys(strata).sort();
  const assignment = {}, ranks = {};
  for (const p of all) if (pin[p]) assignment[p] = pin[p];
  const groups = {};
  for (const p of all) if (!pin[p]) (groups[strata[p]] ||= []).push(p);
  for (const name of Object.keys(groups).sort()) {
    const free = groups[name].map(p => ({pericope: p, rank: sha256(seed + ':' + p)})).sort((a, b) => (a.rank < b.rank ? -1 : 1));
    const heldCount = Math.round(free.length * fraction);
    free.forEach((f, i) => { ranks[f.pericope] = f.rank; assignment[f.pericope] = i < heldCount ? 'heldout' : 'tuning'; });
  }
  return {seed, heldOutFraction: fraction, pinned: {...pin}, strata: Object.fromEntries(all.map(p => [p, strata[p]])),
    ranks: Object.fromEntries(Object.entries(ranks).sort()), assignment: Object.fromEntries(Object.entries(assignment).sort())};
}

export function strataOf(goldCases) {
  const strata = {};
  for (const g of goldCases) {
    const p = g.pericope, src = g.goldSource === 'ledger-row' ? 'semantic' : g.goldSource;
    if (!strata[p] || src === 'semantic') strata[p] = src;
  }
  return strata;
}

function lukeReport(archive, gold, manual, assignment) {
  const packs = Object.keys(archive.packs).filter(id => id.startsWith('spa.LUK-')).sort();
  const units = packs.reduce((n, id) => n + archive.packs[id].guide.steps.flatMap(s => s.units).length, 0);
  const records = Object.fromEntries(['images', 'maps', 'videos'].map(k => [k, packs.reduce((n, id) => n + (archive.packs[id].resources[k] || []).length, 0)]));
  const goldCases = gold.filter(g => g.caseId.startsWith('spa.LUK-')).map(g => g.caseId);
  return {
    packs: packs.length, guideUnits: units, catalogRecords: records, adjudicatedGoldCases: goldCases.length, cases: goldCases,
    manualStandard: manualReport(manual, assignment),
    finding: 'No accepted, independently adjudicated association evidence exists for any Spanish Luke unit: the reviewed ledger covers Mark 1:14-20, 2:1-12 and typed inline Mark rows only, and the approved presentation is English Mark 1:1-13. Historical Spanish Mark gold does not prove Spanish Luke.',
    adjudicationNeeded: [
      'For each spa.LUK pack, a source author identifies, unit by unit, which units request a picture, map or video, binding the exact unit id, unit text sha256, guide revision and guide file sha256 from source-packs-luk.json.gz at the stated source revision.',
      'For each such unit, the author binds every requested resource by typed identity (collection + contentId) to a candidate in that pack catalog with its source file and file sha256, records the relation evidence (typed inline reference, or reviewed unit instruction plus the typed passage association in the English guide where Spanish relies on shared media), separates optional video companions and explicit companion pairs, and records any curated primary as a display choice.',
      'An independent reviewer who is not the author checks the exact rows against source and accepts them; only then are they appended to an fia-unit-media-associations@1 ledger with a new pinned sha256 and admitted here as gold.',
      'No runtime per-item human queue is introduced; adjudication is an offline batch that precedes scoring.',
    ],
  };
}

function manualReport(manual, assignment) {
  const count = rows => Object.fromEntries(['associate', 'none'].map(d => [d, rows.filter(r => r.row.output.decision === d).length]));
  const accepted = manual.rows.filter(r => r.row.status === MANUAL_ACCEPTED), proposed = manual.rows.filter(r => r.row.status === MANUAL_PROPOSED);
  const pericopes = [...new Set(manual.rows.map(r => r.input.pericope))].sort();
  return {source: 'scripts/association-eval/' + MANUAL_SPA_LUKE, pericopes,
    splitIfAccepted: Object.fromEntries(pericopes.map(p => [p, assignment[p]])),
    accepted: {cases: accepted.length, byDecision: count(accepted)},
    proposedPendingIndependentReview: {cases: proposed.length, byDecision: count(proposed), caseIds: proposed.map(r => r.input.caseId)},
    unresolvedNotGold: manual.unresolved};
}

const RAW_TAG = /<data\b[^>]*\bdata-resource-code="[^"]*"[^>]*>/g;

// Raw-source gate. Every resource tag in an input's unit html must occur in the raw publisher fragment at the pinned
// revision (a compiled-only tag would leak a binding and is a hard failure), and also at the current raw revision;
// a case whose tag the publisher has since removed is excluded from the case files and reported, not scored.
export function rawGate(built, fragmentsDoc) {
  const byId = new Map(fragmentsDoc.fragments.map(f => [f.caseId, f]));
  const kept = [], excluded = [];
  for (const b of built) {
    // Manual Spanish Luke rows were admitted tagless by manualCases; they have no tag to verify and no committed fragment.
    if (b.gold.provenance.goldSource === 'manual-spa-luke') { kept.push(b); continue; }
    const f = byId.get(b.input.caseId) || fail(`raw-fragment-missing:${b.input.caseId}`);
    if (f.contentId !== b.input.source.guide.sourceId) fail(`raw-fragment-article:${b.input.caseId}`);
    if (f.pinned.match !== 'exact-html' || f.pinned.html !== b.input.source.unit.html) fail(`compiled-html-differs-from-raw:${b.input.caseId}`);
    const tags = b.input.source.unit.html.match(RAW_TAG) || [];
    for (const t of tags) if (!f.pinned.resourceTags.includes(t)) fail(`compiled-only-resource-tag:${b.input.caseId}:${t}`);
    const absent = tags.filter(t => !f.current.resourceTags.includes(t));
    if (absent.length) excluded.push({caseId: b.input.caseId, goldSource: b.gold.provenance.goldSource,
      reason: 'resource-tag-absent-from-current-raw-source', currentRevision: fragmentsDoc.sources.current.revision, absentTags: absent});
    else kept.push(b);
  }
  return {kept, excluded};
}

export function collectCases(opt = {}) {
  const ledgerRaw = pinned(here('./sources/association-ledger.json'), LEDGER_SHA256);
  const approvedRaw = pinned(repo('server/fia/publication/approved-presentation.json'), APPROVED_SHA256, APPROVED_BYTES);
  const ledger = JSON.parse(ledgerRaw), approved = JSON.parse(approvedRaw);
  if (ledger.schema !== 'fia-unit-media-associations@1') fail('ledger-schema');
  const archive = loadArchives();
  if (archive.revision !== ledger.sourceRevision) fail('ledger-source-revision-drift');
  const manualDoc = opt.manual ?? JSON.parse(readFileSync(here('./' + MANUAL_SPA_LUKE)));
  const manual = manualCases(archive, manualDoc);
  const accepted = manual.rows.filter(r => r.row.status === MANUAL_ACCEPTED).map(({input, gold}) => ({input, gold}));
  const built = [...approvedCases(archive, approved), ...ledgerCases(archive, ledger), ...accepted];
  const ids = built.map(b => b.input.caseId);
  if (new Set(ids).size !== ids.length) fail('duplicate-case-id');
  const order = (a, b) => (a.input.caseId < b.input.caseId ? -1 : a.input.caseId > b.input.caseId ? 1 : 0);
  built.sort(order);
  return {built, ledger, archive, manual};
}

export function buildCases(opt = {}) {
  const fragmentsRaw = readFileSync(here('./sources/raw-unit-fragments.json'));
  const fragmentsDoc = JSON.parse(fragmentsRaw);
  const {built: all, ledger, archive, manual} = collectCases(opt);
  const {kept: built, excluded} = rawGate(all, fragmentsDoc);
  const strata = strataOf(built.map(b => ({pericope: b.input.pericope, goldSource: b.gold.provenance.goldSource})));
  const split = assignSplit(strata);
  // Where each manual pericope lands under the same deterministic split once its rows are accepted (other pericopes do not move).
  const withManual = assignSplit({...strata, ...strataOf(manual.rows.map(r => ({pericope: r.input.pericope, goldSource: 'manual-spa-luke'})))});
  const header = {schema: SCHEMA, sourceRevision: archive.revision, archives: archive.archiveSha,
    goldSources: {ledger: {path: 'scripts/association-eval/sources/association-ledger.json', sha256: LEDGER_SHA256},
      approvedPresentation: {path: 'server/fia/publication/approved-presentation.json', sha256: APPROVED_SHA256, bytes: APPROVED_BYTES}},
    rawSource: {path: 'scripts/association-eval/sources/raw-unit-fragments.json', sha256: sha256(fragmentsRaw),
      pinnedRevision: fragmentsDoc.sources.pinned.revision, currentRevision: fragmentsDoc.sources.current.revision}};
  const inputs = {...header, kind: 'inputs', cases: built.map(b => b.input)};
  const gold = {...header, kind: 'gold', cases: built.map(b => b.gold)};
  const caseSplit = built.map(b => ({caseId: b.input.caseId, pericope: b.input.pericope, language: b.input.language, split: split.assignment[b.input.pericope]}));
  // Spanish Luke is counted apart, so it never blends into the Spanish Mark held-out coverage.
  const counts = {}, countsSpanishLuke = {};
  for (const c of caseSplit) {
    if (c.pericope.startsWith('LUK-')) { countsSpanishLuke[c.split] = (countsSpanishLuke[c.split] || 0) + 1; continue; }
    const k = `${c.language}/${c.split}`; counts[k] = (counts[k] || 0) + 1;
  }
  const bySource = {};
  for (const g of gold.cases) bySource[g.provenance.goldSource] = (bySource[g.provenance.goldSource] || 0) + 1;
  const splitDoc = {schema: SCHEMA, kind: 'split', ...split, cases: caseSplit, counts: Object.fromEntries(Object.entries(counts).sort()),
    countsSpanishLuke: Object.fromEntries(Object.entries(countsSpanishLuke).sort())};
  const coverage = {schema: SCHEMA, kind: 'coverage', cases: built.length, bySource: Object.fromEntries(Object.entries(bySource).sort()),
    byLanguage: Object.fromEntries(['eng', 'spa'].map(l => [l, built.filter(b => b.input.language === l).length])),
    candidateCases: all.length, excludedByRawGate: excluded,
    ledgerUnresolvedNotCases: ledger.unresolved.map(u => ({packId: u.packId, collection: u.collection, id: u.id, reason: u.reason})),
    spanishLuke: lukeReport(archive, gold.cases, manual, withManual.assignment),
    limits: [
      'The accepted foundation is 24 ledger units in 14 packs (12 semantic rows, 12 typed inline) plus 6 approved first-Mark units. Cases whose typed inline tag is absent from current raw publisher source are excluded and listed in excludedByRawGate. All gold cases are positive associations; no adjudicated no-visual negatives are included yet.',
      'Historical counts (379 candidate instructions over 114 of 136 packs; 357 outside coverage) are review workload, not acceptance figures for the current 165-pack-per-language set.',
      'October 6 cue-role pilot outputs are not resource-association gold and are not read.',
      'Manual Spanish Luke rows are admitted only when their compiled unit html carries no resource tag (no raw-fragment verification without an outside read), and count as gold only once accepted by an independent reviewer.',
    ]};
  const text = o => JSON.stringify(o, null, 2) + '\n';
  return {inputs: text(inputs), gold: text(gold), split: text(splitDoc), coverage: text(coverage)};
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const built = buildCases(), mode = process.argv[2];
  if (mode === '--write') {
    for (const [k, f] of Object.entries(OUTPUT_FILES)) writeFileSync(here('./' + f), built[k]);
  } else if (mode === '--check') {
    for (const [k, f] of Object.entries(OUTPUT_FILES)) if (readFileSync(here('./' + f), 'utf8') !== built[k]) fail(`not-reproducible:${f}`);
  } else fail('usage: cases.mjs --write | --check');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(OUTPUT_FILES).map(([k, f]) => [f, sha256(built[k])])), null, 2));
}
