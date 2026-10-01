// C-05 narration manifest → the clips a unit can play (source vs generated), fed to
// selectNarration (R-501). A clip is playable only if it was made from the text on screen
// (sourceSha256 === text sha) — a stale clip is refused, never played (C-05 § Test).
import type { ClipRef } from './provenance';

export interface NarrationEntry {
  id: string;
  path: string;
  sha256: string;
  mime: string;
  sourceSha256: string;
  recordingSource: 'source' | 'generated';
  ai: boolean;
  durationSeconds?: number;
}

export interface NarrationManifest {
  schemaVersion: 1;
  packId: string;
  language: string;
  entries: NarrationEntry[];
}

/** Scripture clip id per edition, as the L1 narration plan names it (`scripture-bsb`). */
export const scriptureClipId = (short: string) => `scripture-${short.toLowerCase()}`;

export function clipsFor(
  manifest: NarrationManifest | null | undefined,
  id: string,
  textSha256: string | undefined,
  base = '',
): { source: ClipRef | null; generated: ClipRef | null } {
  const out: { source: ClipRef | null; generated: ClipRef | null } = {
    source: null,
    generated: null,
  };
  for (const e of manifest?.entries ?? []) {
    if (e.id !== id) continue;
    // stale clip, or text sha unknown (cannot prove it is fresh): refuse (C-05 § Test)
    if (!textSha256 || e.sourceSha256 !== textSha256) continue;
    // `ai` and `recordingSource` must agree; any AI flag makes it generated (never shown as source)
    const generated = e.ai || e.recordingSource === 'generated';
    const ref: ClipRef = {
      id: e.id,
      url: `${base}${e.path}`,
      durationSec: e.durationSeconds,
      sha256: e.sha256,
    };
    if (generated) out.generated ??= ref;
    else out.source ??= ref;
  }
  return out;
}
