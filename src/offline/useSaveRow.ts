import { useCallback, useEffect, useRef, useState } from 'react';
import { browserStore, loadSettings } from '../settings';
import { offline } from './client';
import type { PackStatus } from './engine';
import {
  publishedTiers,
  tierDownloadBytes,
  TIERS,
  type ContentPack,
  type NarrationMode,
  type Tier,
} from './manifest';
import { isQuotaError, mb } from './storage';
import { preferredTier, rememberTier, saveRowState } from './tiers';
import { useOffline } from './useOffline';

// State behind one S04 save row (04-passage-card.md); S04 shares it with its primary in the
// save-intent state. Sizes are the bytes a save downloads: read from the pack's own C-02
// manifest (`tiers.<tier>.files`, cumulative), the same file the worker saves from. A tier the
// pack does not publish is shown as not available yet, never offered (R-307, R-309 honesty).
// Save = C-07 SAVE via OfflineClient.save; nothing here claims "saved".

export const downlink = () =>
  (globalThis.navigator as (Navigator & { connection?: { downlink?: number } }) | undefined)
    ?.connection?.downlink;

export interface SaveController {
  tier: Tier;
  setTier: (tier: Tier) => void;
  /** Tiers this pack publishes (selectable). Empty while the pack manifest loads or is missing. */
  available: Tier[];
  /** Download bytes per published tier. */
  bytes: Partial<Record<Tier, number>>;
  /** `{mb}` for the chosen tier, undefined when the pack does not publish it. */
  sizeMb?: string;
  rowState: ReturnType<typeof saveRowState>;
  canSave: boolean;
  /** Save at the chosen tier, or at `tier` (Resume / Re-save keep the tier they started at). */
  save: (tier?: Tier) => Promise<PackStatus | null>;
  failed: string;
  tierFollows: boolean;
}

/** Best published tier for a preference: the preference, else the highest below it, else Text. */
export function bestTier(pref: Tier, available: Tier[]): Tier | undefined {
  if (available.includes(pref)) return pref;
  const below = TIERS.slice(0, TIERS.indexOf(pref)).filter((t) => available.includes(t));
  return below[below.length - 1] ?? available[0];
}

async function packSizes(packId: string): Promise<Partial<Record<Tier, number>>> {
  const res = await fetch(`/packs/${packId}/manifest.json`);
  if (!res.ok) return {};
  const pack = (await res.json()) as ContentPack;
  if (pack?.packId !== packId || !pack.tiers) return {};
  return Object.fromEntries(publishedTiers(pack).map((t) => [t, tierDownloadBytes(pack, t)]));
}

/** One save row's state; S04 shares it with its primary in the save-intent state. */
export function useSaveRow(
  packId: string | undefined,
  narration?: NarrationMode,
  onQuota?: () => void,
): SaveController {
  const s = useOffline();
  const [sized, setSized] = useState<{ packId?: string; bytes: Partial<Record<Tier, number>> }>({
    bytes: {},
  });
  useEffect(() => {
    if (!packId) return;
    let live = true;
    packSizes(packId)
      .catch(() => ({}))
      .then((bytes) => live && setSized({ packId, bytes }));
    return () => {
      live = false;
    };
  }, [packId]);
  const bytes = sized.packId === packId ? sized.bytes : {};
  const available = TIERS.filter((t) => bytes[t] !== undefined);
  const [tier, setTierState] = useState<Tier>(() => preferredTier(browserStore()));
  const [failed, setFailed] = useState('');
  const [tierFollows, setTierFollows] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const chosen: Tier = bestTier(tier, available) ?? tier;
  const setTier = useCallback((next: Tier) => {
    setTierState(next);
    rememberTier(browserStore(), next);
    setTierFollows(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setTierFollows(false), 4000);
  }, []);
  const rowState = saveRowState(packId ?? '', s.packs, s.saving);
  const sizeMb = bytes[chosen] !== undefined ? mb(bytes[chosen]) : undefined;
  const canSave = !!packId && !!sizeMb && s.online && !s.saving;
  const save = useCallback(
    async (at?: Tier) => {
      // One save at a time: a tap while another runs is not a failure (no error band).
      if (!packId || offline.state.saving) return null;
      setFailed('');
      const mode = narration ?? loadSettings(browserStore()).settings.narrationMode;
      const done = await offline.save(packId, at ?? chosen, mode);
      const err = done ? (done.error ?? '') : offline.state.error || 'unavailable';
      if (err && err !== 'Save canceled.') {
        setFailed(err);
        if (isQuotaError(err)) onQuota?.();
      }
      return done;
    },
    [packId, chosen, narration, onQuota],
  );
  return {
    tier: chosen,
    setTier,
    available,
    bytes,
    sizeMb,
    rowState,
    canSave,
    save,
    failed,
    tierFollows,
  };
}
