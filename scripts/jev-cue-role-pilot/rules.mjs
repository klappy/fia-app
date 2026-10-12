// Arm A — explicit cue rules for the fia-cue-role@1 pilot (PLAN.md §6). Policy explicit-cue-rules@1.
// Evidence is identity only: a reviewed cue-text hash registry and list membership from lists.json
// (fia-list-evidence@1, status proposed-independent-review-required → every table labels arm A
// "list-evidence (proposed, independent review pending)"). Unit text is never read or matched here;
// rules.test.mjs lints this file for text access, string literals with words, and pattern matching.
import {canonical, sha256, CONTRACT, ROLES} from '../../server/fia/preparation/jev/adapter.mjs';

export const POLICY = 'explicit-cue-rules@1';
export const RULES = Object.freeze(['R-PAUSE', 'R-LIST-INTRO', 'R-LIST-ITEM-DISCUSSION', 'R-LIST-ITEM-DESCRIPTIVE']);
export const ARM_A_LABEL = 'list-evidence-proposed-independent-review-pending';

const DISCUSSION = 'discussion', DESCRIPTIVE = 'descriptive-list';
const roles = (reading, discussion, lookup, pause) => ({[ROLES[0]]: reading, [ROLES[1]]: discussion, [ROLES[2]]: lookup, [ROLES[3]]: pause});
const OUTCOME = Object.freeze({
  'R-PAUSE': roles(false, false, false, true),
  'R-LIST-INTRO': roles(true, true, false, false),
  'R-LIST-ITEM-DISCUSSION': roles(false, true, false, false),
  'R-LIST-ITEM-DESCRIPTIVE': roles(false, false, false, false)
});

const digestOf = async x => sha256(JSON.stringify(x));
const key = (packId, unitId, textSha256) => [packId, unitId, textSha256].join('\u0000');

/**
 * @param {{lists: object, pauseRegistry: object, guides?: Record<string,string>}} options
 *   guides: optional packId → guide contentSha256; a lists entry whose guideContentSha256 differs is not loaded.
 * @returns {{resolveExplicit: Function, policySha256: string, explain: Function, skippedPacks: string[]}}
 */
export async function createExplicitCueRules({lists, pauseRegistry, guides = null}) {
  if (!lists || !Array.isArray(lists.packs)) throw Error('lists-shape');
  if (!pauseRegistry || !Array.isArray(pauseRegistry.entries)) throw Error('pause-registry-shape');
  const listsSha256 = await digestOf(lists), pauseRegistrySha256 = await digestOf(pauseRegistry);
  const policySha256 = await sha256(canonical({policy: POLICY, rules: RULES, pauseRegistrySha256, listsSha256}));

  const pause = new Map();
  for (const entry of pauseRegistry.entries) {
    if (typeof entry.sha256 !== 'string' || Buffer.from(entry.sha256, 'hex').toString('hex') !== entry.sha256 || entry.sha256.length !== 64) throw Error('pause-registry-digest');
    pause.set(entry.sha256, await sha256(canonical({rule: RULES[0], sha256: entry.sha256, pauseRegistrySha256})));
  }

  const membership = new Map(), skippedPacks = [];
  for (const pack of lists.packs) {
    if (guides && guides[pack.packId] !== pack.guideContentSha256) { skippedPacks.push(pack.packId); continue; }
    for (const group of pack.groups) {
      const members = [[group.intro, 'intro'], ...group.items.map(item => [item, 'item'])];
      for (const [unit, member] of members) {
        let rule = null;
        if (group.purpose === DISCUSSION) rule = member === 'intro' ? RULES[1] : RULES[2];
        else if (group.purpose === DESCRIPTIVE && member === 'item') rule = RULES[3];
        if (!rule) continue;
        const evidence = {rule, packId: pack.packId, guideContentSha256: pack.guideContentSha256, sectionId: group.sectionId, unitId: unit.id, textSha256: unit.textSha256, reviewStatus: group.reviewStatus ?? null, listsSha256};
        membership.set(key(pack.packId, unit.id, unit.textSha256), {rule, evidenceSha256: await sha256(canonical(evidence))});
      }
    }
  }

  function explain(input) {
    const source = input?.source;
    if (!source) return null;
    if (pause.has(source.sha256)) return {rule: RULES[0], evidenceSha256: pause.get(source.sha256)};
    return membership.get(key(input.packId, source.unitId, source.sha256)) ?? null;
  }

  // Synchronous by contract (adapter.mjs:95-105): null → abstain, else a normalized decision.
  function resolveExplicit(input) {
    const hit = explain(input);
    if (!hit) return null;
    return {decision: {contract: CONTRACT, caseId: input.caseId, roles: {...OUTCOME[hit.rule]}, needsReview: false, evidenceUnitIds: [input.source.unitId]}, policySha256, evidenceSha256: hit.evidenceSha256};
  }

  return Object.freeze({resolveExplicit, explain, policySha256, skippedPacks});
}

// Arm C — naive v2 source flags. COMPARATOR ONLY, never a candidate (PLAN.md §6): it quantifies the falsified
// signal (v2 pause flags eng 23 / spa 1 on the same pericope; bindings are not lookup requests).
export const ARM_C = Object.freeze({arm: 'C', label: 'comparator-only', source: 'naive-v2-source-flags', candidate: false});
export function naiveSourceFlags(meta) {
  const resources = Array.isArray(meta?.v2Resources) ? meta.v2Resources : [];
  const pauseOnly = meta?.v2Pause === true && resources.length === 0;
  return roles(false, false, resources.length > 0, pauseOnly);
}
