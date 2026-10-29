// Association decision scorer (fia-association-eval@1). Pure; no I/O except the CLI wrapper.
//
// A decisions file from any producer (manual, deterministic or model) has the gold output shape:
//   {schema: 'fia-association-eval-decisions@1', producer: {...}, decisions: [{caseId, output: {decision, association, display}}]}
// output.decision is 'associate', 'none' or 'abstain'. Only output.decision, output.association.* and output.display.* are
// scored; anything else (provenance, producer notes, confidences) is ignored. A gold field that is null was not
// adjudicated and is not scored.
//
//   node scripts/association-eval/score.mjs <decisions.json> [--split tuning|heldout]
import {readFileSync} from 'node:fs';

export const DECISIONS_SCHEMA = 'fia-association-eval-decisions@1';
export const ERROR_TYPES = Object.freeze([
  'missing-decision',        // no decision for a gold case
  'invalid-decision',        // decision is not associate|none|abstain, or the output shape is malformed
  'missed-association',      // decided none where gold associates
  'dropped-requested',       // a gold requested asset is absent
  'extra-requested',         // a requested asset gold does not request (false positive)
  'collection-mismatch',     // right bare id, wrong collection (no cross-collection coercion)
  'companion-as-requested',  // an optional companion (video) promoted to a requested picture/map
  'dropped-companion',
  'extra-companion',
  'wrong-companion-pair',
  'wrong-primary',           // curated display choice differs
  'related-set-mismatch',
  'related-order-mismatch',
  'insertion-mismatch',
  'insertion-order-mismatch',
  'unknown-case',            // a decision for a case that is not in gold
]);
const DECISIONS = new Set(['associate', 'none', 'abstain']);
const key = r => `${r?.collection}:${r?.id}`;
const round = x => (Number.isFinite(x) ? Math.round(x * 1e6) / 1e6 : null);
const ratio = (a, b) => (b > 0 ? round(a / b) : null);
const isRefList = v => Array.isArray(v) && v.every(r => r && typeof r.collection === 'string' && typeof r.id === 'string');

/**
 * Errors for one case. Returns {abstained, missing, errors: [{type, detail}], tp, fp, fn}; tp/fp/fn count authored
 * association items (requested + optional companions). precision = tp/(tp+fp) over resolved cases; an abstention is
 * neither right nor wrong for precision and is reported as the abstention rate; a missing decision is an error.
 */
export function scoreCase(gold, predicted) {
  const errors = [], push = (type, detail) => errors.push(detail === undefined ? {type} : {type, detail});
  const res = {abstained: false, missing: false, errors, tp: 0, fp: 0, fn: 0};
  if (!predicted) { res.missing = true; res.fn += gold.output.association.requested?.length ?? 0; push('missing-decision'); return res; }
  const out = predicted.output;
  if (!out || !DECISIONS.has(out.decision)) { push('invalid-decision'); return res; }
  if (out.decision === 'abstain') { res.abstained = true; return res; }
  const g = gold.output;
  if (g.decision === 'associate' && out.decision === 'none') {
    push('missed-association');
    res.fn += g.association.requested.length;
    return res;
  }
  const a = out.association || {}, d = out.display || {};
  // association.requested
  if (g.association.requested !== null) {
    if (!isRefList(a.requested)) { push('invalid-decision', 'association.requested'); return res; }
    const gold = new Map(g.association.requested.map(r => [key(r), r])), pred = new Map(a.requested.map(r => [key(r), r]));
    const goldIds = new Map(g.association.requested.map(r => [r.id, r]));
    const companions = new Set((g.association.optionalCompanions || []).map(key));
    for (const [k, r] of pred) {
      if (gold.has(k)) { res.tp++; continue; }
      res.fp++;
      if (companions.has(k)) push('companion-as-requested', k);
      else if (goldIds.has(r.id) && !pred.has(key(goldIds.get(r.id)))) push('collection-mismatch', k);
      else push('extra-requested', k);
    }
    for (const [k, r] of gold) if (!pred.has(k)) {
      res.fn++;
      const coerced = [...pred.values()].some(p => p.id === r.id && p.collection !== r.collection);
      if (!coerced) push('dropped-requested', k);
    }
  }
  // association.optionalCompanions
  if (g.association.optionalCompanions !== null) {
    const p = a.optionalCompanions ?? [];
    if (!isRefList(p)) push('invalid-decision', 'association.optionalCompanions');
    else {
      const gs = new Set(g.association.optionalCompanions.map(key)), ps = new Set(p.map(key));
      for (const k of ps) if (gs.has(k)) res.tp++; else { res.fp++; push('extra-companion', k); }
      for (const k of gs) if (!ps.has(k)) { res.fn++; push('dropped-companion', k); }
    }
  }
  if (g.association.companionPairs !== null) {
    const pk = x => `${key(x?.from)}>${key(x?.to)}`;
    const gs = new Set(g.association.companionPairs.map(pk)), ps = new Set((a.companionPairs ?? []).map(pk));
    for (const k of new Set([...gs, ...ps])) if (gs.has(k) !== ps.has(k)) push('wrong-companion-pair', k);
  }
  // display (curated choice, scored separately from authored association)
  if (g.display.primaryAssetId !== null && (d.primaryAssetId !== g.display.primaryAssetId || d.primaryCollection !== g.display.primaryCollection)) {
    push('wrong-primary', `${d.primaryCollection}:${d.primaryAssetId}`);
  }
  if (g.display.relatedAssetIds !== null) {
    const p = Array.isArray(d.relatedAssetIds) ? d.relatedAssetIds : [];
    const same = p.length === g.display.relatedAssetIds.length && p.every((x, i) => x === g.display.relatedAssetIds[i]);
    if (!same) {
      const sameSet = p.length === g.display.relatedAssetIds.length && [...p].sort().join() === [...g.display.relatedAssetIds].sort().join();
      push(sameSet ? 'related-order-mismatch' : 'related-set-mismatch');
    }
  }
  if (g.display.insertions !== null) {
    const norm = list => (Array.isArray(list) ? list : []).map(i => `${i?.activityId}|${i?.assetId}|${i?.fulfills}`);
    const gi = norm(g.display.insertions), pi = norm(d.insertions);
    if (gi.join('\n') !== pi.join('\n')) push(gi.length === pi.length && [...gi].sort().join() === [...pi].sort().join() ? 'insertion-order-mismatch' : 'insertion-mismatch');
  }
  return res;
}

