// S03 / S04 save row (R-306, R-307, R-309): pure helpers over the C-03 catalog `tierBytes` and the
// C-07 pack status. Sizes shown before a save come from the build-time catalog manifest (R-302:
// "sizes per tier"); the saved size shown after a save is what the worker verified (STATUS bytes).
import { loadSettings, saveSettings, type KeyValueStore } from '../settings';
import type { PackStatus } from './engine';
import { TIERS, type Tier } from './manifest';
import { mb } from './storage';

export interface TierBytes {
  text: number;
  phone?: number;
  medium?: number;
  original?: number;
}

/** Projected bytes for one tier; a tier the catalog does not list has no size (never invented). */
export const tierBytesOf = (tb: TierBytes | undefined, tier: Tier): number | undefined =>
  tb?.[tier];

/** Tiers the catalog sizes for this entry, in order; the Text tier is mandatory (C-02). */
export const offeredTiers = (tb: TierBytes | undefined): Tier[] =>
  TIERS.filter((t) => tierBytesOf(tb, t) !== undefined);

/** One-decimal MB string for a tier, or undefined. */
export const tierMb = (tb: TierBytes | undefined, tier: Tier): string | undefined => {
  const b = tierBytesOf(tb, tier);
  return b === undefined ? undefined : mb(b);
};

/** Settings `mediaTier` (C-10), default Phone (M1, spec 04 Q04-a). */
export function preferredTier(store: KeyValueStore | null): Tier {
  return loadSettings(store).settings.mediaTier;
}

/** "Sizes on other passages follow this choice" (spec 04 `tier-follows`): persist the pick. */
export function rememberTier(store: KeyValueStore | null, tier: Tier): boolean {
  const { settings } = loadSettings(store);
  if (settings.mediaTier === tier) return true;
  return saveSettings(store, { ...settings, mediaTier: tier }).ok;
}

/**
 * `tier-time`: minutes to download `bytes` on this connection class. Uses
 * `navigator.connection.downlink` (Mbit/s) where the browser reports it; else 1 Mbit/s, a
 * deliberately slow guess so the estimate errs long.
 */
export function saveMinutes(bytes: number, downlinkMbps?: number): number {
  const rate = downlinkMbps && downlinkMbps > 0 ? downlinkMbps : 1;
  return Math.max(1, Math.ceil((bytes * 8) / (rate * 1_000_000) / 60));
}

export type SaveRowState = 'none' | 'saving' | 'partial' | 'saved' | 'corrupt';

/** What the S04 save row / S03 trailing mark shows for one pack (verified states only, R-309). */
export function saveRowState(
  packId: string,
  packs: PackStatus[],
  saving: string | null,
): { state: SaveRowState; pack?: PackStatus } {
  if (saving === packId) return { state: 'saving' };
  const pack = packs.find((p) => p.packId === packId);
  if (!pack) return { state: 'none' };
  if (pack.state === 'saved' || pack.state === 'update-available') return { state: 'saved', pack };
  if (pack.state === 'partial') return { state: 'partial', pack };
  if (pack.state === 'corrupt') return { state: 'corrupt', pack };
  return { state: 'none', pack };
}

/**
 * S03 row size (R-307). The tier shown is the preferred one when the catalog lists it, else the
 * best listed tier below it (Text). `exact` only when the per-language file marks the entry
 * measured (`tierBytesAreEstimates: false`, pack-manifest bytes); no flag = estimate, so older
 * catalogs never present a projection as exact. A verified save wins over both.
 */
export function rowSize(
  tb: TierBytes | undefined,
  pref: Tier,
  measured: boolean | undefined,
  saved?: Pick<PackStatus, 'tier' | 'bytes'>,
): { tier: Tier; mb: string; exact: boolean } | undefined {
  if (saved) return { tier: saved.tier ?? 'text', mb: mb(saved.bytes), exact: true };
  const offered = offeredTiers(tb);
  const below = TIERS.slice(0, TIERS.indexOf(pref) + 1).filter((x) => offered.includes(x));
  const tier = below[below.length - 1] ?? offered[0];
  if (!tier) return undefined;
  return { tier, mb: mb(tb![tier]), exact: measured === true };
}

/** packId → measured? from a per-language catalog file (`entries[].tierBytesAreEstimates`). */
export function measuredMap(doc: unknown): Record<string, boolean> {
  const entries = (doc as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) return {};
  const out: Record<string, boolean> = {};
  for (const e of entries as { packId?: unknown; tierBytesAreEstimates?: unknown }[])
    if (typeof e?.packId === 'string' && typeof e.tierBytesAreEstimates === 'boolean')
      out[e.packId] = !e.tierBytesAreEstimates;
  return out;
}
