// F6-S18 Completion: pure queries the glass screen draws (nodded mock design/alpha-v2-screens/18-completion.html).
// Nothing here invents data. Counts come from the joined guide (C-04 steps, units, stops) and the
// person's own record (C-09 visited, C-11 discussed); played and discussed never collapse into one
// number (R-410). A kind the pack does not place at a part (images, maps and videos: PRD § 8.7, asked
// of lane B) is not counted here, so the screen draws no line for it.
import { pericopesFor } from '../flow/catalog';
import { isScriptureCue, units, waitingStops } from '../flow/model';
import type { CatalogEntry, CatalogManifest, FlowGuide, GuideUnit } from '../flow/types';

/** Kit bead kinds the recap can name (StageRail.jsx BEAD_KINDS). */
export type RecapKind = 'term' | 'media' | 'video' | 'scripture' | 'stop';

export interface KindLine {
  kind: Exclude<RecapKind, 'stop'>;
  /** parts the group went through that carry this kind */
  parts: number;
}

export interface CompletionSummary {
  /** every step, and whether the group reached it (any part visited) */
  steps: { id: string; title: string; reached: boolean }[];
  stepsReached: number;
  /** every part of the guide, and the parts the group went through */
  total: number;
  visited: number;
  /** one line per kind the pack places at a part, in the mock's order; zero-count kinds are left out */
  kinds: KindLine[];
  /** talks that wait for people (discussion and activity stops) and the ones the group talked at */
  talks: number;
  discussed: number;
  /** talks behind the furthest part reached that were never discussed (as model.ts skippedStops) */
  skipped: number;
}

/**
 * Kinds a part carries in the pack today: key terms (`units[].resources` term ids) and the Scripture
 * cue the app already detects (model.ts isScriptureCue, R-414). Images, maps and videos have no
 * part-level ids yet (PRD § 8.7), so they are never guessed here.
 */
export function partKinds(g: FlowGuide, u: GuideUnit): KindLine['kind'][] {
  const out: KindLine['kind'][] = [];
  if (u.resources.some((r) => r.startsWith('term-'))) out.push('term');
  if (isScriptureCue(u, g.title)) out.push('scripture');
  return out;
}

/** The mock's order: key terms · images and maps · videos · the passage read (talks come last). */
const ORDER: KindLine['kind'][] = ['term', 'media', 'video', 'scripture'];

export function completionSummary(
  g: FlowGuide,
  s: { visited: readonly string[]; discussed: readonly string[] },
): CompletionSummary {
  const all = units(g);
  const seen = new Set(s.visited);
  const went = all.filter((u) => seen.has(u.id));
  const count = new Map<KindLine['kind'], number>();
  for (const u of went) for (const k of partKinds(g, u)) count.set(k, (count.get(k) ?? 0) + 1);
  const talks = waitingStops(g);
  const at = (id: string) => all.findIndex((u) => u.id === id);
  const furthest = Math.max(-1, ...went.map((u) => at(u.id)));
  const steps = g.steps.map((st) => ({
    id: st.id,
    title: st.title,
    reached: st.units.some((u) => seen.has(u.id)),
  }));
  return {
    steps,
    stepsReached: steps.filter((st) => st.reached).length,
    total: all.length,
    visited: went.length,
    kinds: ORDER.filter((k) => (count.get(k) ?? 0) > 0).map((k) => ({
      kind: k,
      parts: count.get(k)!,
    })),
    talks: talks.length,
    discussed: talks.filter((x) => s.discussed.includes(x.id)).length,
    skipped: talks.filter((x) => at(x.afterUnitId) < furthest && !s.discussed.includes(x.id))
      .length,
  };
}

/**
 * The passage after this one in the same book, in the order S03 lists them (catalog.ts pericopesFor:
 * chapter, then verse). Undefined when this is the book's last passage or the catalog does not list it.
 */
export function nextPassage(
  m: CatalogManifest,
  language: string,
  packId: string,
): CatalogEntry | undefined {
  const here = m.entries.find((e) => e.packId === packId && e.language === language);
  if (!here) return undefined;
  const list = pericopesFor(m, language, here.book);
  const i = list.findIndex((e) => e.packId === packId);
  return i >= 0 ? list[i + 1] : undefined;
}

/** "Mark 1:14–20" never breaks at the dash (mock 18-completion.html NEXT, _frame.js:83). */
export const keepRef = (s: string) => s.replace(/–/g, '⁠–⁠');