function emptyBucket() {
  return {cases: 0, abstained: 0, missing: 0, resolved: 0, correctResolved: 0, tp: 0, fp: 0, fn: 0, errors: Object.fromEntries(ERROR_TYPES.map(t => [t, 0]))};
}
function finish(b) {
  return {cases: b.cases, resolved: b.resolved, abstained: b.abstained, missing: b.missing, abstentionRate: ratio(b.abstained, b.cases),
    precision: ratio(b.tp, b.tp + b.fp), recall: ratio(b.tp, b.tp + b.fn), casePrecision: ratio(b.correctResolved, b.resolved),
    errorCount: Object.values(b.errors).reduce((x, y) => x + y, 0), errors: b.errors};
}

/**
 * Score decisions against gold. Returns per-language (and overall) precision, error breakdown and abstention rate.
 * @param {object} gold gold.json document
 * @param {object} decisions decisions document
 * @param {{split?: object, only?: 'tuning'|'heldout'}} [opt] split.json document and an optional split filter
 */
export function score(gold, decisions, opt = {}) {
  if (decisions?.schema !== DECISIONS_SCHEMA || !Array.isArray(decisions.decisions)) throw Error('decisions-schema');
  const splitOf = new Map((opt.split?.cases || []).map(c => [c.caseId, c.split]));
  const cases = gold.cases.filter(c => !opt.only || splitOf.get(c.caseId) === opt.only);
  const byId = new Map();
  const unknown = [];
  for (const d of decisions.decisions) {
    if (byId.has(d.caseId)) throw Error(`duplicate-decision:${d.caseId}`);
    byId.set(d.caseId, d);
  }
  const goldIds = new Set(gold.cases.map(c => c.caseId));
  for (const id of byId.keys()) if (!goldIds.has(id)) unknown.push(id);
  const buckets = {all: emptyBucket()}, perCase = [];
  for (const c of cases) {
    const lang = c.caseId.slice(0, 3);
    buckets[lang] ||= emptyBucket();
    const r = scoreCase(c, byId.get(c.caseId));
    for (const b of [buckets.all, buckets[lang]]) {
      b.cases++; b.tp += r.tp; b.fp += r.fp; b.fn += r.fn;
      if (r.abstained) b.abstained++; else if (r.missing) b.missing++; else b.resolved++;
      if (!r.abstained && !r.missing && r.errors.length === 0) b.correctResolved++;
      for (const e of r.errors) b.errors[e.type]++;
    }
    if (r.errors.length || r.abstained) perCase.push({caseId: c.caseId, abstained: r.abstained, errors: r.errors});
  }
  buckets.all.errors['unknown-case'] += unknown.length;
  const languages = Object.fromEntries(Object.keys(buckets).filter(k => k !== 'all').sort().map(k => [k, finish(buckets[k])]));
  return {schema: 'fia-association-eval-score@1', producer: decisions.producer ?? null, split: opt.only ?? 'all',
    overall: finish(buckets.all), languages, unknownCases: unknown, perCase};
}

/** Decisions document that reproduces gold exactly (used to prove the scorer: gold vs itself is precision 1.0, 0 errors). */
export function goldAsDecisions(gold, producer = {id: 'gold-self', kind: 'manual'}) {
  return {schema: DECISIONS_SCHEMA, producer, decisions: gold.cases.map(c => ({caseId: c.caseId, output: structuredClone(c.output)}))};
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) throw Error('usage: score.mjs <decisions.json> [--split tuning|heldout]');
  const at = process.argv.indexOf('--split'), only = at > 0 ? process.argv[at + 1] : undefined;
  const read = p => JSON.parse(readFileSync(p, 'utf8'));
  const gold = read(new URL('./gold.json', import.meta.url)), split = read(new URL('./split.json', import.meta.url));
  console.log(JSON.stringify(score(gold, read(file), {split, only}), null, 2));
}
