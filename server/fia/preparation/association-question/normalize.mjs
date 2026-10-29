// Q18 execution seam: strict provider-output normalizer. Never repairs output.
// The provider answers in PR289's (4359d1e) gold output shape, field for field:
//   {decision, association: {requested, optionalCompanions, companionPairs},
//    display: {primaryCollection, primaryAssetId, relatedAssetIds, insertions: [{activityId, assetId, fulfills}]}}
// Every key must be present. null means "not decided" and stays null; no default is ever filled in.
// Provenance is a separate wrapper that score.mjs never scores. Its authority is always 'model-resolved':
// 'source-explicit' belongs only to the source-association index built from verified raw fragments (PR290).
import {canonical, sha256} from '../jev/adapter.mjs';
import {ALLOWED_DECISIONS} from './request.mjs';

export const INVALID = 'invalid-provider-output';
export const AUTHORITY = 'model-resolved';
const plain = x => x !== null && typeof x === 'object' && Object.getPrototypeOf(x) === Object.prototype;

class Reject extends Error { constructor(reason) { super(reason); this.reason = reason; } }
const reject = reason => { throw new Reject(reason); };
function exact(x, keys, where) {
  if (!plain(x)) reject(`${where}-not-object`);
  const got = Object.keys(x).sort(), want = [...keys].sort();
  const extra = got.filter(k => !want.includes(k)), missing = want.filter(k => !got.includes(k));
  if (extra.length) reject(`${where}-extra-field:${extra.join(',')}`);
  if (missing.length) reject(`${where}-missing-field:${missing.join(',')}`);
}

function refList(list, byRef, where, {nonEmpty = false} = {}) {
  if (list === null) return null;
  if (!Array.isArray(list) || (nonEmpty && !list.length)) reject(`${where}-invalid`);
  const seen = new Set();
  return list.map(r => {
    exact(r, ['collection', 'id'], where);
    const k = `${r.collection}:${r.id}`;
    if (typeof r.collection !== 'string' || typeof r.id !== 'string' || !byRef.has(k)) reject(`${where}-out-of-candidate-set`);
    if (seen.has(k)) reject(`${where}-duplicate`);
    seen.add(k);
    return {collection: r.collection, id: r.id};
  });
}

// Display uses bare asset ids (gold relatedAssetIds/insertions). A bare id must name exactly one candidate.
function bareId(id, byBare, where) {
  if (typeof id !== 'string' || !byBare.has(id)) reject(`${where}-out-of-candidate-set`);
  if (byBare.get(id).length !== 1) reject(`${where}-ambiguous-bare-id`);
  return id;
}

