// fia-easy-button-policy@1: named rows, table drift, seeded property run (I1–I7), causeOf totality,
// and parity against the verbatim App.svelte :91 and :216 label expressions (main @3d3b1d2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCHEMA, ACTIONS, RESERVED_ACTIONS, CAUSE_CLASSES, CAUSE_OF_PATH, INPUT_PATHS, decide, validate, validateOutput, causeOf, flowFrom } from '../../packages/contracts/easy-button-policy/index.mjs';
import { buildTable, serialize, IDLE } from '../../packages/contracts/easy-button-policy/fixtures/generate.mjs';
import { labelFor, accessibleNameFor } from '../../apps/web/src/lib/primary-labels.js';

const dir = new URL('../../packages/contracts/easy-button-policy/', import.meta.url);
const read = (p) => readFileSync(new URL(p, dir), 'utf8');
const named = JSON.parse(read('fixtures/named.json')).rows;
const declaredDivergences = JSON.parse(read('fixtures/parity-divergences.json')).divergences;
const DRAWS = 20000;

// Seeded LCG (Numerical Recipes constants) — reproducible draws over the whole input schema.
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; }; }
function drawFrom(schema, rnd, pTrue) {
  if (schema.enum) return schema.enum[Math.floor(rnd() * schema.enum.length)];
  if (schema.type === 'boolean') return rnd() < pTrue;
  if (schema.type === 'object') return Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, drawFrom(v, rnd, pTrue)]));
  throw new Error('unsupported schema node');
}
// 20 000 uniform draws over the whole schema, plus two sparser sweeps (booleans true at 15% and 5%) so the deep
// rules of the :216 chain (B12, B14, B16) are reached often enough for parity to mean something.
const sweep = (seed, pTrue, n) => { const rnd = lcg(seed); return Array.from({ length: n }, () => drawFrom(SCHEMA.$defs.input, rnd, pTrue)); };
const draws = sweep(0x0fa1_2026, 0.5, DRAWS);
const parityDraws = [...draws, ...sweep(0x0fa1_2027, 0.15, DRAWS), ...sweep(0x0fa1_2028, 0.05, DRAWS)];
const at = (v, p) => p.split('.').reduce((o, k) => o[k], v);
const set = (v, p, x) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], v)[last] = x; };
function partialMatch(actual, expected, path = '') {
  for (const [k, v] of Object.entries(expected)) {
    if (v && typeof v === 'object') partialMatch(actual[k], v, `${path}${k}.`);
    else assert.equal(actual[k], v, `${path}${k}`);
  }
}

test('schema file equals the SCHEMA export', () => {
  assert.deepEqual(JSON.parse(read('fia-easy-button-policy@1.schema.json')), JSON.parse(JSON.stringify(SCHEMA)));
  assert.equal(SCHEMA.$id, 'fia-easy-button-policy@1');
});

test('the input schema has no field that can hold narration, prompt or title text', () => {
  const walk = (node, path) => {
    if (node.type === 'object') { assert.equal(node.additionalProperties, false, path); for (const [k, v] of Object.entries(node.properties)) walk(v, `${path}.${k}`); return; }
    assert.ok(node.type === 'boolean' || Array.isArray(node.enum), `${path} is not boolean or enum`);
  };
  walk(SCHEMA.$defs.input, 'input');
});

test('named rows: each expectation holds and every rule id is exercised', () => {
  assert.ok(named.length <= 40);
  const seen = new Set();
  for (const row of named) {
    const out = decide(row.input);
    partialMatch(out, row.expect, `${row.name}: `);
    const reasons = Object.values(out.reasons);
    assert.ok(reasons.includes(row.rule), `${row.name}: rule ${row.rule} not in ${reasons}`);
    reasons.forEach((r) => seen.add(r));
  }
  const all = [...Array(8).keys()].map((i) => `E${i}`).concat([...Array(17).keys()].map((i) => `B${i}`), [...Array(7).keys()].map((i) => `A${i + 1}`), ['F0', 'F1', 'F2', 'D0', 'D1', 'V0', 'V1']);
  assert.deepEqual(all.filter((id) => !seen.has(id)), []);
  for (const id of ['S02-U005', 'S02-U008', 'S03-U007', 'S03-U019', 'S03-U021', 'S05-U015']) assert.ok(named.some((r) => r.name === `pause-only ${id}`), id);
});

