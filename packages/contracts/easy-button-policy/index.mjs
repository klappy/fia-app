// fia-easy-button-policy@2 — one pure settings→action contract for the easy button and autoplay.
// Pure: no imports, no DOM, no Svelte, no clock, no randomness. Same input, same frozen output.
// Rule ids are against the post-R6 App.svelte (integration/2026-10-06-train @21ad2dc, #193 R4-R6 merged):
// executable chain, bundled primaryLabel chain, and easyFace() over them (apps/web/src/lib/easy-button.js).
// Cookbook contract: product/v3-planning/easy-button-policy/CONTRACT.md (fia-app-cookbook).

const bool = { type: 'boolean' };
const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const oneOf = (...values) => ({ enum: values });

export const ACTIONS = Object.freeze(['verifying', 'starting', 'pause', 'begin-again', 'continue', 'resume', 'play-video', 'play', 'listen', 'return', 'begin']);
// Since the post-R6 re-port nothing is reserved: `verifying` (R5) and `starting` (R4) are emitted; `cancel-loading` is gone (R4.2).
export const RESERVED_ACTIONS = Object.freeze([]);
export const PHASES = Object.freeze(['loading', 'starting', 'verified']);
// loading = R5 verifying; starting = a start is pending (startPending || startBurst && playing), gated by decide() as primaryStarting.
export const RESERVED_PHASES = Object.freeze([]);

export const SCHEMA = Object.freeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'fia-easy-button-policy@2',
  title: 'fia-easy-button-policy@2',
  description: 'Input and output of decide(): compiled flow x device settings x runtime facts -> primary action, autoplay, viewing cue, hold, reason. No field can hold narration, prompt or title text.',
  $defs: {
    input: obj({
      flow: obj({
        role: oneOf('guide', 'discussion', 'scripture', 'video'),
        hold: oneOf('manual', 'auto'),
        narration: oneOf('none', 'bound', 'preparable', 'blocked'),
        focal: obj({ kind: oneOf('image', 'map', 'video', 'term', 'scripture', null), descriptionAudio: bool }),
        media: obj({ video: oneOf('bound', 'none') }),
        cue: obj({ pauseOnly: bool })
      }),
      settings: obj({ guideNarration: bool, readScripture: bool, describeImages: bool, autoplayVideo: bool }),
      facts: obj({
        phase: oneOf(...PHASES),
        mode: oneOf('bundled', 'executable'),
        detour: bool, inTransition: bool, mediaLoading: bool, videoLoading: bool, playbackPending: bool,
        playing: bool, inlineVideo: bool, audioActive: bool, audioContext: bool, started: bool,
        introduced: bool, visualHeard: bool, playbackConsent: bool, automaticStart: bool, requestStarting: bool,
        status: oneOf('ready', 'playing', 'paused', 'waiting', 'complete'),
        preparation: oneOf('none', 'available', 'preparing', 'ready', 'failed')
      })
    }),
    output: obj({
      primary: obj({ action: oneOf(...ACTIONS), verified: oneOf(...ACTIONS.filter((a) => a !== 'verifying' && a !== 'starting')) }),
      autoplay: obj({
        arrival: oneOf('none', 'narration', 'prepare', 'describe', 'silent'),
        afterNarration: oneOf('none', 'describe', 'video'),
        detourVideo: bool
      }),
      viewingCue: obj({ skipNarration: bool }),
      hold: oneOf('manual', 'auto'),
      reason: { type: 'string', pattern: '^[EB][0-9]{1,2}$' },
      reasons: obj({
        primary: { type: 'string', pattern: '^[EB][0-9]{1,2}$' },
        arrival: { type: 'string', pattern: '^A[0-9]$' },
        afterNarration: { type: 'string', pattern: '^F[0-9]$' },
        detourVideo: { type: 'string', pattern: '^D[0-9]$' },
        viewingCue: { type: 'string', pattern: '^V[0-9]$' }
      })
    })
  }
});

function check(schema, value, path, errors) {
  if (schema.enum) { if (!schema.enum.includes(value)) errors.push(`${path} must be one of ${JSON.stringify(schema.enum)}`); return; }
  if (schema.type === 'boolean') { if (typeof value !== 'boolean') errors.push(`${path} must be a boolean`); return; }
  if (schema.type === 'string') {
    if (typeof value !== 'string') errors.push(`${path} must be a string`);
    else if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path} must match ${schema.pattern}`);
    return;
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) { errors.push(`${path} must be a plain object`); return; }
    for (const key of Object.keys(value)) if (!(key in schema.properties)) errors.push(`${path}.${key} is not allowed`);
    for (const key of schema.required) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${path}.${key} is required`);
      else check(schema.properties[key], value[key], `${path}.${key}`, errors);
    }
    return;
  }
  errors.push(`${path}: unsupported schema node`);
}

