import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canonical, sha256, ROLES, validateCueRoleDecision} from '../../server/fia/preparation/jev/adapter.mjs';
import {createExplicitCueRules, naiveSourceFlags, ARM_C, RULES, POLICY} from './rules.mjs';
import {loadSourcePacks, LISTS} from './cases.mjs';
import {composeAdapter, loadFixed, BOOTSTRAP_MODEL_REVISION} from './run.mjs';

const here = new URL('./', import.meta.url);
const registry = JSON.parse(await readFile(new URL('pause-only-registry.json', here), 'utf8'));
const cases = JSON.parse(await readFile(new URL('cases.json', here), 'utf8')).cases;

async function unit(unitId, text) { return {unitId, text, sha256: await sha256(text)}; }
async function input(packId, unitId, text) { return {caseId: `${packId}:${unitId}`, packId, sourceRevision: 'fixture', language: 'eng', source: await unit(unitId, text), context: []}; }

// Fixture list evidence: codes, not FIA source text.
const T = {intro: 'fixture intro alpha', item: 'fixture item beta', dIntro: 'fixture intro gamma', dItem: 'fixture item delta', other: 'fixture other epsilon'};
async function fixtureLists() {
  const ref = async (id, text) => ({id, text, textSha256: await sha256(text)});
  return {schema: 'fia-list-evidence@1', status: 'proposed-independent-review-required', packs: [{packId: 'fx.P', guideContentSha256: 'a'.repeat(64), groups: [
    {sectionId: 'S01', intro: await ref('S01-U001', T.intro), items: [await ref('S01-U002', T.item)], purpose: 'discussion', layout: 'separate', reviewStatus: 'proposed'},
    {sectionId: 'S02', intro: await ref('S02-U001', T.dIntro), items: [await ref('S02-U002', T.dItem)], purpose: 'descriptive-list', layout: 'together', reviewStatus: 'proposed'}
  ]}]};
}

test('each rule fires on its fixture and every other input abstains', async () => {
  const rules = await createExplicitCueRules({lists: await fixtureLists(), pauseRegistry: registry});
  const expect = async (x, rule, roles) => {
    const r = rules.resolveExplicit(x);
    if (rule === null) return assert.equal(r, null, x.caseId);
    assert.equal(rules.explain(x).rule, rule);
    assert.deepEqual(r.decision.roles, roles);
    assert.equal(r.decision.needsReview, false);
    assert.deepEqual(r.decision.evidenceUnitIds, [x.source.unitId]);
    assert.equal(r.policySha256, rules.policySha256);
    validateCueRoleDecision(r.decision, x);
  };
  const R = (a, b, c, d) => Object.fromEntries(ROLES.map((k, i) => [k, [a, b, c, d][i]]));
  await expect(await input('fx.P', 'S09-U009', registry.entries[0].text), 'R-PAUSE', R(false, false, false, true));
  await expect(await input('other.pack', 'S01-U001', registry.entries[1].text), 'R-PAUSE', R(false, false, false, true));
  await expect(await input('fx.P', 'S01-U001', T.intro), 'R-LIST-INTRO', R(true, true, false, false));
  await expect(await input('fx.P', 'S01-U002', T.item), 'R-LIST-ITEM-DISCUSSION', R(false, true, false, false));
  await expect(await input('fx.P', 'S02-U002', T.dItem), 'R-LIST-ITEM-DESCRIPTIVE', R(false, false, false, false));
  await expect(await input('fx.P', 'S02-U001', T.dIntro), null);            // descriptive intro: no rule
  await expect(await input('fx.P', 'S03-U001', T.other), null);             // not in any list
  await expect(await input('fx.Q', 'S01-U001', T.intro), null);             // other pack
  await expect(await input('fx.P', 'S01-U001', T.item), null);              // text hash differs from the list entry
});

test('a lists entry whose guide content hash moved is not loaded', async () => {
  const rules = await createExplicitCueRules({lists: await fixtureLists(), pauseRegistry: registry, guides: {'fx.P': 'b'.repeat(64)}});
  assert.deepEqual(rules.skippedPacks, ['fx.P']);
  assert.equal(rules.resolveExplicit(await input('fx.P', 'S01-U001', T.intro)), null);
});

