// Pure queries over a joined guide: order, stages, stops, jump guard (R-401, R-405, R-410, R-412).
import type { FlowGuide, GuideStop, GuideUnit } from './types';

export const units = (g: FlowGuide): GuideUnit[] => g.steps.flatMap((s) => s.units);

export const indexOf = (g: FlowGuide, unitId: string): number =>
  units(g).findIndex((u) => u.id === unitId);

export const unitAt = (g: FlowGuide, i: number): GuideUnit | undefined => units(g)[i];

export const firstUnitId = (g: FlowGuide): string => units(g)[0]?.id ?? '';

export const isLast = (g: FlowGuide, unitId: string): boolean => {
  const all = units(g);
  return all.length > 0 && all[all.length - 1].id === unitId;
};

/** The stops that wait for people: discussion and activity (a terminal stop ends the guide). */
export const waitingStops = (g: FlowGuide): GuideStop[] =>
  g.stops.filter((s) => s.kind !== 'terminal');

export const stopAt = (g: FlowGuide, unitId: string): GuideStop | undefined =>
  waitingStops(g).find((s) => s.afterUnitId === unitId);

export interface Position {
  stageIndex: number;
  stepId: string;
  stageTitle: string;
  /** 0-based position of the unit inside its stage. */
  unitIndex: number;
  unitCount: number;
  moreAhead: boolean;
}

export function position(g: FlowGuide, unitId: string): Position {
  const stageIndex = Math.max(
    0,
    g.steps.findIndex((s) => s.units.some((u) => u.id === unitId)),
  );
  const step = g.steps[stageIndex];
  const unitIndex = Math.max(
    0,
    step.units.findIndex((u) => u.id === unitId),
  );
  return {
    stageIndex,
    stepId: step.id,
    stageTitle: step.title,
    unitIndex,
    unitCount: step.units.length,
    moreAhead: !isLast(g, unitId),
  };
}

/**
 * Stops a forward jump from `fromId` to `toId` would pass without discussion (R-412): a stop
 * on the source unit itself counts; a stop on the target does not (the jump lands on it).
 * Backward jumps pass nothing.
 */
export function stopsPassed(
  g: FlowGuide,
  fromId: string,
  toId: string,
  discussed: readonly string[],
): GuideStop[] {
  const from = indexOf(g, fromId);
  const to = indexOf(g, toId);
  if (from < 0 || to <= from) return [];
  return waitingStops(g).filter((s) => {
    const at = indexOf(g, s.afterUnitId);
    return at >= from && at < to && !discussed.includes(s.id);
  });
}

/** Stops behind the furthest visited unit that were never discussed (reported as skipped). */
export function skippedStops(
  g: FlowGuide,
  visited: readonly string[],
  discussed: readonly string[],
): GuideStop[] {
  const furthest = Math.max(-1, ...visited.map((v) => indexOf(g, v)));
  return waitingStops(g).filter(
    (s) => indexOf(g, s.afterUnitId) < furthest && !discussed.includes(s.id),
  );
}

/** Row title for the overview: the chunk's first line, trimmed (07: "titles from the first line"). */
export function unitTitle(u: GuideUnit, max = 72): string {
  const line = u.text.split(/\n/)[0].trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/**
 * Scripture cue (R-414): a unit that tells the group to read or listen to the passage itself.
 * Heuristic over the source text (the L1 pack carries no cue flag yet): a read/listen verb and
 * the passage title in the same unit.
 */
export function isScriptureCue(u: GuideUnit, passageTitle: string): boolean {
  return /\b(read|listen)\b/i.test(u.text) && !!passageTitle && u.text.includes(passageTitle);
}