test('table.json is the declared 512-row projection and regenerates byte-identical', () => {
  const table = buildTable();
  assert.equal(table.rows.length, 4 * 2 * 16 * 2 * 2);
  assert.equal(read('fixtures/table.json'), serialize(table));
});

test(`I1 total, pure, frozen over ${DRAWS} seeded draws; I3–I7 hold`, () => {
  for (const input of draws) {
    const out = decide(input);
    validateOutput(out); // I1 schema-valid output
    assert.deepEqual(decide(structuredClone(input)), out); // I1 same input → same output
    assert.ok(Object.isFrozen(out) && Object.isFrozen(out.autoplay));
    const { flow, settings, facts } = input;
    const automaticOff = flow.role === 'scripture' ? !settings.readScripture : !settings.guideNarration;
    // I3 verifying iff phase loading; reserved action never emitted
    assert.equal(out.primary.action === 'verifying', facts.phase === 'loading');
    assert.ok(!RESERVED_ACTIONS.includes(out.primary.action));
    // I4 nothing the app starts by itself (arrival, detour video) without playback consent
    if (!facts.playbackConsent) { assert.equal(out.autoplay.arrival, 'none'); assert.equal(out.autoplay.detourVideo, false); }
    // I5 video only with autoplayVideo; visual description only with describeImages (or a related video under autoplayVideo); no narration when automaticOff
    if (!settings.autoplayVideo) { assert.notEqual(out.autoplay.afterNarration, 'video'); assert.equal(out.autoplay.detourVideo, false); }
    if (!settings.describeImages && !(settings.autoplayVideo && flow.media.video === 'bound')) {
      assert.notEqual(out.autoplay.afterNarration, 'describe');
      if (flow.focal.kind !== 'term') assert.notEqual(out.autoplay.arrival, 'describe');
    }
    if (automaticOff) assert.notEqual(out.autoplay.arrival, 'narration');
    // I6 skipNarration only from the data flag
    if (!flow.cue.pauseOnly) assert.equal(out.viewingCue.skipNarration, false);
    // I7 executable mode outside a detour never plays a related video or describes
    if (facts.mode === 'executable' && !facts.detour) {
      assert.notEqual(out.primary.action, 'play-video');
      assert.notEqual(out.autoplay.arrival, 'describe');
      assert.notEqual(out.autoplay.afterNarration, 'describe');
      assert.equal(out.viewingCue.skipNarration, false);
    }
    assert.equal(out.hold, flow.hold);
  }
});

test('reserved phase starting is inert in @1 (decides as verified)', () => {
  for (const input of draws.slice(0, 2000)) {
    if (input.facts.phase === 'loading') continue;
    const a = structuredClone(input); a.facts.phase = 'starting';
    const b = structuredClone(input); b.facts.phase = 'verified';
    assert.deepEqual(decide(a), decide(b));
  }
});

test('I2 decide validates its own input: unknown, missing and mistyped keys throw', () => {
  const base = structuredClone(IDLE);
  assert.equal(validate(base), true);
  for (const path of ['', 'flow', 'flow.focal', 'flow.media', 'flow.cue', 'settings', 'facts']) {
    const bad = structuredClone(base); (path ? at(bad, path) : bad).narration_text = 'I will pause the audio here';
    if (path === 'flow') { delete bad.flow.narration_text; bad.flow.text = 'I will pause the audio here'; }
    assert.throws(() => decide(bad), /invalid input/, path || 'root');
  }
  for (const path of INPUT_PATHS) {
    const missing = structuredClone(base); const ks = path.split('.'); const last = ks.pop(); delete ks.reduce((o, k) => o[k], missing)[last];
    assert.throws(() => decide(missing), /is required/, path);
    const wrong = structuredClone(base); set(wrong, path, 'x-not-allowed');
    assert.throws(() => decide(wrong), /invalid input/, path);
  }
  assert.throws(() => decide(null), /invalid input/);
});