test('resolveExplicit is synchronous and the adapter accepts it with zero invocations; policy hash binds inputs', async () => {
  const lists = await fixtureLists();
  const rules = await createExplicitCueRules({lists, pauseRegistry: registry});
  const x = await input('fx.P', 'S01-U002', T.item);
  assert.equal(typeof rules.resolveExplicit(x)?.then, 'undefined');
  let calls = 0;
  const adapter = await composeAdapter({fixed: await loadFixed(), AI: {run() { calls++; throw Error('must not run'); }}, resolveExplicit: rules.resolveExplicit, modelRevision: BOOTSTRAP_MODEL_REVISION});
  const e = await adapter.decide(x);
  assert.equal(e.status, 'resolved'); assert.equal(e.reason, 'explicit-mapping'); assert.equal(e.provenance.invocations, 0); assert.equal(calls, 0);
  const unrelated = await adapter.decide(await input('fx.P', 'S03-U001', T.other));
  assert.equal(unrelated.status, 'unknown'); assert.equal(unrelated.reason, 'calibration-unavailable');
  lists.packs[0].groups[1].purpose = 'discussion';
  const changed = await createExplicitCueRules({lists, pauseRegistry: registry});
  assert.notEqual(changed.policySha256, rules.policySha256);
  assert.equal(POLICY, 'explicit-cue-rules@1');
  assert.deepEqual(RULES, ['R-PAUSE', 'R-LIST-INTRO', 'R-LIST-ITEM-DISCUSSION', 'R-LIST-ITEM-DESCRIPTIVE']);
});

test('on the real 24 cases arm A fires exactly on the PLAN §6 units', async () => {
  const packs = await loadSourcePacks();
  const guides = Object.fromEntries(Object.entries(packs.packs).map(([id, p]) => [id, p.guide.contentSha256]));
  const rules = await createExplicitCueRules({lists: JSON.parse(await readFile(LISTS, 'utf8')), pauseRegistry: registry, guides});
  const fired = cases.map(c => [c.caseId, rules.explain(c.input)?.rule ?? null]).filter(([, r]) => r);
  const expected = [];
  for (const lang of ['eng', 'spa']) expected.push([`${lang}.MRK-1-1-13:S01-U002`, 'R-LIST-INTRO'], [`${lang}.MRK-1-1-13:S02-U012`, 'R-PAUSE'], [`${lang}.MRK-1-1-13:S01-U003`, 'R-LIST-ITEM-DISCUSSION'], [`${lang}.MRK-1-14-20:S03-U007`, 'R-LIST-ITEM-DESCRIPTIVE']);
  assert.deepEqual(new Map(fired), new Map(expected));
});

test('pause-only registry holds exactly the two reviewed cue texts and each hash is the text hash', async () => {
  assert.equal(registry.entries.length, 2);
  for (const e of registry.entries) assert.equal(await sha256(e.text), e.sha256);
  assert.deepEqual(registry.entries.map(e => e.language), ['eng', 'spa']);
});