/** Errors for a candidate input (empty array = valid). */
export function errorsFor(input, def = 'input') { const errors = []; check(SCHEMA.$defs[def], input, def, errors); return errors; }
/** Throws on any input outside fia-easy-button-policy@2 (closed shape, every key required). Returns true. */
export function validate(input) {
  const errors = errorsFor(input, 'input');
  if (errors.length) throw new TypeError(`fia-easy-button-policy@2 invalid input: ${errors.join('; ')}`);
  return true;
}
export function validateOutput(output) {
  const errors = errorsFor(output, 'output');
  if (errors.length) throw new TypeError(`fia-easy-button-policy@2 invalid output: ${errors.join('; ')}`);
  return true;
}

/** Values App.svelte derives; never passed in. */
export function derive({ flow, settings, facts }) {
  const executable = facts.mode === 'executable';
  const finished = facts.status === 'complete' && !facts.detour; // :195
  const automaticOff = flow.role === 'scripture' ? !settings.readScripture : !settings.guideNarration; // :179
  const visual = flow.focal.kind === 'image' || flow.focal.kind === 'map'; // :210
  const descriptionAudio = flow.focal.kind !== null && flow.focal.descriptionAudio; // focal?.descriptionAudio: no focal, no description
  const video = executable && !facts.detour ? false : flow.media.video === 'bound'; // :208 (empty in executable mode outside a detour)
  const videoPending = visual && video && !facts.visualHeard; // :211
  const visualPending = visual && !video && settings.describeImages && settings.guideNarration && descriptionAudio && !facts.visualHeard; // :212
  const recording = !executable && flow.narration === 'bound'; // activity.audioSrc; executable activities carry audioSrc:null (executable-presentation.js:68)
  const resumable = facts.audioActive && facts.audioContext; // audio?.active&&audioContext
  const executablePlayable = executable && (flow.narration === 'bound' || flow.narration === 'preparable'); // :33
  const primaryStartsPreparation = !executable && !facts.playing && !facts.playbackPending && !facts.inlineVideo && !facts.videoLoading &&
    !videoPending && !visualPending && facts.preparation === 'available' && !automaticOff && !facts.audioContext && !facts.mediaLoading && !facts.requestStarting &&
    (facts.status === 'ready' || facts.status === 'paused'); // primaryStartsPreparation (available = request, guide preparation, not busy)
  return { executable, finished, automaticOff, visual, descriptionAudio, video, videoPending, visualPending, recording, resumable, executablePlayable, primaryStartsPreparation };
}

// The face: easyFace({verifying, starting: primaryStarting, label}) over the verified chain (#193 R4/R5).
function primaryOf(input, d) {
  const { facts } = input;
  const [verified, verifiedRule] = verifiedOf(input, d);
  const executableRule = d.executable && !facts.detour;
  if (facts.phase === 'loading') return [verified, 'verifying', executableRule ? 'E0' : 'B0'];
  // primaryStarting: !(automaticOff && !detour) && !finished && !inTransition && (startPending || startBurst && playing)
  if (facts.phase === 'starting' && !(d.automaticOff && !facts.detour) && !d.finished && !facts.inTransition) return [verified, 'starting', executableRule ? 'E1' : 'B1'];
  return [verified, verified, verifiedRule];
}

function verifiedOf(input, d) {
  const { flow, facts } = input;
  if (d.executable && !facts.detour) { // executablePrimaryLabel()
    if (d.finished) return ['begin-again', 'E2'];
    if (facts.inTransition || facts.detour || d.automaticOff || facts.status === 'waiting' || !d.executablePlayable) return ['continue', 'E3'];
    if (facts.playing || facts.playbackPending) return ['pause', 'E4'];
    if (d.resumable) return ['resume', 'E5'];
    if (!facts.started) return ['begin', 'E6'];
    return ['play', 'E7'];
  }
  // bundled primaryLabel chain (also executable mode inside a detour); B2 (playbackPending first) retired: it joins B6
  if (d.finished) return ['begin-again', 'B3'];
  if (facts.inTransition) return ['continue', 'B4'];
  if (d.automaticOff && !facts.detour) return ['continue', 'B5'];
  if (facts.playing || facts.playbackPending) return ['pause', 'B6'];
  if (facts.inlineVideo) return ['resume', 'B7'];
  if (d.resumable) return ['resume', 'B8'];
  const silentOrHeld = !d.recording || facts.status === 'waiting' || facts.detour;
  if (d.videoPending && silentOrHeld) return ['play-video', 'B9'];
  if (d.visualPending && silentOrHeld) return ['play', 'B10'];
  if (facts.detour) return [d.visual ? 'return' : flow.focal.kind === 'video' ? 'play-video' : d.descriptionAudio ? 'listen' : 'return', 'B11'];
  if (d.primaryStartsPreparation) return [!facts.started ? 'begin' : 'play', 'B12'];
  if (facts.status === 'waiting' || d.automaticOff || !d.recording) return ['continue', 'B13'];
  if (facts.status === 'paused') return ['resume', 'B14'];
  if (!facts.started) return ['begin', 'B15'];
  return ['play', 'B16'];
}