test('causeOf: every input path has exactly one known class; null on identical input; single flips classify', () => {
  assert.deepEqual([...INPUT_PATHS].sort(), Object.keys(CAUSE_OF_PATH).sort());
  for (const p of INPUT_PATHS) assert.ok(CAUSE_CLASSES[CAUSE_OF_PATH[p]], p);
  assert.equal(CAUSE_CLASSES.network.provisional, false);
  assert.ok(!Object.values(CAUSE_OF_PATH).includes('network')); // no @1 input reads online
  for (const input of draws.slice(0, 500)) {
    assert.equal(causeOf(input, structuredClone(input)), null);
    for (const p of INPUT_PATHS) {
      const node = p.split('.').reduce((n, k) => n.properties[k], SCHEMA.$defs.input);
      const values = node.enum || [false, true];
      const next = structuredClone(input); set(next, p, values[(values.indexOf(at(input, p)) + 1) % values.length]);
      const cause = causeOf(input, next);
      assert.deepEqual(cause.paths, [p]);
      assert.equal(cause.class, CAUSE_OF_PATH[p]);
      assert.equal(cause.provisional, CAUSE_CLASSES[cause.class].provisional);
    }
  }
  // the k0006 settings toggles are gestures; a preparation publish is a status response
  const a = structuredClone(IDLE), b = structuredClone(IDLE); b.settings.guideNarration = false; b.settings.autoplayVideo = true;
  assert.equal(causeOf(a, b).class, 'gesture');
  const c = structuredClone(IDLE); c.facts.preparation = 'available';
  assert.equal(causeOf(a, c).class, 'status');
  // a pure function cannot flip without an input delta
  for (const input of draws.slice(0, 500)) assert.deepEqual(decide(input), decide(structuredClone(input)));
});

