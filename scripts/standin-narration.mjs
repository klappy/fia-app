#!/usr/bin/env node
// Stand-in C-05 narration manifest for one pack, built from the PoC's live clips (captain's ruling,
// cookbook work/active/2026-10-01-fia-alpha-v2/RULING.md § 2026-10-02 ~17:22 ET: F5 is built now on a
// stand-in that points at the PoC's Mark 1:1–13 clips, in the frozen C-05 shape; B2b's pack replaces it
// later with no screen change).
//
// Reads klappy/fia-functional-poc at the pinned commit (git show, never the working tree):
//   public/audio/mark-1-1-13/manifest.json        one AI clip per guide unit (117 active units)
//   public/audio/next-actions/manifest.json       19 reviewed pause-wording adaptations, played by the
//                                                 PoC in place of the unit's own clip (src/lib/audio.js:9,
//                                                 approvedAudioManifest lists them first; find() takes the first)
//   public/audio/activity-transitions/manifest.json  4 "with-pause" clips that speak the unit and its attached
//                                                 pause cue in one file (src/lib/flow.js:7 ATTACHED_PAUSES)
// Every clip is bound to the app unit whose C-04 textSha256 equals the PoC entry's sourceSha256; bytes and
// sha256 are recomputed from the git blob and must equal the PoC manifest; duration is measured with ffprobe.
//
// Usage: node scripts/standin-narration.mjs [path/to/fia-functional-poc]
//        (default $FIA_POC or ../fia-functional-poc). Writes src/media/standin/<packId>.{narration,standin}.json.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const POC_SHA = '62a979fc34272a481ef6a113cec23e8e22afdcb2';
const PACK = 'eng.MRK-1-1-13';
const BASE = 'https://fia.klappy.dev';
const VOICE = 'eng-poc-narrator'; // app label (C-05 `voice`); never the provider's voice id

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const poc = resolve(
  process.argv[2] ?? process.env.FIA_POC ?? resolve(root, '../fia-functional-poc'),
);
if (!existsSync(poc)) {
  console.error(`standin: PoC checkout ${poc} not found`);
  process.exit(1);
}

const show = (path, encoding = 'utf8') =>
  execFileSync('git', ['-C', poc, 'show', `${POC_SHA}:${path}`], {
    encoding,
    maxBuffer: 64 * 1024 * 1024,
  });
const json = (path) => JSON.parse(show(path));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const units = JSON.parse(readFileSync(join(root, `data/packs/${PACK}/guide-units.json`), 'utf8'));
const order = units.steps.flatMap((s) => s.units);
const textSha = new Map(order.map((u) => [u.id, u.textSha256]));

const recordings = json('public/audio/mark-1-1-13/manifest.json').entries;
const nextActions = json('public/audio/next-actions/manifest.json').entries;
const transitions = json('public/audio/activity-transitions/manifest.json').entries;

// The PoC's own precedence (src/lib/audio.js:9): next actions, then transitions, then recordings.
const chosen = new Map();
const kindOf = new Map();
for (const [kind, list] of [
  ['next-action', nextActions],
  ['transition', transitions],
  ['recording', recordings],
]) {
  for (const e of list) {
    if (!textSha.has(e.id) || chosen.has(e.id)) continue;
    if (e.sourceSha256 !== textSha.get(e.id))
      throw new Error(`${e.id}: PoC sourceSha256 ≠ app textSha256 (${kind})`);
    chosen.set(e.id, e);
    kindOf.set(e.id, kind);
  }
}

// Attached pause cues: the PoC speaks them inside the parent's with-pause clip and never plays them alone.
const attached = new Map(transitions.map((e) => [e.cueId, e.id]));

const scratch = mkdtempSync(join(tmpdir(), 'standin-'));
const duration = (buf) => {
  const f = join(scratch, 'clip.mp3');
  writeFileSync(f, buf);
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f],
    { encoding: 'utf8' },
  );
  return Math.round(Number(out.trim()) * 1000) / 1000;
};

const manifestPath = {
  recording: 'public/audio/mark-1-1-13/manifest.json',
  'next-action': 'public/audio/next-actions/manifest.json',
  transition: 'public/audio/activity-transitions/manifest.json',
};

const entries = [];
const silent = [];
const adapted = [];
for (const u of order) {
  if (attached.has(u.id)) {
    silent.push({ unitId: u.id, why: 'spoken-in-parent', parent: attached.get(u.id) });
    continue;
  }
  const e = chosen.get(u.id);
  if (!e) {
    silent.push({ unitId: u.id, why: u.hidden ? 'hidden-no-poc-clip' : 'no-poc-clip' });
    continue;
  }
  const kind = kindOf.get(u.id);
  const bytes = show(`public${e.path}`, 'buffer');
  if (bytes.length !== e.bytes) throw new Error(`${u.id}: ${bytes.length} bytes ≠ PoC ${e.bytes}`);
  if (sha256(bytes) !== e.sha256) throw new Error(`${u.id}: sha256 ≠ PoC manifest`);
  if (kind !== 'recording') adapted.push({ unitId: u.id, kind, path: e.path });
  entries.push({
    id: u.id,
    path: e.path,
    bytes: e.bytes,
    sha256: e.sha256,
    mime: 'audio/mpeg',
    sourceSha256: e.sourceSha256,
    recordingSource: 'generated',
    ai: true,
    provider: 'tts',
    voice: VOICE,
    durationSeconds: duration(bytes),
    provenance: {
      status: 'generated',
      generatedFrom: `fia-functional-poc@${POC_SHA}:${manifestPath[kind]}#${u.id}`,
      generator: 'narration',
    },
  });
}
rmSync(scratch, { recursive: true, force: true });

const out = join(root, 'src/media/standin');
writeFileSync(
  join(out, `${PACK}.narration.json`),
  JSON.stringify({ schemaVersion: 1, packId: PACK, language: 'eng', entries }, null, 2) + '\n',
);
writeFileSync(
  join(out, `${PACK}.standin.json`),
  JSON.stringify(
    {
      packId: PACK,
      standIn: true,
      sourcedFrom: `klappy/fia-functional-poc@${POC_SHA}`,
      base: BASE,
      generatedBy: 'scripts/standin-narration.mjs',
      replacedBy: 'B2b: the pack’s own C-05 narration.json (lane B), with no screen change',
      offline:
        'stream only: the PoC host sends no CORS header, so these clips are not saved for offline (B2b/BL3)',
      clips: entries.length,
      adapted,
      silent,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `standin: ${entries.length} clips (${adapted.length} PoC adaptations), ${silent.length} silent units → ${out}`,
);
