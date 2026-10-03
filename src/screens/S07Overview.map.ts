// S07 Whole guide map: the pure model behind the sheet (F6-S07; nodded mock cookbook
// design/alpha-v2-screens/07-overview.html:80-121). Every step with its parts, each part's coded bead
// (kind by shape and colour, state by fill: PRD § 8.3) and the talk rows. States follow the guide's
// position, as the progress band does (flow/ui/band.ts stateOf): parts before "you are here" are
// heard, parts after it are ahead. Pure; S07Overview.tsx draws it on the kit.
import { position, skippedStops, stopAt, waitingStops } from '../flow/model';
import type { FlowState } from '../flow/machine';
import { unitKinds, type BeadKind, type BeadState } from '../flow/ui/band';
import type { FlowGuide, GuideStop, GuideUnit } from '../flow/types';

/** Kind → shape and colour for the kit Bead / BeadStrip: the band's own map (components/ProgressRail.tsx KINDS). */
export const MAP_KINDS = {
  plain: { shape: 'circle', color: 'var(--fia-kind-plain)' },
  scripture: { shape: 'square', color: 'var(--fia-kind-scripture)' },
  term: { shape: 'diamond', color: 'var(--fia-kind-term)' },
  media: { shape: 'triangle', color: 'var(--fia-kind-media)' },
  video: { shape: 'screen', color: 'var(--fia-kind-media)' },
  stop: { shape: 'bar', color: 'var(--fia-kind-stop)' },
  end: { shape: 'bars', color: 'var(--fia-kind-stop)' },
} as const;

/** A part's top kind: video > image/map > Scripture > key term > plain (PRD § 8.3; band.ts PRIORITY). */
const PRIORITY: BeadKind[] = ['video', 'media', 'scripture', 'term'];
const topOf = (kinds: BeadKind[]): BeadKind => PRIORITY.find((k) => kinds.includes(k)) ?? 'plain';

export interface MapPart {
  unit: GuideUnit;
  /** 1-based part number inside its step */
  n: number;
  state: BeadState;
  kind: BeadKind;
  /** satellite dot: the part carries more than one kind ("more inside") */
  more: boolean;
  /** first words of the part, cut at a word (mock firstWords, 07-overview.html:83) */
  words: string;
  /** the talk that waits after this part; `skipped` when the person went past it undiscussed */
  talk?: { stop: GuideStop; skipped: boolean };
  /** the guide ends after this part (terminal stop) */
  end: boolean;
}

export interface MapStep {
  index: number;
  id: string;
  title: string;
  parts: MapPart[];
  talks: number;
  status: 'done' | 'current' | 'ahead';
}

export interface GuideMap {
  steps: MapStep[];
  /** step and 1-based part of "you are here" */
  current: { stepIndex: number; n: number };
  parts: number;
  talks: number;
  /** which kinds the guide draws at all: the legend teaches only marks that appear (PRD § 8.3) */
  kinds: Set<BeadKind>;
}

/** The first words of a part's text, cut at a word boundary, with an ellipsis (mock firstWords). */
export function firstWords(text: string, max = 34): string {
  const plain = text.replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const space = cut.lastIndexOf(' ');
  const head = space > 0 ? cut.slice(0, space) : cut.slice(0, max - 1);
  return `${head.replace(/[,:;.]$/, '')}…`;
}

export function guideMap(
  g: FlowGuide,
  s: Pick<FlowState, 'unitId' | 'visited' | 'discussed'>,
): GuideMap {
  const here = position(g, s.unitId);
  const terminal = new Set(g.stops.filter((x) => x.kind === 'terminal').map((x) => x.afterUnitId));
  const skipped = new Set(skippedStops(g, s.visited, s.discussed).map((x) => x.id));
  const kinds = new Set<BeadKind>(['plain']);
  const steps = g.steps.map((step, index): MapStep => {
    const status =
      index < here.stageIndex ? 'done' : index === here.stageIndex ? 'current' : 'ahead';
    const parts = step.units.map((unit, i): MapPart => {
      const all = unitKinds(g, unit);
      const kind = topOf(all);
      all.forEach((k) => kinds.add(k));
      const state: BeadState =
        status === 'done'
          ? 'done'
          : status === 'ahead'
            ? 'upcoming'
            : i < here.unitIndex
              ? 'done'
              : i === here.unitIndex
                ? 'current'
                : 'upcoming';
      const stop = stopAt(g, unit.id);
      if (stop) kinds.add('stop');
      if (terminal.has(unit.id)) kinds.add('end');
      return {
        unit,
        n: i + 1,
        state,
        kind,
        more: all.length > 1,
        words: firstWords(unit.text),
        talk: stop ? { stop, skipped: skipped.has(stop.id) } : undefined,
        end: terminal.has(unit.id),
      };
    });
    return {
      index,
      id: step.id,
      title: step.title,
      parts,
      talks: parts.filter((p) => p.talk).length,
      status,
    };
  });
  return {
    steps,
    current: { stepIndex: here.stageIndex, n: here.unitIndex + 1 },
    parts: steps.reduce((sum, st) => sum + st.parts.length, 0),
    talks: waitingStops(g).length,
    kinds,
  };
}

/** The kit BeadStrip items for a step's bead row: every part, a bar after each talk, ‖ at the end. */
export function stepBeads(step: MapStep) {
  return step.parts.flatMap((p) => [
    { kind: p.kind, state: p.state, more: p.more || undefined },
    ...(p.talk
      ? [
          {
            kind: 'stop' as const,
            state: p.state === 'upcoming' ? ('upcoming' as const) : ('done' as const),
          },
        ]
      : []),
    ...(p.end ? [{ kind: 'end' as const, state: 'upcoming' as const }] : []),
  ]);
}

/**
 * Sheet 24's jump drawn as coded beads (mock 24 `BeadRow from to stopScale={1.5}`): every part from
 * "you are here" to the part tapped, in guide order across steps, with a bar after each talk on the
 * way. "You are here" is the current bead, the rest are ahead; a talk's bar is solid at 1.5× so the one
 * thing the jump would pass reads first (PRD § 8.3: the talk bar is the only bar).
 */
export function jumpBeads(map: GuideMap, fromId: string, toId: string, size = 10) {
  const parts = map.steps.flatMap((st) => st.parts);
  const a = parts.findIndex((p) => p.unit.id === fromId);
  const b = parts.findIndex((p) => p.unit.id === toId);
  if (a < 0 || b < a) return [];
  return parts.slice(a, b + 1).flatMap((p, i) => [
    {
      kind: p.kind,
      state: i === 0 ? ('current' as const) : ('upcoming' as const),
      more: p.more || undefined,
    },
    ...(p.talk && i < b - a
      ? [{ kind: 'stop' as const, state: 'done' as const, size: Math.round(size * 1.5) }]
      : []),
  ]);
}
