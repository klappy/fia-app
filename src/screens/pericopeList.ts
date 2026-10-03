// F6-S03 pericope list: pure facts for each row and for the select-mode summary (no React here).
// Sources, never invented (R-307, R-309): the parts count is the per-language catalog's
// `guide.unitsEstimate` (shown "≈"), or the guide's own walked count when that guide is loaded;
// the size is the Text tier a save downloads (C-03 `tierBytes.text`), "≈" unless the catalog marks
// it measured, and a verified save's own bytes once the passage is saved.
import type { CatalogEntry, FlowGuide } from '../flow/types';
import { t } from '../i18n';
import type { PackStatus } from '../offline/engine';
import { mb } from '../offline/storage';
import { rowSize } from '../offline/tiers';
import { keepRef } from '../frame/text';

/** packId → what the per-language catalog file (`data/catalog/<lang>.json`) says about it. */
export interface ListFacts {
  /** `guide.unitsEstimate` */
  units?: number;
  /** `tierBytesAreEstimates === false` */
  measured?: boolean;
}

export function listFacts(doc: unknown): Record<string, ListFacts> {
  const entries = (doc as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) return {};
  const out: Record<string, ListFacts> = {};
  for (const e of entries as {
    packId?: unknown;
    tierBytesAreEstimates?: unknown;
    guide?: { unitsEstimate?: unknown };
  }[]) {
    if (typeof e?.packId !== 'string') continue;
    const units = e.guide?.unitsEstimate;
    out[e.packId] = {
      units: typeof units === 'number' && units > 0 ? units : undefined,
      measured: typeof e.tierBytesAreEstimates === 'boolean' ? !e.tierBytesAreEstimates : undefined,
    };
  }
  return out;
}

export interface Amount {
  n: number;
  exact: boolean;
}

export interface RowFacts {
  parts?: Amount;
  bytes?: Amount;
}

/** Parts walked in a loaded guide: hidden example parts are not walked (F5; pl-fgate-08 open). */
const walked = (g: FlowGuide) =>
  g.steps.reduce((n, s) => n + s.units.filter((u) => !u.hidden).length, 0);

export function rowFacts(
  entry: Pick<CatalogEntry, 'packId' | 'tierBytes'>,
  facts: ListFacts | undefined,
  guide: FlowGuide | undefined,
  saved: Pick<PackStatus, 'tier' | 'bytes'> | undefined,
): RowFacts {
  const parts: Amount | undefined =
    guide && guide.packId === entry.packId
      ? { n: walked(guide), exact: true }
      : facts?.units
        ? { n: facts.units, exact: false }
        : undefined;
  // Text tier: what "Save for offline" on this list downloads (the summary's "Text only").
  const sz = rowSize(entry.tierBytes, 'text', facts?.measured, saved);
  const bytes = saved?.bytes
    ? { n: saved.bytes, exact: true }
    : sz && entry.tierBytes?.text !== undefined
      ? { n: entry.tierBytes.text, exact: sz.exact }
      : undefined;
  return { parts, bytes };
}

const about = (s: string, exact: boolean) => (exact ? s : t('s.pericopes.about', { v: s }));

/** "28 KB" under 1 MB, else "1.2 MB" (decimal, as `mb()`); "≈" when it is an estimate. */
export function sizeWords(a: Amount): string {
  const s =
    a.n < 1_000_000
      ? t('s.pericopes.kb', { n: Math.max(1, Math.round(a.n / 1000)) })
      : t('s.pericopes.mb', { n: mb(a.n) });
  return about(s, a.exact);
}

export const partsWords = (a: Amount) => about(t('s.pericopes.parts', { n: a.n }), a.exact);

/** Each half stays whole; a long meta wraps only at its " · " (mock Size, `.s03-tail`). */
const whole = (s: string) => s.replace(/ /g, '\u00a0');

/** "≈78 parts · ≈219 KB" (mock Size); either half alone when the other is unknown. */
export function metaWords(f: RowFacts): string | undefined {
  const parts = f.parts && whole(partsWords(f.parts));
  const size = f.bytes && whole(sizeWords(f.bytes));
  // the separator stays with the parts, so a wrapped size starts its own line
  if (parts && size) return t('s.pericopes.meta', { parts, size }).replace(' · ', '\u00a0· ');
  return parts ?? size;
}

/** Sum of the chosen rows' Text sizes; exact only when every one is. */
export function selectionBytes(rows: RowFacts[]): Amount | undefined {
  const known = rows.filter((r) => r.bytes);
  if (!known.length) return undefined;
  return {
    n: known.reduce((s, r) => s + r.bytes!.n, 0),
    exact: known.length === rows.length && known.every((r) => r.bytes!.exact),
  };
}

/** Free space on the phone (device estimate): "11.2 GB" / "640 MB". */
export function freeWords(bytes: number): string {
  return bytes >= 1_000_000_000
    ? t('s.pericopes.gb', { n: (bytes / 1_000_000_000).toFixed(1) })
    : t('s.pericopes.mb', { n: mb(bytes) });
}

/** "Mark 1:1–13" never breaks at the dash (mock `nb`). */
export { keepRef };
