// Writes fixtures/table.json: the declared projection of fia-easy-button-policy@1 —
// role(4) x media.video(2) x settings(16) x playbackConsent(2) x phase(3) = 768 rows at the idle facts below.
// The full input product is ~10^9 rows (CHALLENGE CL1/CF6/SL5); the rest of the schema is covered by the
// seeded property run and the verbatim-legacy parity in tests/contracts/easy-button-policy.test.mjs.
// Run: node packages/contracts/easy-button-policy/fixtures/generate.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decide } from '../index.mjs';

export const IDLE = Object.freeze({
  flow: { role: 'guide', hold: 'auto', narration: 'bound', focal: { kind: 'image', descriptionAudio: true }, media: { video: 'none' }, cue: { pauseOnly: false } },
  settings: { guideNarration: true, readScripture: true, describeImages: false, autoplayVideo: false },
  facts: {
    phase: 'verified', mode: 'bundled', detour: false, inTransition: false, mediaLoading: false, videoLoading: false, playbackPending: false,
    playing: false, inlineVideo: false, audioActive: false, audioContext: false, started: false, introduced: false, visualHeard: false,
    playbackConsent: false, automaticStart: false, requestStarting: false, status: 'ready', preparation: 'none'
  }
});

export const AXES = Object.freeze({
  'flow.role': ['guide', 'discussion', 'scripture', 'video'],
  'flow.media.video': ['none', 'bound'],
  'settings.guideNarration': [false, true],
  'settings.readScripture': [false, true],
  'settings.describeImages': [false, true],
  'settings.autoplayVideo': [false, true],
  'facts.playbackConsent': [false, true],
  'facts.phase': ['loading', 'starting', 'verified']
});

const set = (target, path, value) => { const keys = path.split('.'); const last = keys.pop(); keys.reduce((o, k) => o[k], target)[last] = value; };

export function buildTable() {
  const names = Object.keys(AXES);
  const rows = [];
  const walk = (i, picked) => {
    if (i === names.length) {
      const input = structuredClone(IDLE);
      names.forEach((n, k) => set(input, n, picked[k]));
      const out = decide(input);
      rows.push([...picked, out.primary.action, out.primary.verified, out.autoplay.arrival, out.autoplay.afterNarration, out.autoplay.detourVideo, out.viewingCue.skipNarration, out.hold,
        [out.reasons.primary, out.reasons.arrival, out.reasons.afterNarration, out.reasons.detourVideo, out.reasons.viewingCue].join('/')]);
      return;
    }
    for (const v of AXES[names[i]]) walk(i + 1, [...picked, v]);
  };
  walk(0, []);
  return { schema: 'fia-easy-button-policy@1', projection: 'declared', idle: IDLE, columns: [...names, 'primary.action', 'primary.verified', 'autoplay.arrival', 'autoplay.afterNarration', 'autoplay.detourVideo', 'viewingCue.skipNarration', 'hold', 'reasons'], rows };
}

export function serialize(table) {
  const head = JSON.stringify({ ...table, rows: [] }, null, 2).replace(/"rows": \[\]\n\}$/, '"rows": [\n');
  return head + table.rows.map((r) => '    ' + JSON.stringify(r)).join(',\n') + '\n  ]\n}\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const table = buildTable();
  writeFileSync(new URL('./table.json', import.meta.url), serialize(table));
  console.log(`table.json: ${table.rows.length} rows`);
}
