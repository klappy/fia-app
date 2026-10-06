// Metrics for the fia-cue-role@1 pilot (PLAN.md DoD 7-8, §8). Pure functions over cases + envelopes; no I/O.
import {ROLES} from '../../server/fia/preparation/jev/adapter.mjs';

export const REVIEW_MINUTES_PER_CASE = 2; // §8 review-only alternative proxy; the captain's to change
export const VERDICTS = Object.freeze(['EXPAND-TESTING', 'RETAIN-RULES', 'REVIEW']);

const round = x => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 1e6) / 1e6);
const ratio = (a, b) => (b > 0 ? round(a / b) : null);

export function percentile(values, p) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1))];
}

function rolesOf(envelope) { return envelope?.status === 'resolved' ? envelope.decision?.roles ?? null : null; }

/** DoD 7 serious errors for one case; flips are added by scoreSet when a rerun is supplied. */
export function seriousErrors(caseRow, envelope) {
  const gold = caseRow.gold, out = [];
  if (!gold) throw Error(`gold-missing:${caseRow.caseId}`);
  const roles = rolesOf(envelope);
  if (gold.needsReview) { if (roles) out.push('needs-review-resolved'); return out; }
  if (!roles) return out;
  if (roles.pauseOnly && !gold.roles.pauseOnly) out.push('substantive-as-pause-only');
  for (const k of ROLES.slice(0, 3)) if (gold.roles[k] && !roles[k]) out.push(`dropped-${k}`);
  if (ROLES.some(k => roles[k] !== gold.roles[k])) out.push('resolved-wrong');
  return out;
}

/** DoD 8: a gold-needsReview case is correct iff unknown, or invalid with reason input-invalid. */
export function needsReviewCorrect(envelope) {
  return envelope?.status === 'unknown' || (envelope?.status === 'invalid' && envelope.reason === 'input-invalid');
}

export function flipped(a, b) {
  if (!a || !b) return false;
  if (a.status !== b.status) return true;
  const ra = rolesOf(a), rb = rolesOf(b);
  return Boolean(ra && rb && ROLES.some(k => ra[k] !== rb[k]));
}

/**
 * Score one arm on one case set.
 * @param {object} p
 * @param {Array} p.cases rows with gold
 * @param {Record<string, object>} p.envelopes caseId → adapter envelope (arm C: a synthetic resolved envelope)
 * @param {Record<string, object>} [p.rerun] caseId → envelope from the rerun pass (flip counting)
 * @param {Record<string, {ms:number, usage:object}>} [p.calls] caseId → observed call evidence (arms B/D)
 */
export function scoreSet({cases, envelopes, rerun = null, calls = {}}) {
  const perRole = Object.fromEntries(ROLES.map(k => [k, {tp: 0, fp: 0, fn: 0, tn: 0, goldTrue: 0, resolved: 0, correctResolved: 0}]));
  const abstentions = {}, serious = [], flips = [];
  let resolved = 0, correctResolved = 0, needsReviewCases = 0, needsReviewHandled = 0, scored = 0;
  const ms = [], tokens = {input: 0, output: 0, calls: 0};
  for (const c of cases) {
    const e = envelopes[c.caseId];
    if (!e) throw Error(`envelope-missing:${c.caseId}`);
    const roles = rolesOf(e);
    if (roles) resolved++;
    else { const r = `${e.status}:${e.reason}`; abstentions[r] = (abstentions[r] ?? 0) + 1; }
    for (const kind of seriousErrors(c, e)) serious.push({caseId: c.caseId, kind});
    if (rerun && flipped(e, rerun[c.caseId])) { flips.push(c.caseId); serious.push({caseId: c.caseId, kind: 'flip'}); }
    const call = calls[c.caseId];
    if (call) { tokens.calls++; if (Number.isFinite(call.ms)) ms.push(call.ms); tokens.input += call.usage?.input_tokens ?? 0; tokens.output += call.usage?.output_tokens ?? 0; }
    if (c.gold.needsReview) { needsReviewCases++; if (needsReviewCorrect(e)) needsReviewHandled++; continue; }
    scored++;
    let allRight = Boolean(roles);
    for (const k of ROLES) {
      const s = perRole[k], g = c.gold.roles[k];
      if (g) s.goldTrue++;
      if (!roles) { if (g) s.fn++; continue; }
      s.resolved++;
      if (roles[k] === g) s.correctResolved++; else allRight = false;
      if (roles[k] && g) s.tp++; else if (roles[k] && !g) s.fp++; else if (!roles[k] && g) s.fn++; else s.tn++;
    }
    if (allRight) correctResolved++;
  }
  const roleMetrics = Object.fromEntries(ROLES.map(k => {
    const s = perRole[k];
    // Recall counts abstentions as misses (gold-true instances over all scored cases), so coverage cannot hide.
    return [k, {...s, precision: ratio(s.tp, s.tp + s.fp), recall: ratio(s.tp, s.goldTrue)}];
  }));
  return {
    cases: cases.length, scoredForRoles: scored, resolved, coverage: ratio(resolved, cases.length), correctResolved,
    abstentions: Object.fromEntries(Object.entries(abstentions).sort()), abstained: cases.length - resolved,
    needsReview: {cases: needsReviewCases, handled: needsReviewHandled},
    seriousErrors: serious.sort((a, b) => (a.caseId + a.kind).localeCompare(b.caseId + b.kind)), seriousCount: serious.length,
    flips: flips.sort(), roles: roleMetrics,
    latencyMs: {p50: percentile(ms, 0.5), max: ms.length ? Math.max(...ms) : null},
    tokens
  };
}