function arrivalOf({ flow, settings, facts }, d) { // scheduleNext :273-282
  if (!facts.playbackConsent) return ['none', 'A1'];
  if (facts.status === 'complete' || facts.detour || facts.inTransition) return ['none', 'A2'];
  if (d.executable) return [d.executablePlayable && !d.automaticOff ? 'narration' : 'silent', 'A3'];
  const describable = d.visual && (settings.autoplayVideo && d.video || settings.describeImages && d.descriptionAudio);
  if (!d.recording) { // :278 — settles silent; prepares, or describes after settling
    // R6 scheduleNext: a request exists while its preparation runs (preparing), and playRequestedNarration then cancels it (App.svelte playRequestedNarration)
    if ((facts.preparation === 'available' || facts.preparation === 'preparing') && !d.automaticOff) return ['prepare', 'A4'];
    if (describable || flow.focal.kind === 'term' && settings.guideNarration && d.descriptionAudio) return ['describe', 'A4'];
    return ['silent', 'A4'];
  }
  if (d.automaticOff && describable) return ['describe', 'A5']; // :279
  if (d.automaticOff) return ['none', 'A6']; // :281 (Scripture not read) and the :282 guard (muted)
  return ['narration', 'A7']; // :282
}

function afterNarrationOf({ flow, settings, facts }, d) { // finishAudio :270-271, when the narration ended without advancing
  if (!d.executable && !facts.detour && d.visual && (settings.describeImages && d.descriptionAudio || settings.autoplayVideo && d.video)) return ['describe', 'F1'];
  if (!d.executable && !facts.detour && flow.role === 'video' && settings.autoplayVideo) return ['video', 'F2'];
  return ['none', 'F0'];
}

function detourVideoOf({ flow, settings, facts }) { // navigate DETOUR :344 — playbackConsent is the consent held before the detour
  return facts.detour && flow.focal.kind === 'video' && settings.autoplayVideo && facts.playbackConsent ? [true, 'D1'] : [false, 'D0'];
}

function viewingCueOf({ flow, settings, facts }, d) { // playActivity :293, with cue.pauseOnly in place of the phrase test
  const skip = !d.executable && !facts.detour && !d.finished && d.visual && settings.guideNarration && flow.cue.pauseOnly &&
    ((d.video && (!facts.automaticStart || settings.autoplayVideo)) || (settings.describeImages && d.descriptionAudio));
  return skip ? [true, 'V1'] : [false, 'V0'];
}

const freeze = (value) => { if (value && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); Object.freeze(value); } return value; };

/** decide(input) → frozen output. Validates its own input and throws on anything outside the schema. */
export function decide(input) {
  validate(input);
  const d = derive(input);
  const [verified, action, primaryRule] = primaryOf(input, d);
  const [arrival, arrivalRule] = arrivalOf(input, d);
  const [afterNarration, afterRule] = afterNarrationOf(input, d);
  const [detourVideo, detourRule] = detourVideoOf(input);
  const [skipNarration, cueRule] = viewingCueOf(input, d);
  return freeze({
    primary: { action, verified },
    autoplay: { arrival, afterNarration, detourVideo },
    viewingCue: { skipNarration },
    hold: input.flow.hold,
    reason: primaryRule,
    reasons: { primary: primaryRule, arrival: arrivalRule, afterNarration: afterRule, detourVideo: detourRule, viewingCue: cueRule }
  });
}

