// Which passages this build can open (GAP-NOPACK). The C-03 catalog lists every guide the sources
// hold (~1,500 in English), but only the passages with a built pack open. The build writes
// `data/catalog/ready.json` beside the catalog — the pack ids it ships (ship-data-plugin
// READY_INDEX; the packs themselves live only at their C-02 path, `/packs/<id>/`) — and a passage
// outside it is shown as the set's absent mark, "not yet in {language}" (R-305; absent-badge.md),
// never as an error. While the index loads, or when it cannot be read (dev server, older deploy),
// nothing is marked and the screens behave as before.
import { useEffect, useSyncExternalStore } from 'react';
import { languageName } from '../media/lang';
import { useFlow } from './session';
import type { CatalogEntry } from './types';

/** The pack ids this build ships; undefined while loading, null when unknown. */
export type Ready = ReadonlySet<string> | null | undefined;

const DATA_BASE =
  (import.meta.env?.VITE_FIA_DATA_BASE as string | undefined) ??
  `${import.meta.env?.BASE_URL ?? '/'}data`;

export const PACK_INDEX_URL = `${DATA_BASE.replace(/\/$/, '')}/catalog/ready.json`;

/** `{ packs: string[] }` → the set; anything else (an HTML fallback page, a bad shape) → null. */
export function readPackIndex(doc: unknown): ReadonlySet<string> | null {
  const packs = (doc as { packs?: unknown } | null)?.packs;
  if (!Array.isArray(packs) || !packs.every((p) => typeof p === 'string')) return null;
  return new Set(packs);
}

/** True only when the index is known and does not list the pack. */
export const isNotYet = (ready: Ready, packId: string | undefined): boolean =>
  !!ready && !!packId && !ready.has(packId);

/** Ready rows first, each group in its given (canonical) order. */
export function readyFirst<T>(rows: readonly T[], isReady: (row: T) => boolean): T[] {
  return [...rows.filter(isReady), ...rows.filter((r) => !isReady(r))];
}

/** Books with at least one passage that opens; null when the index is not known. */
export function booksWithReady(
  entries: readonly CatalogEntry[],
  ready: Ready,
): ReadonlySet<string> | null {
  if (!ready) return null;
  return new Set(entries.filter((e) => ready.has(e.packId)).map((e) => e.book));
}

export function createReadyStore(
  url: string = PACK_INDEX_URL,
  get: (url: string) => Promise<Response> = (u) => fetch(u),
) {
  let ready: Ready;
  let loading = false;
  const subs = new Set<() => void>();
  const set = (next: Ready) => {
    ready = next;
    subs.forEach((f) => f());
  };
  return {
    get: () => ready,
    subscribe(f: () => void) {
      subs.add(f);
      return () => void subs.delete(f);
    },
    /** Loads once; an unreadable index (null) is tried again on the next call. */
    async load() {
      if (loading || ready) return;
      loading = true;
      try {
        const res = await get(url);
        set(res.ok ? readPackIndex(await res.json()) : null);
      } catch {
        set(null);
      } finally {
        loading = false;
      }
    },
  };
}

let app: ReturnType<typeof createReadyStore> | undefined;
const store = () => (app ??= createReadyStore());

/** The pack ids this build ships (see top of file). */
export function useReadyPacks(): Ready {
  const s = store();
  useEffect(() => void s.load(), [s]);
  return useSyncExternalStore(s.subscribe, s.get, s.get);
}

/**
 * For the guide family's gate (S04–S07, S18): the selected passage's language name when this build
 * has no pack for it; null when it has one or the index is unknown; undefined while the index loads.
 */
export function useNotYet(): string | null | undefined {
  const ready = useReadyPacks();
  const { packId } = useFlow();
  if (ready === undefined) return undefined;
  return isNotYet(ready, packId) ? languageName(packId!.split('.')[0]) : null;
}