function parse(raw, request) {
  exact(raw, Object.keys(raw ?? {}).includes('confidence') ? ['decision', 'association', 'display', 'confidence'] : ['decision', 'association', 'display'], 'output');
  if (!ALLOWED_DECISIONS.includes(raw.decision)) reject('decision-not-allowed');
  let confidence = null;
  if ('confidence' in raw) {
    if (typeof raw.confidence !== 'number' || !Number.isFinite(raw.confidence) || raw.confidence < 0 || raw.confidence > 1) reject('confidence-invalid');
    confidence = raw.confidence;
  }
  if (raw.decision === 'abstain') {
    if (raw.association !== null || raw.display !== null) reject('abstain-with-content');
    return {output: {decision: 'abstain', association: null, display: null}, confidence};
  }
  const byRef = new Map(request.candidates.map(c => [c.candidateId, c])), byBare = new Map();
  for (const c of request.candidates) byBare.set(c.id, [...(byBare.get(c.id) ?? []), c]);
  const a = raw.association, d = raw.display;
  exact(a, ['requested', 'optionalCompanions', 'companionPairs'], 'association');
  if (a.requested === null) reject('association-requested-null');
  const requested = refList(a.requested, byRef, 'requested', {nonEmpty: raw.decision === 'associate'});
  if (raw.decision === 'none' && requested.length) reject('none-with-requested');
  const optionalCompanions = refList(a.optionalCompanions, byRef, 'optionalCompanions');
  let companionPairs = null;
  if (a.companionPairs !== null) {
    if (!Array.isArray(a.companionPairs)) reject('companionPairs-invalid');
    companionPairs = a.companionPairs.map(p => { exact(p, ['from', 'to'], 'companionPair'); return {from: refList([p.from], byRef, 'companionPair')[0], to: refList([p.to], byRef, 'companionPair')[0]}; });
  }
  exact(d, ['primaryCollection', 'primaryAssetId', 'relatedAssetIds', 'insertions'], 'display');
  if ((d.primaryCollection === null) !== (d.primaryAssetId === null)) reject('primary-half-null');
  // Both primary fields are strings or both null; arrays/numbers/objects must not reach the template-literal lookup.
  if (d.primaryAssetId !== null && (typeof d.primaryCollection !== 'string' || typeof d.primaryAssetId !== 'string')) reject('primary-not-string');
  // A 'none' decision asks for no visual, so it carries no display content.
  if (raw.decision === 'none' && Object.values(d).some(v => v !== null)) reject('none-with-display');
  if (d.primaryAssetId !== null && !byRef.has(`${d.primaryCollection}:${d.primaryAssetId}`)) reject('primary-out-of-candidate-set');
  let relatedAssetIds = null;
  if (d.relatedAssetIds !== null) {
    if (!Array.isArray(d.relatedAssetIds) || new Set(d.relatedAssetIds).size !== d.relatedAssetIds.length) reject('relatedAssetIds-invalid');
    relatedAssetIds = d.relatedAssetIds.map(id => bareId(id, byBare, 'relatedAssetIds'));
  }
  let insertions = null;
  if (d.insertions !== null) {
    if (!Array.isArray(d.insertions)) reject('insertions-invalid');
    insertions = d.insertions.map(i => {
      exact(i, ['activityId', 'assetId', 'fulfills'], 'insertion');
      if (typeof i.activityId !== 'string' || !i.activityId.trim() || i.activityId.length > 200) reject('insertion-activityId-invalid');
      if (i.fulfills !== request.input.source.unit.unitId) reject('insertion-fulfills-not-target-unit');
      return {activityId: i.activityId, assetId: bareId(i.assetId, byBare, 'insertion-assetId'), fulfills: i.fulfills};
    });
  }
  // Order is part of the answer (related/insertion order is scored), so lists keep the provider's order.
  return {output: {decision: raw.decision, association: {requested, optionalCompanions, companionPairs},
    display: {primaryCollection: d.primaryCollection, primaryAssetId: d.primaryAssetId, relatedAssetIds, insertions}}, confidence};
}

/** Raw provider output + the request it answers → {output (scored), confidence, normalization}. */
export function normalizeOutput(raw, request) {
  try {
    if (!plain(raw)) reject('not-object');
    return {...parse(raw, request), normalization: {status: 'accepted', reason: null}};
  } catch (e) {
    if (!(e instanceof Reject)) throw e;
    return {output: {decision: INVALID, association: null, display: null}, confidence: null, normalization: {status: INVALID, reason: e.reason}};
  }
}

/** Provenance wrapper, kept apart from the scored output. Authority is fixed; no argument can change it. */
export async function provenanceFor({transport, modelId = null, modelVersion = null, request, requestSha256, raw, normalization}) {
  let responseSha256 = null;
  try { responseSha256 = raw === undefined ? null : await sha256(canonical(raw, 65536)); } catch { responseSha256 = null; }
  return {authority: AUTHORITY, transport, modelId, modelVersion, questionId: request.questionId, policyId: request.policyId,
    policySha256: request.policySha256, promptTemplateSha256: request.promptTemplateSha256, requestSha256, responseSha256,
    normalization: normalization.status, invalidReason: normalization.reason};
}
