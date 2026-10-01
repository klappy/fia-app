import { useCallback, useEffect, useRef, useState } from 'react';
import { browserStore, loadSettings } from '../settings';
import { offline } from './client';
import type { PackStatus } from './engine';
import type { NarrationMode, Tier } from './manifest';
import { isQuotaError } from './storage';
import {
  offeredTiers,
  preferredTier,
  rememberTier,
  saveRowState,
  tierMb,
  type TierBytes,
} from './tiers';
import { useOffline } from './useOffline';

// State behind one S04 save row (04-passage-card.md); S04 shares it with its primary in the
// save-intent state. Save = C-07 SAVE via OfflineClient.save; nothing here claims "saved".

export const downlink = () =>
  (globalThis.navigator as (Navigator & { connection?: { downlink?: number } }) | undefined)
    ?.connection?.downlink;

export interface SaveController {
  tier: Tier;
  setTier: (tier: Tier) => void;
  /** `{mb}` for the chosen tier, undefined when the catalog has no size for it. */
  sizeMb?: string;
  rowState: ReturnType<typeof saveRowState>;
  canSave: boolean;
  save: () => Promise<PackStatus | null>;
  failed: string;
  tierFollows: boolean;
}

/** One save row's state; S04 shares it with its primary in the save-intent state. */
export function useSaveRow(
  packId: string | undefined,
  tierBytes: TierBytes | undefined,
  narration?: NarrationMode,
  onQuota?: () => void,
): SaveController {
  const s = useOffline();
  const offered = offeredTiers(tierBytes);
  const [tier, setTierState] = useState<Tier>(() => preferredTier(browserStore()));
  const [failed, setFailed] = useState('');
  const [tierFollows, setTierFollows] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // A preferred tier this passage has no size for falls back to the first sized tier (Text).
  const chosen: Tier = offered.includes(tier) ? tier : (offered[0] ?? 'text');
  const setTier = useCallback((next: Tier) => {
    setTierState(next);
    rememberTier(browserStore(), next);
    setTierFollows(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setTierFollows(false), 4000);
  }, []);
  const rowState = saveRowState(packId ?? '', s.packs, s.saving);
  const sizeMb = tierMb(tierBytes, chosen);
  const canSave = !!packId && !!sizeMb && s.online && !s.saving;
  const save = useCallback(async () => {
    if (!packId) return null;
    setFailed('');
    const mode = narration ?? loadSettings(browserStore()).settings.narrationMode;
    const done = await offline.save(packId, chosen, mode);
    const err = done ? (done.error ?? '') : offline.state.error || 'unavailable';
    if (err && err !== 'Save canceled.') {
      setFailed(err);
      if (isQuotaError(err)) onQuota?.();
    }
    return done;
  }, [packId, chosen, narration, onQuota]);
  return { tier: chosen, setTier, sizeMb, rowState, canSave, save, failed, tierFollows };
}