/**
 * §8 cost per correctly resolved case. Rates are supplied at report time (never stored in the repo);
 * absent rates leave the cost term null and the verdict cannot reach EXPAND-TESTING.
 */
export function costTerms(score, {ratePerMTokIn = null, ratePerMTokOut = null, minuteRate = null, reviewMinutesPerCase = REVIEW_MINUTES_PER_CASE} = {}) {
  const reviewMinutes = score.abstained * reviewMinutesPerCase;
  const priced = [ratePerMTokIn, ratePerMTokOut, minuteRate].every(Number.isFinite);
  if (!priced) return {priced: false, reviewMinutes, aiCost: null, costPerCorrect: null, reviewOnlyPerCase: null};
  const aiCost = (score.tokens.input * ratePerMTokIn + score.tokens.output * ratePerMTokOut) / 1e6;
  return {priced: true, reviewMinutes, aiCost: round(aiCost), costPerCorrect: score.correctResolved ? round((aiCost + reviewMinutes * minuteRate) / score.correctResolved) : null, reviewOnlyPerCase: round(reviewMinutesPerCase * minuteRate)};
}

/** Per-class verdict (§8), held-out. armA/armB are scoreSet outputs on the same cases; role is one of ROLES. */
export function verdict({role, armA, armB, costB, uncalibratable = false}) {
  const reasons = [];
  const seriousB = armB.seriousErrors.filter(s => s.kind === 'resolved-wrong' || s.kind === 'flip' || s.kind === 'needs-review-resolved' || s.kind.endsWith(role) || (role === 'pauseOnly' && s.kind === 'substantive-as-pause-only'));
  const gain = armB.roles[role].correctResolved - armA.roles[role].correctResolved;
  const abstentionRate = armB.cases ? armB.abstained / armB.cases : 1;
  if (uncalibratable) return {verdict: 'REVIEW', reasons: ['uncalibratable-language'], gain};
  if (gain <= 0 || (armA.seriousCount === 0 && armA.coverage === 1)) return {verdict: 'RETAIN-RULES', reasons: [gain <= 0 ? 'no-gain-over-rules' : 'rules-full-coverage'], gain};
  if (seriousB.length) reasons.push('serious-errors');
  if (armB.flips.length) reasons.push('flips');
  if (abstentionRate > 0.5) reasons.push('abstention-over-50pct');
  if (!costB?.priced) reasons.push('cost-unpriced');
  else if (costB.costPerCorrect === null || costB.costPerCorrect > costB.reviewOnlyPerCase) reasons.push('cost-over-review-only');
  return reasons.length ? {verdict: 'REVIEW', reasons, gain} : {verdict: 'EXPAND-TESTING', reasons: [], gain};
}
