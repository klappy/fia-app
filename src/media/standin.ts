// Stand-in narration (captain's ruling, cookbook work/active/2026-10-01-fia-alpha-v2/RULING.md § 2026-10-02
// ~17:22 ET): until lane B's B2b pack ships its own C-05 `narration.json`, the guide plays the PoC's live
// Mark 1:1–13 clips (klappy/fia-functional-poc @62a979f) through a stand-in manifest in the frozen C-05
// shape. The pack's own manifest wins as soon as it has entries, so B2b replaces this with no screen change.
// Built by scripts/standin-narration.mjs; every clip is AI-voiced and carries C-06 provenance naming the PoC.
// Clips stream through the media element only: the PoC host sends no CORS header, so they are never
// fetched by script or saved for offline here (that is B2b/BL3).
import type { FlowGuide } from '../flow/types';
import { clipsFor, type NarrationManifest } from './narration';
import { selectNarration, type NarrationChoice, type NarrationMode } from './provenance';
import mrkNarration from './standin/eng.MRK-1-1-13.narration.json';
import mrkMeta from './standin/eng.MRK-1-1-13.standin.json';

export interface SilentUnit {
  unitId: string;
  /** hidden region with no PoC clip · no PoC clip · its words are spoken inside the parent's clip */
  why: 'hidden-no-poc-clip' | 'no-poc-clip' | 'spoken-in-parent';
  parent?: string;
}

export interface StandIn {
  packId: string;
  manifest: NarrationManifest;
  /** origin the C-05 `path`s are served from (the PoC host) */
  base: string;
  sourcedFrom: string;
  silent: SilentUnit[];
}

export const STANDINS: Readonly<Record<string, StandIn>> = {
  [mrkMeta.packId]: {
    packId: mrkMeta.packId,
    manifest: mrkNarration as unknown as NarrationManifest,
    base: mrkMeta.base,
    sourcedFrom: mrkMeta.sourcedFrom,
    silent: mrkMeta.silent as SilentUnit[],
  },
};

export interface NarrationSource {
  manifest: NarrationManifest;
  /** prefix for each entry's `path` */
  base: string;
  standIn: boolean;
}

/**
 * The manifest the guide plays: the pack's own C-05 when it lists clips, else the stand-in for the
 * pack (if any), else the pack's (empty) manifest. `pack` null = the pack file could not be read.
 */
export function narrationSource(
  pack: NarrationManifest | null | undefined,
  packId: string,
  contentBase: string,
): NarrationSource | null {
  if (pack && pack.entries.length > 0) return { manifest: pack, base: contentBase, standIn: false };
  const s = STANDINS[packId];
  if (s) return { manifest: s.manifest, base: s.base, standIn: true };
  return pack ? { manifest: pack, base: contentBase, standIn: false } : null;
}

/** Per unit: the clip the narration mode allows (R-501), bound to the unit's text sha (C-05 § Test). */
export function guideNarration(
  src: NarrationSource | null,
  guide: FlowGuide,
  mode: NarrationMode,
): Map<string, NarrationChoice> {
  const out = new Map<string, NarrationChoice>();
  for (const step of guide.steps)
    for (const u of step.units)
      out.set(
        u.id,
        selectNarration(mode, clipsFor(src?.manifest, u.id, u.textSha256, src?.base ?? '')),
      );
  return out;
}

/** Unit ids that have a clip to play. */
export const audibleUnits = (choices: Map<string, NarrationChoice>): Set<string> =>
  new Set([...choices].filter(([, c]) => !!c.clip).map(([id]) => id));
