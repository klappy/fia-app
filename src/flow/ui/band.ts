// The progress band's model (PRD § 8.3; nodded mock design/alpha-v2-screens/_frame.js:85-191): overall =
// one segment per step; scoped = coded beads for the current section (the run of parts between two
// talks) and capsules for the step's other sections. Pure; the screen draws it with the kit's
// progress/StageRail and BeadStrip. Beads are display only (ruling (e)): never tappable.
import { isScriptureCue, position, stopAt } from '../model';
import type { FlowGuide, GuideUnit } from '../types';

/** Kit bead kinds (StageRail.jsx BEAD_KINDS); colours come from the app's --fia-kind-* tokens. */
export type BeadKind = 'plain' | 'scripture' | 'term' | 'media' | 'video' | 'stop' | 'end';
export type BeadState = 'done' | 'current' | 'upcoming';

export interface BeadItem {
  kind: BeadKind;
  state: BeadState;
  /** satellite dot: the part carries more than one kind */
  more?: boolean;
  unitId: string;
}

/**
 * Images and maps placed at a part: app-authored from the PoC's cues (klappy/fia-functional-poc
 * @62a979f public/content/mark-1-1-13/cues.json `.resourcesAt`, image and map ids only), as the
 * nodded mock places them (README § Coded progress dots: "app-authored"). Lane B is asked for
 * unit-level ids (PRD § 8.7); until then only key terms and stops come from the pack. Videos and
 * Scripture placements are guesses in the mock and are not drawn here except Scripture cues the app
 * already detects (model.ts isScriptureCue, R-414).
 */
export const CUE_MEDIA: Readonly<Record<string, readonly string[]>> = {
  'S02-U005': ['a112', 'c197'],
  'S02-U008': ['a203', 'a204'],
  'S03-U007': ['c168'],
  'S03-U019': ['a112', 'a111'],
  'S03-U021': ['c201', 'c202'],
  'S05-U015': ['a111'],
};

const PRIORITY: BeadKind[] = ['video', 'media', 'scripture', 'term'];

/** Every kind a part carries, from the pack (terms), the PoC cues (media) and the Scripture cue. */
export function unitKinds(g: FlowGuide, u: GuideUnit): BeadKind[] {
  const kinds: BeadKind[] = [];
  if (CUE_MEDIA[u.id]?.length) kinds.push('media');
  if (isScriptureCue(u, g.title)) kinds.push('scripture');
  if (u.resources.some((r) => r.startsWith('term-'))) kinds.push('term');
  return kinds;
}

const topKind = (kinds: BeadKind[]): BeadKind => PRIORITY.find((k) => kinds.includes(k)) ?? 'plain';

export type Tail =
  | { kind: 'talk-here' }
  | { kind: 'talk-after'; n: number }
  | { kind: 'guide-ends'; n: number }
  | { kind: 'step-ends'; n: number };

export interface BandModel {
  stepIndex: number;
  steps: { title: string }[];
  stepTitle: string;
  /** 1-based part in this step, and the step's part count */
  n: number;
  m: number;
  /** fill of the current step segment, 0..1 */
  progress: number;
  beads: BeadItem[];
  /** capsules for the step's sections before and after this one */
  before: number;
  after: number;
  /** first and last part (1-based) of this section, and how it ends */
  from: number;
  to: number;
  tail: Tail;
}

export function bandModel(g: FlowGuide, unitId: string): BandModel {
  const p = position(g, unitId);
  const step = g.steps[p.stageIndex];
  const terminal = new Set(g.stops.filter((s) => s.kind === 'terminal').map((s) => s.afterUnitId));
  const sections: GuideUnit[][] = [];
  let cur: GuideUnit[] = [];
  for (const u of step.units) {
    cur.push(u);
    if (stopAt(g, u.id) || terminal.has(u.id)) {
      sections.push(cur);
      cur = [];
    }
  }
  if (cur.length) sections.push(cur);
  const si = Math.max(
    0,
    sections.findIndex((s) => s.some((u) => u.id === unitId)),
  );
  const sec = sections[si];
  const at = p.unitIndex;
  const stateOf = (u: GuideUnit): BeadState => {
    const i = step.units.indexOf(u);
    return i < at ? 'done' : i === at ? 'current' : 'upcoming';
  };
  const beads: BeadItem[] = [];
  for (const u of sec) {
    const kinds = unitKinds(g, u);
    const state = stateOf(u);
    beads.push({ kind: topKind(kinds), state, more: kinds.length > 1 || undefined, unitId: u.id });
    if (stopAt(g, u.id))
      beads.push({ kind: 'stop', state: state === 'upcoming' ? 'upcoming' : 'done', unitId: u.id });
    if (terminal.has(u.id)) beads.push({ kind: 'end', state: 'upcoming', unitId: u.id });
  }
  const first = step.units.indexOf(sec[0]) + 1;
  const lastUnit = sec[sec.length - 1];
  const last = step.units.indexOf(lastUnit) + 1;
  const tail: Tail = stopAt(g, lastUnit.id)
    ? lastUnit.id === unitId
      ? { kind: 'talk-here' }
      : { kind: 'talk-after', n: last }
    : terminal.has(lastUnit.id)
      ? { kind: 'guide-ends', n: last }
      : { kind: 'step-ends', n: step.units.length };
  return {
    stepIndex: p.stageIndex,
    steps: g.steps.map((s) => ({ title: s.title })),
    stepTitle: p.stageTitle,
    n: at + 1,
    m: p.unitCount,
    progress: (at + 1) / p.unitCount,
    beads,
    before: si,
    after: sections.length - 1 - si,
    from: first,
    to: last,
    tail,
  };
}