// Cause taxonomy (k0006) — data for the #216 EB guard, not a runtime guard.
// Settled classes per the captain (gesture, network, status); provisional ones are #216's readings, for review.
export const CAUSE_CLASSES = Object.freeze({
  gesture: Object.freeze({ provisional: false }),
  network: Object.freeze({ provisional: false }), // no @2 input path: nothing in the label chains reads online
  status: Object.freeze({ provisional: false }),
  'media-event': Object.freeze({ provisional: true }),
  'scheduled-start': Object.freeze({ provisional: true })
});
const CLASS_ORDER = Object.keys(CAUSE_CLASSES);
export const CAUSE_OF_PATH = Object.freeze({
  'settings.guideNarration': 'gesture', 'settings.readScripture': 'gesture', 'settings.describeImages': 'gesture', 'settings.autoplayVideo': 'gesture',
  'facts.playbackConsent': 'gesture', 'facts.started': 'gesture', 'facts.detour': 'gesture',
  'facts.phase': 'status', 'facts.preparation': 'status', 'facts.mediaLoading': 'status', 'facts.videoLoading': 'status', 'facts.mode': 'status',
  'flow.role': 'status', 'flow.hold': 'status', 'flow.narration': 'status', 'flow.focal.kind': 'status', 'flow.focal.descriptionAudio': 'status', 'flow.media.video': 'status', 'flow.cue.pauseOnly': 'status',
  'facts.playing': 'media-event', 'facts.audioActive': 'media-event', 'facts.audioContext': 'media-event', 'facts.inlineVideo': 'media-event',
  'facts.status': 'media-event', 'facts.inTransition': 'media-event', 'facts.introduced': 'media-event', 'facts.visualHeard': 'media-event',
  'facts.playbackPending': 'scheduled-start', 'facts.automaticStart': 'scheduled-start', 'facts.requestStarting': 'status'
});

function leaves(schema, prefix, out) {
  for (const [key, node] of Object.entries(schema.properties)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (node.type === 'object') leaves(node, path, out); else out.push(path);
  }
  return out;
}
export const INPUT_PATHS = Object.freeze(leaves(SCHEMA.$defs.input, '', []));
const at = (value, path) => path.split('.').reduce((v, k) => v[k], value);

/** causeOf(prev, next): null when nothing changed, else the class the EB guard should pair with a logged event. */
export function causeOf(prev, next) {
  validate(prev); validate(next);
  const paths = INPUT_PATHS.filter((p) => at(prev, p) !== at(next, p));
  if (!paths.length) return null;
  const classes = CLASS_ORDER.filter((c) => paths.some((p) => CAUSE_OF_PATH[p] === c));
  return freeze({ class: classes[0], provisional: CAUSE_CLASSES[classes[0]].provisional, classes, paths });
}

const NARRATION_OF_ACTION = { none: 'none', 'play-bound-audio': 'bound', 'prepare-original': 'preparable', blocked: 'blocked' };
const FOCAL_KINDS = new Set(['image', 'map', 'video', 'term', 'scripture']);

/** flowFrom(activity, assets, executableAction, detourAssetId?) → the `flow` part of the input.
 * Prefers server-emitted `activity.flow` (role, hold, cue, media) when present; otherwise derives it.
 * The pause-only cue only ever comes from data (activity.flow.cue or activity.cue), never from narration text. */
export function flowFrom(activity, assets = {}, executableAction = null, detourAssetId = null) {
  const focalAsset = assets[detourAssetId || activity?.assetId] || null;
  const kind = FOCAL_KINDS.has(focalAsset?.kind) ? focalAsset.kind : null;
  const executable = !!executableAction;
  const related = executable && !detourAssetId ? [] : (focalAsset?.relatedIds || []);
  const derived = {
    role: activity.kind,
    hold: executable ? (executableAction.completion?.action === 'manual-continue' ? 'manual' : 'auto') : (activity.completion === 'confirm' ? 'manual' : 'auto'),
    narration: executable ? (NARRATION_OF_ACTION[executableAction.narration?.action] || 'blocked') : (activity.audioSrc ? 'bound' : 'none'),
    focal: { kind, descriptionAudio: !!focalAsset?.descriptionAudio },
    media: { video: related.map((id) => assets[id]).some((a) => a?.kind === 'video' && (a.src || a.videoPrepared)) ? 'bound' : 'none' },
    cue: { pauseOnly: (activity.cue?.pauseOnly) === true }
  };
  const emitted = activity.flow;
  if (!emitted) return derived;
  return {
    ...derived,
    ...(emitted.role ? { role: emitted.role } : {}),
    ...(emitted.hold ? { hold: emitted.hold } : {}),
    ...(emitted.media?.video ? { media: { video: emitted.media.video } } : {}),
    cue: emitted.cue ? { pauseOnly: emitted.cue.pauseOnly === true } : derived.cue
  };
}