// ---- Parity: the :91 and :216 expressions, copied verbatim from apps/web/src/App.svelte @3d3b1d2,
// evaluated over bindings built from the same tuple decide() reads.
function legacyBindings(input) {
  const { flow, settings, facts } = input;
  const executableMode = facts.mode === 'executable';
  const ACTION = { none: 'none', bound: 'play-bound-audio', preparable: 'prepare-original', blocked: 'blocked' };
  const executableAction = executableMode ? { narration: { action: ACTION[flow.narration] } } : null;
  const executablePlayable = ['play-bound-audio', 'prepare-original'].includes(executableAction?.narration.action); // :33
  const detourId = facts.detour ? 'focal' : null;
  const focal = flow.focal.kind === null ? undefined : { id: 'focal', kind: flow.focal.kind, descriptionAudio: flow.focal.descriptionAudio ? '/d.mp3' : undefined, relatedIds: flow.media.video === 'bound' ? ['v1'] : [] };
  const assets = { v1: { id: 'v1', kind: 'video', src: '/v.mp4' } };
  const session = { detour: detourId, status: facts.status, preferences: { readScripture: settings.readScripture, describeImages: settings.describeImages, autoplayVideo: settings.autoplayVideo } };
  const activity = { kind: flow.role, audioSrc: executableMode ? null : (flow.narration === 'bound' ? '/a.mp3' : undefined) };
  const muted = !settings.guideNarration;
  const automaticOff = activity?.kind === 'scripture' ? !session.preferences.readScripture : muted; // :179
  const finished = session.status === 'complete' && !session.detour; // :195
  const inTransition = facts.inTransition; // :183 (transitionSection===activity.sectionId&&…) is a fact
  const isPlaying = facts.playing;
  const audio = { active: facts.audioActive };
  const audioContext = facts.audioContext ? { type: 'narration', id: 'x' } : null;
  const started = facts.started, mediaLoading = facts.mediaLoading, playbackPending = facts.playbackPending;
  const inlineVideo = facts.inlineVideo ? { id: 'v1' } : null;
  const videoDeliveryState = { loading: facts.videoLoading };
  const visualHeard = facts.visualHeard ? 'focal' : null;
  const preparationRequest = facts.preparation === 'available' ? { id: 'req' } : null;
  const preparationBusy = facts.preparation === 'preparing';
  const hasGuidePreparation = () => true;
  const selectedPack = {};
  const matchingVideo = (executableMode && !session.detour ? [] : focal?.relatedIds || []).map(id => assets[id]).find(a => a?.kind === 'video' && (a.src || a.videoPrepared)); // :208
  const visual = ['image', 'map'].includes(focal?.kind); // :210
  const videoPending = visual && !!matchingVideo && visualHeard !== focal.id; // :211
  const visualPending = visual && !matchingVideo && session.preferences.describeImages && !muted && !!focal.descriptionAudio && visualHeard !== focal.id; // :212
  const primaryStartsPreparation = !executableMode && !isPlaying && !playbackPending && !inlineVideo && !videoDeliveryState.loading && !videoPending && !visualPending && !!preparationRequest && hasGuidePreparation(selectedPack, preparationRequest) && !automaticOff && !audioContext && !preparationBusy && !mediaLoading && ['ready', 'paused'].includes(session.status); // :215
  return { executableMode, executablePlayable, focal, session, activity, automaticOff, finished, inTransition, isPlaying, audio, audioContext, started, mediaLoading, playbackPending, inlineVideo, videoDeliveryState, visual, videoPending, visualPending, primaryStartsPreparation };
}
function legacyExecutableLabel(b) {
  const { mediaLoading, finished, inTransition, session, automaticOff, executablePlayable, isPlaying, audio, audioContext, started } = b;
  return mediaLoading?'Cancel loading':finished?'Begin again':inTransition||session.detour||automaticOff||session.status==='waiting'||!executablePlayable?'Continue':isPlaying?'Pause':audio?.active&&audioContext?'Resume':!started?'Begin':'Play'; // :91 verbatim
}
function legacyLabel(b) {
  const { executableMode, session, mediaLoading, videoDeliveryState, playbackPending, finished, inTransition, automaticOff, isPlaying, inlineVideo, audio, audioContext, videoPending, activity, visualPending, visual, focal, primaryStartsPreparation, started } = b;
  const executablePrimaryLabel = () => legacyExecutableLabel(b);
  return executableMode&&!session.detour?executablePrimaryLabel():mediaLoading||videoDeliveryState.loading?'Cancel loading':playbackPending?'Pause':finished?'Begin again':inTransition?'Continue':automaticOff&&!session.detour?'Continue':isPlaying?'Pause':inlineVideo?'Resume':audio?.active&&audioContext?'Resume':videoPending&&(!activity.audioSrc||session.status==='waiting'||session.detour)?'Play video':visualPending&&(!activity.audioSrc||session.status==='waiting'||session.detour)?'Play':session.detour?(visual?'Return':focal?.kind==='video'?'Play video':focal?.descriptionAudio?'Listen':'Return'):primaryStartsPreparation?(!started?'Begin':'Play'):session.status==='waiting'||automaticOff||!activity?.audioSrc?'Continue':session.status==='paused'?'Resume':!started?'Begin':'Play'; // :216 verbatim
}

