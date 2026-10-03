import type { BeadKind } from '../flow/ui/band';

// The coded marks (PRD § 8.3; mock KIND, cookbook design/alpha-v2-screens/_frame.js:97-108): one shape
// and one colour token per kind, for the kit's Bead / BeadStrip / StageRail `kinds` prop. The colours
// are the app tokens in frame/frame.css (--fia-kind-*), so a screen never re-aliases them.
// One table for the band, the map, the recap, the library resume, coverage and the layer head.
export const KINDS = {
  plain: { shape: 'circle', color: 'var(--fia-kind-plain)' },
  scripture: { shape: 'square', color: 'var(--fia-kind-scripture)' },
  term: { shape: 'diamond', color: 'var(--fia-kind-term)' },
  media: { shape: 'triangle', color: 'var(--fia-kind-media)' },
  video: { shape: 'screen', color: 'var(--fia-kind-media)' },
  stop: { shape: 'bar', color: 'var(--fia-kind-stop)' },
  end: { shape: 'bars', color: 'var(--fia-kind-stop)' },
} as const satisfies Record<BeadKind, { shape: string; color: string }>;

/** A kind's colour token, e.g. for a kit Bead's `color`. */
export const kindColor = (k: BeadKind) => KINDS[k].color;
