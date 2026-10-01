import { describe, expect, it } from 'vitest';
import {
  offeredTiers,
  preferredTier,
  rememberTier,
  saveMinutes,
  saveRowState,
  tierMb,
  type PackStatus,
} from '../src/offline';
import { memoryStore } from '../src/settings';
import { t } from '../src/i18n';

// S04 save row helpers (R-306 tiers, R-307 size before download, R-309 verified state only).
const MRK = { text: 77640, phone: 7989640, medium: 19717640, original: 60771464 };
const st = (p: Partial<PackStatus>): PackStatus => ({
  done: true,
  state: 'none',
  saved: false,
  updateAvailable: false,
  corrupt: false,
  ...p,
});

describe('save row tiers', () => {
  it('offers the four C-07 tiers in order with catalog sizes (R-306)', () => {
    expect(offeredTiers(MRK)).toEqual(['text', 'phone', 'medium', 'original']);
    expect(tierMb(MRK, 'text')).toBe('0.1');
    expect(tierMb(MRK, 'phone')).toBe('8.0');
    expect(tierMb(MRK, 'medium')).toBe('20');
    expect(tierMb(MRK, 'original')).toBe('61');
  });
  it('never invents a size the catalog does not carry', () => {
    expect(offeredTiers({ text: 1000 })).toEqual(['text']);
    expect(tierMb({ text: 1000 }, 'phone')).toBeUndefined();
    expect(offeredTiers(undefined)).toEqual([]);
  });
  it('defaults to Phone (M1) and remembers a pick in C-10 settings', () => {
    const store = memoryStore();
    expect(preferredTier(store)).toBe('phone');
    expect(rememberTier(store, 'medium')).toBe(true);
    expect(preferredTier(store)).toBe('medium');
    expect(preferredTier(null)).toBe('phone');
  });
  it('estimates minutes from the connection, erring long', () => {
    expect(saveMinutes(7_989_640, 10)).toBe(1);
    expect(saveMinutes(60_771_464)).toBe(9); // 1 Mbit/s fallback
    expect(saveMinutes(0)).toBe(1);
  });
  it('reads saved only from a verified STATUS (R-309)', () => {
    const id = 'spa.MRK-1-1-13';
    expect(saveRowState(id, [], null).state).toBe('none');
    expect(saveRowState(id, [], id).state).toBe('saving');
    expect(saveRowState(id, [st({ packId: id, state: 'partial' })], null).state).toBe('partial');
    expect(saveRowState(id, [st({ packId: id, state: 'saved' })], null).state).toBe('saved');
    expect(saveRowState(id, [st({ packId: id, state: 'update-available' })], null).state).toBe(
      'saved',
    );
    expect(saveRowState(id, [st({ packId: id, state: 'corrupt' })], null).state).toBe('corrupt');
  });
  it('labels the save control with tier and size from the string catalog', () => {
    expect(t('s.passage.save-row', { tier: t('s.passage.tier.phone'), mb: '8.0' })).toBe(
      'Save Phone (8.0 MB)',
    );
    expect(t('s.pericopes.size', { tier: t('s.passage.tier.phone'), mb: '8.0' })).toBe(
      'Phone 8.0 MB',
    );
  });
});