test(`parity: labelFor(decide()) equals the verbatim :91/:216 label on ${3 * DRAWS} draws, divergences named`, () => {
  const found = new Map();
  const hit = new Set();
  let compared = 0;
  for (const input of parityDraws) {
    if (input.facts.phase === 'loading') continue; // verifying has no legacy label (R5)
    compared++;
    const out = decide(input);
    const legacy = legacyLabel(legacyBindings(input));
    const label = labelFor(out.primary.action);
    hit.add(out.reason);
    assert.equal(accessibleNameFor(out.primary.action), label); // aria-label equals label off verifying (GuidePrimary.svelte:10)
    if (legacy !== label) { const key = `${out.reason}:${legacy}->${label}`; found.set(key, (found.get(key) || 0) + 1); }
  }
  assert.ok(compared > DRAWS);
  const primaryRules = [...Array(7).keys()].map((i) => `E${i + 1}`).concat([...Array(16).keys()].map((i) => `B${i + 1}`));
  assert.deepEqual(primaryRules.filter((r) => !hit.has(r)), [], 'every verified primary rule is reached by the parity draws');
  assert.deepEqual([...found.keys()].sort(), declaredDivergences.map((d) => d.key).sort(), `unnamed divergences: ${JSON.stringify([...found])}`);
});

test('labels: every emitted action has today\'s en label; verifying has the R5 accessible name', () => {
  const today = new Set(['Begin', 'Play', 'Pause', 'Resume', 'Continue', 'Return', 'Play video', 'Listen', 'Begin again', 'Cancel loading']);
  for (const a of ACTIONS.filter((x) => !['verifying', 'starting'].includes(x))) assert.ok(today.has(labelFor(a)), a);
  assert.equal(labelFor('verifying'), '');
  assert.equal(accessibleNameFor('verifying'), 'Checking availability');
  assert.throws(() => labelFor('starting'), /reserved/);
});

test('flowFrom derives bundled and executable flows; cue only from data; server flow preferred', () => {
  const pack = JSON.parse(readFileSync(new URL('../../apps/web/src/lib/pack.json', import.meta.url), 'utf8'));
  const activity = pack.activities.find((a) => a.id === 'S02-U005');
  const flow = flowFrom(activity, pack.assets);
  assert.deepEqual(flow, { role: activity.kind, hold: activity.completion === 'confirm' ? 'manual' : 'auto', narration: 'bound', focal: { kind: 'image', descriptionAudio: true }, media: { video: 'bound' }, cue: { pauseOnly: activity.cue?.pauseOnly === true } });
  assert.match(activity.narration, /I will pause the audio here/i); // text is present, yet it never reaches the flow
  assert.equal(flowFrom({ ...activity, cue: undefined }, pack.assets).cue.pauseOnly, false);
  assert.equal(flowFrom({ ...activity, cue: { pauseOnly: true } }, pack.assets).cue.pauseOnly, true);
  const exec = flowFrom({ ...activity, audioSrc: null }, pack.assets, { narration: { action: 'prepare-original' }, completion: { action: 'manual-continue' } });
  assert.deepEqual([exec.narration, exec.hold, exec.media.video], ['preparable', 'manual', 'none']);
  const emitted = flowFrom({ ...activity, flow: { schema: 'fia-flow-role@1', role: 'discussion', hold: 'manual', cue: { pauseOnly: false }, media: { video: 'none' } }, cue: { pauseOnly: true } }, pack.assets);
  assert.deepEqual([emitted.role, emitted.hold, emitted.cue.pauseOnly, emitted.media.video], ['discussion', 'manual', false, 'none']);
  for (const a of pack.activities) validate({ flow: flowFrom(a, pack.assets), settings: IDLE.settings, facts: IDLE.facts });
});

test('the package is pure: no imports in index.mjs', () => {
  const src = read('index.mjs');
  assert.doesNotMatch(src, /^\s*import\s/m);
  assert.doesNotMatch(src, /\brequire\(|\bfetch\(|Date\.now|Math\.random|document\.|window\./);
});