// Gap analysis :53 — the falsified phrase test must not come back as a rule. The lint is a tripwire, not a sandbox:
// every string literal must be on the reviewed list, `input`/`source` are read only through the identity fields
// below (dotted, never computed, never aliased or passed on), and strings cannot be built from char codes.
const REVIEWED_LITERALS = new Set(['explicit-cue-rules@1', 'R-PAUSE', 'R-LIST-INTRO', 'R-LIST-ITEM-DISCUSSION', 'R-LIST-ITEM-DESCRIPTIVE', 'list-evidence-proposed-independent-review-pending', 'discussion', 'descriptive-list', '\\u0000', 'lists-shape', 'pause-registry-shape', 'string', 'hex', 'pause-registry-digest', 'intro', 'item', 'C', 'comparator-only', 'naive-v2-source-flags']);
const IDENTITY = '(?:sha256|unitId|packId|caseId)';
function lintRulesSource(src) {
  const v = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n').replace(/^import\s[^;]*?from\s*'[^']*';$/gm, '');
  const literals = [...code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map(m => m[1] ?? m[2] ?? m[3]);
  if (!literals.length) v.push('no-literals-found');
  for (const lit of literals) {
    if (!/^[A-Za-z0-9@._:\\-]*$/.test(lit)) v.push(`literal-with-words:${JSON.stringify(lit)}`);
    else if (!REVIEWED_LITERALS.has(lit)) v.push(`literal-not-reviewed:${JSON.stringify(lit)}`);
  }
  const stripped = code.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""');
  if (/\.text\b/.test(stripped)) v.push('unit-text-access');
  if (/\bRegExp\b|\.(exec|match|matchAll|test|search|includes|startsWith|endsWith|indexOf|lastIndexOf|toLowerCase|toUpperCase|normalize|localeCompare|replace|replaceAll|split)\s*\(/.test(stripped)) v.push('pattern-or-string-matching');
  if (/(^|[=>(,:!&|?{};]\s*|\breturn\s+)\/(?![/*])(?:[^/\\\n]|\\.)+\/[dgimsuyv]*/m.test(stripped)) v.push('regex-literal');
  if (/\b(fromCharCode|fromCodePoint|TextDecoder|atob|btoa|decodeURI|decodeURIComponent|unescape|escape)\b|\bString\s*\.\s*raw\b|\.toString\s*\(\s*(?!""\s*\)|\))/.test(stripped)) v.push('string-construction');
  const rest = stripped.replace(/\s+/g, ' ')
    .replace(/\b(?:function )?(?:explain|resolveExplicit) ?\( ?input ?\)/g, '·')
    .replace(/\bconst source = input\?\.source;/g, '·')
    .replace(/\bif ?\( ?!source ?\)/g, '·')
    .replace(/([{,] ?)source ?:/g, '$1·:')
    .replace(new RegExp(`\\b(?:input ?\\??\\. ?source|input|source) ?\\??\\. ?${IDENTITY}\\b`, 'g'), '·');
  if (/\b(input|source)\b/.test(rest)) v.push('input-read-outside-identity-fields');
  return v;
}

test('lint: rules.mjs reads no unit text, holds only reviewed literals and runs no pattern matching', async () => {
  const src = await readFile(new URL('rules.mjs', here), 'utf8');
  assert.deepEqual(lintRulesSource(src), []);
  // Each mutation must trip the lint (the first is the bracket-access bypass the validator found).
  const tripped = (snippet, kind) => assert.ok(lintRulesSource(`${src}\n${snippet}\n`).some(x => x.startsWith(kind)), `${kind} not caught: ${snippet}`);
  const bypass = "const F='text', W='Pause'; export const probe2 = input => input.source[F] === W + String.fromCharCode(32) + 'this';";
  tripped(bypass, 'literal-not-reviewed'); tripped(bypass, 'string-construction'); tripped(bypass, 'input-read-outside-identity-fields');
  tripped("export const p = input => input.source.text.includes('Pause');", 'unit-text-access');
  tripped("export const p = input => input.source.text.includes('Pause');", 'pattern-or-string-matching');
  tripped('export const p = input => input?.source?.[RULES[0]];', 'input-read-outside-identity-fields');
  tripped('export const p = x => Object.values(x.source)[1] === RULES[0];', 'input-read-outside-identity-fields');
  tripped('export const p = input => { const {sha256: h, ...rest} = input.source; return rest; };', 'input-read-outside-identity-fields');
  tripped('export const p = input => { const s = input.source; return s; };', 'input-read-outside-identity-fields');
  tripped('export const p = n => (n).toString(36);', 'string-construction');
  tripped("export const p = 'Pause this audio';", 'literal-with-words');
  tripped('export const p = x => /pause/i;', 'regex-literal');
});

test('arm C naive flags: comparator-only label, pause = v2 pause without bindings, lookup = any binding', () => {
  assert.deepEqual(ARM_C, {arm: 'C', label: 'comparator-only', source: 'naive-v2-source-flags', candidate: false});
  const R = (a, b, c, d) => Object.fromEntries(ROLES.map((k, i) => [k, [a, b, c, d][i]]));
  assert.deepEqual(naiveSourceFlags({v2Pause: true, v2Resources: []}), R(false, false, false, true));
  assert.deepEqual(naiveSourceFlags({v2Pause: true, v2Resources: ['r1']}), R(false, false, true, false));
  assert.deepEqual(naiveSourceFlags({v2Pause: false, v2Resources: ['r1', 'r2']}), R(false, false, true, false));
  assert.deepEqual(naiveSourceFlags({v2Pause: false, v2Resources: []}), R(false, false, false, false));
  assert.deepEqual(naiveSourceFlags({}), R(false, false, false, false));
  // Real traps from PLAN §5: spa S02-U012 is pause-only with v2 pause=false; eng held-out S05-U004 is a plain statement with two bindings.
  const byId = Object.fromEntries(cases.map(c => [c.caseId, c]));
  assert.equal(naiveSourceFlags(byId['spa.MRK-1-1-13:S02-U012'].meta).pauseOnly, false);
  assert.equal(naiveSourceFlags(byId['eng.MRK-1-1-13:S02-U012'].meta).pauseOnly, true);
  assert.equal(naiveSourceFlags(byId['eng.MRK-1-14-20:S05-U004'].meta).resourceLookupRequested, true);
});

test('canonical policy identity is stable across rebuilds', async () => {
  const a = await createExplicitCueRules({lists: await fixtureLists(), pauseRegistry: registry});
  const b = await createExplicitCueRules({lists: await fixtureLists(), pauseRegistry: registry});
  assert.equal(a.policySha256, b.policySha256);
  assert.equal(typeof canonical({a: 1}), 'string');
});
