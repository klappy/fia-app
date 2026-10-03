// F6-S02 Library: pure queries the glass screen draws (nodded mock design/alpha-v2-screens/02-library.html).
// Nothing here invents data: a book reads "AI voice" when one of its passages has AI narration (the
// shared rule, passageCard `voiceOf`), and the resume recap codes only the kinds the pack carries.
import { booksFor, entriesFor, type BookRow } from '../flow/catalog';
import { isScriptureCue, position, stopAt } from '../flow/model';
import type { CatalogEntry, CatalogManifest, FlowGuide, GuideUnit } from '../flow/types';
import { voiceOf } from './passageCard';

export interface LibraryBook extends BookRow {
  /** passages of this book saved on this phone (verified saves only, offline/useOnline savedPackIds) */
  saved: number;
  /** 'ai' when any passage has AI narration (passageCard `voiceOf`, shared with S04 and S05) */
  voice: 'ai' | 'none';
}

/** Book rows in canonical order, each with its saved count and voice line (PoC floor a1). */
export function libraryBooks(
  m: CatalogManifest,
  language: string,
  savedIds: ReadonlySet<string>,
): LibraryBook[] {
  const entries = entriesFor(m, language);
  return booksFor(m, language).map((b) => {
    const mine = entries.filter((e) => e.book === b.book);
    return {
      ...b,
      saved: mine.filter((e) => savedIds.has(e.packId)).length,
      voice: mine.some((e) => voiceOf(e) === 'ai') ? 'ai' : 'none',
    };
  });
}

/**
 * Passages whose reference matches the search ("Mark 1" → Mark 1:1–13, Mark 1:14–20, …). The title
 * is the reference, always (RULING 2026-10-02 ~13:16 ET). An empty query lists none.
 */
export function passageMatches(
  m: CatalogManifest,
  language: string,
  query: string,
  limit = 20,
): CatalogEntry[] {
  // Dashes compare as one: "Mark 1:1-13" typed with a hyphen finds "Mark 1:1–13".
  const dash = (x: string) => x.replace(/[\u2010-\u2015]/g, '-');
  const q = dash(query.trim());
  if (!q) return [];
  // A query ending in a number matches that number whole: "Mark 1" finds Mark 1:…, not Mark 10:….
  const re = new RegExp(
    q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (/\d$/.test(q) ? '(?!\\d)' : ''),
    'i',
  );
  return entriesFor(m, language)
    .filter((e) => re.test(dash(e.title)))
    .slice(0, limit);
}

/**
 * The first-visit primary's book (mock `?first=1`: "Open Mark"): a book with a saved passage, else
 * the last book opened, else the first content set's book (RULING 2026-10-01 20:41 ET: Mark), else
 * the first book.
 */
export function openBook(books: LibraryBook[], lastBook?: string): LibraryBook | undefined {
  return (
    books.find((b) => b.saved > 0) ??
    books.find((b) => b.book === lastBook) ??
    books.find((b) => b.book === 'MRK') ??
    books[0]
  );
}

// ---- the resume card's recap of the guide band (PRD § 8.3: "S02 recaps the band") ----

export type RecapKind = 'plain' | 'scripture' | 'term' | 'stop' | 'end';
export type RecapState = 'done' | 'current' | 'upcoming';

export interface RecapBead {
  kind: RecapKind;
  state: RecapState;
  /** the part carries more than one kind (satellite dot) */
  more?: boolean;
}

export type RecapTail =
  | { kind: 'talk-here' }
  | { kind: 'talk-after'; n: number }
  | { kind: 'guide-ends'; n: number }
  | { kind: 'step-ends'; n: number };

export interface Recap {
  stepIndex: number;
  steps: { title: string }[];
  stepTitle: string;
  /** 1-based part in this step and the step's part count */
  n: number;
  m: number;
  /** fill of the current step segment, 0..1 */
  progress: number;
  beads: RecapBead[];
  /** capsules for the step's sections before and after this one */
  before: number;
  after: number;
  tail: RecapTail;
}

/**
 * Kinds a part carries from the pack today: key terms (`units[].resources` term ids) and the
 * Scripture cue (model.ts isScriptureCue, R-414). Images, maps and videos have no unit-level ids
 * yet (PRD § 8.7, asked of lane B), so no media bead is drawn here.
 */
function kindsOf(g: FlowGuide, u: GuideUnit): RecapKind[] {
  const out: RecapKind[] = [];
  if (isScriptureCue(u, g.title)) out.push('scripture');
  if (u.resources.some((r) => r.startsWith('term-'))) out.push('term');
  return out;
}

/** Overall (one segment per step) and scoped (coded beads for this section between two talks). */
export function resumeRecap(g: FlowGuide, unitId: string): Recap {
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
  const beads: RecapBead[] = [];
  for (const u of sec) {
    const i = step.units.indexOf(u);
    const state: RecapState = i < at ? 'done' : i === at ? 'current' : 'upcoming';
    const kinds = kindsOf(g, u);
    beads.push({
      kind: kinds[0] ?? 'plain',
      state,
      ...(kinds.length > 1 ? { more: true } : {}),
    });
    if (stopAt(g, u.id))
      beads.push({ kind: 'stop', state: state === 'upcoming' ? 'upcoming' : 'done' });
    if (terminal.has(u.id)) beads.push({ kind: 'end', state: 'upcoming' });
  }
  const last = sec[sec.length - 1];
  const lastN = step.units.indexOf(last) + 1;
  const tail: RecapTail = stopAt(g, last.id)
    ? last.id === unitId
      ? { kind: 'talk-here' }
      : { kind: 'talk-after', n: lastN }
    : terminal.has(last.id)
      ? { kind: 'guide-ends', n: lastN }
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
    tail,
  };
}
