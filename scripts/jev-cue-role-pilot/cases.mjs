// Case builder for the fia-cue-role@1 Jev pilot (cookbook unit 2026-10-06-fia-cue-role-jev-pilot, PLAN.md §5, step 2).
// Reads the published source packs, emits the 24 real cases with gold left null, refuses template overlap.
// Offline only: no provider, no network.
import {readFile, writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {canonical, sha256} from '../../server/fia/preparation/jev/adapter.mjs';

export const HERE = new URL('./', import.meta.url);
export const REPO = new URL('../../', import.meta.url);
export const SOURCE_PACKS = new URL('server/fia/compiler/presentation/source-packs.json.gz', REPO);
export const LISTS = new URL('server/fia/compiler/presentation/lists.json', REPO);
export const CASES_PATH = new URL('cases.json', HERE);
export const SOURCE_REVISION = 'f8776d92b090b5af5b17b17dc1137f25fb059ed0';
export const LANGUAGES = Object.freeze(['eng', 'spa']);
export const MAX_EST_TOKENS = 500; // cue-role-v1.md:39, 500 input tokens per case per primitive

// PLAN.md §5. Unit IDs exist in both languages; the pack is `${language}.${pericope}`.
export const SPEC = Object.freeze([
  {split: 'dev', pericope: 'MRK-1-1-13', units: ['S01-U002', 'S05-U004', 'S02-U012', 'S01-U003']},
  {split: 'heldout', pericope: 'MRK-1-14-20', units: ['S02-U001', 'S02-U008', 'S02-U016', 'S03-U007', 'S03-U020', 'S04-U015', 'S05-U004', 'S06-U004']}
]);

export async function templateSha256(text) { return sha256(text.replace(/[0-9]/g, '#')); }

export async function loadSourcePacks(url = SOURCE_PACKS) {
  const data = JSON.parse(gunzipSync(await readFile(url)).toString('utf8'));
  if (typeof data.revision !== 'string' || !data.packs || typeof data.packs !== 'object') throw Error('source-packs-shape');
  return data;
}

// Units in reading order across steps; context = previous + next unit (≤ 2, PLAN.md step 2).
function flatUnits(pack, packId) {
  const steps = pack?.guide?.steps;
  if (!Array.isArray(steps)) throw Error(`guide-steps-missing:${packId}`);
  return steps.flatMap(step => step.units.map(u => ({...u, stepId: step.id})));
}

function listMembership(lists, packId, unitId) {
  const entry = lists?.packs?.find(p => p.packId === packId);
  for (const g of entry?.groups ?? []) {
    if (g.intro.id === unitId) return {sectionId: g.sectionId, purpose: g.purpose, member: 'intro', reviewStatus: g.reviewStatus};
    if (g.items.some(i => i.id === unitId)) return {sectionId: g.sectionId, purpose: g.purpose, member: 'item', reviewStatus: g.reviewStatus};
  }
  return null;
}

async function unitRef(u) {
  if (typeof u.text !== 'string' || await sha256(u.text) !== u.textSha256) throw Error(`source-sha-mismatch:${u.id}`);
  return {unitId: u.id, text: u.text, sha256: u.textSha256};
}

export async function buildCases({packs, lists}) {
  if (packs.revision !== SOURCE_REVISION) throw Error(`source-revision-moved:${packs.revision}`);
  const cases = [];
  for (const {split, pericope, units} of SPEC) for (const language of LANGUAGES) {
    const packId = `${language}.${pericope}`, pack = packs.packs[packId];
    if (!pack) throw Error(`pack-missing:${packId}`);
    const flat = flatUnits(pack, packId);
    for (const unitId of units) {
      const i = flat.findIndex(u => u.id === unitId);
      if (i < 0) throw Error(`unit-missing:${packId}:${unitId}`);
      const u = flat[i];
      const context = [];
      for (const n of [flat[i - 1], flat[i + 1]]) if (n) context.push(await unitRef(n));
      const input = {caseId: `${packId}:${unitId}`, packId, sourceRevision: packs.revision, language, source: await unitRef(u), context};
      const estTokens = Math.ceil(new TextEncoder().encode(canonical(input)).length / 4);
      if (estTokens > MAX_EST_TOKENS) throw Error(`oversize:${input.caseId}:${estTokens}`);
      cases.push({
        caseId: input.caseId,
        input,
        gold: null,
        meta: {split, kind: u.kind, v2Pause: u.pause === true, v2Resources: [...(u.resources ?? [])], listGroup: listMembership(lists, packId, unitId), templateSha256: await templateSha256(u.text), estTokens}
      });
    }
  }
  await assertCaseSet(cases);
  return cases;
}

// DoD 3: exactly 24, 12 per language, 8 dev / 16 held-out, unique IDs, hashes re-verify, no dev/held-out template overlap.
export async function assertCaseSet(cases) {
  if (!Array.isArray(cases) || cases.length !== 24) throw Error(`case-count:${cases?.length}`);
  const ids = new Set(cases.map(c => c.caseId));
  if (ids.size !== 24) throw Error('case-id-duplicate');
  for (const language of LANGUAGES) {
    const mine = cases.filter(c => c.input.language === language);
    if (mine.length !== 12 || mine.filter(c => c.meta.split === 'dev').length !== 4) throw Error(`case-split:${language}`);
  }
  for (const c of cases) {
    if (c.caseId !== c.input.caseId) throw Error(`case-id-binding:${c.caseId}`);
    if (c.input.context.length > 2) throw Error(`context-limit:${c.caseId}`);
    for (const u of [c.input.source, ...c.input.context]) if (await sha256(u.text) !== u.sha256) throw Error(`source-binding:${c.caseId}:${u.unitId}`);
    if (await templateSha256(c.input.source.text) !== c.meta.templateSha256) throw Error(`template-binding:${c.caseId}`);
  }
  const devTemplates = new Set(cases.filter(c => c.meta.split === 'dev').map(c => c.meta.templateSha256));
  const overlap = cases.filter(c => c.meta.split === 'heldout' && devTemplates.has(c.meta.templateSha256)).map(c => c.caseId);
  if (overlap.length) throw Error(`template-overlap:${overlap.join(',')}`);
  return true;
}

export async function readCases(url = CASES_PATH) { return JSON.parse(await readFile(url, 'utf8')); }
export function serializeCases(cases) { return JSON.stringify({schema: 'fia-cue-role-pilot-cases@1', sourceRevision: SOURCE_REVISION, cases}, null, 2) + '\n'; }

// Preserve gold already written by the labelers when the builder is re-run.
export function mergeGold(built, existing) {
  const gold = new Map((existing?.cases ?? []).map(c => [c.caseId, c.gold]));
  return built.map(c => ({...c, gold: gold.get(c.caseId) ?? null}));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  const built = await buildCases({packs: await loadSourcePacks(), lists: JSON.parse(await readFile(LISTS, 'utf8'))});
  let existing = null;
  try { existing = await readCases(); } catch {}
  const next = serializeCases(mergeGold(built, existing));
  if (check) {
    const current = existing ? serializeCases(existing.cases) : '';
    if (current !== next) { console.error('cases.json differs from a rebuild from source-packs.json.gz'); process.exit(1); }
    await assertCaseSet(existing.cases);
    console.log('cases.json: 24 cases verified against source-packs revision', SOURCE_REVISION);
  } else {
    await writeFile(CASES_PATH, next);
    console.log(`wrote ${fileURLToPath(CASES_PATH)} (${built.length} cases)`);
  }
}
