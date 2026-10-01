import { describe, expect, it } from 'vitest';
import {
  offeredTiers,
  preferredTier,
  rememberTier,
  saveMinutes,
  saveRowState,
  tierMb,
  bestTier,
  effectiveTier,
  offlineManifestFromPack,
  publishedTiers,
  tierDownloadBytes,
  measuredMap,
  rowSize,
  type ContentPack,
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

describe('honest tiers (review rev17-1021)', () => {
  const f = (path: string, bytes: number) => ({
    path,
    bytes,
    sha256: 'a'.repeat(64),
    mime: 'application/json',
  });
  const textOnly: ContentPack = {
    packId: 'spa.MRK-1-1-13',
    tiers: { text: { bytes: 300, files: [f('/packs/spa.MRK-1-1-13/a.json', 300)] } },
  };
  it('publishes and sizes only what the pack carries', () => {
    expect(publishedTiers(textOnly)).toEqual(['text']);
    expect(tierDownloadBytes(textOnly, 'text')).toBe(300);
    expect(bestTier('phone', ['text'])).toBe('text');
    expect(bestTier('medium', ['text', 'phone'])).toBe('phone');
    expect(bestTier('phone', [])).toBeUndefined();
  });
  it('stamps the tier actually saved, not the one asked for', async () => {
    expect(effectiveTier(textOnly, 'phone')).toBe('text');
    const m = await offlineManifestFromPack(textOnly, 'phone', 'source-fallback');
    expect(m.tier).toBe('text');
  });
});

describe('S03 row size (review rev18)', () => {
  it('falls back to the best listed tier and marks estimates', () => {
    expect(rowSize({ text: 277189 }, 'phone', true)).toEqual({
      tier: 'text',
      mb: '0.3',
      exact: true,
    });
    expect(rowSize({ text: 48560 }, 'phone', false)?.exact).toBe(false);
    expect(rowSize(MRK, 'phone', undefined)).toEqual({ tier: 'phone', mb: '8.0', exact: false });
    expect(rowSize(MRK, 'phone', false, { tier: 'text', bytes: 277189 })).toEqual({
      tier: 'text',
      mb: '0.3',
      exact: true,
    });
    expect(rowSize(undefined, 'phone', true)).toBeUndefined();
  });
  it('reads measured flags from a per-language catalog file', () => {
    expect(
      measuredMap({
        entries: [
          { packId: 'spa.MRK-1-1-13', tierBytesAreEstimates: false },
          { packId: 'spa.LUK-1-1-4', tierBytesAreEstimates: true },
          { packId: 'spa.X' },
        ],
      }),
    ).toEqual({ 'spa.MRK-1-1-13': true, 'spa.LUK-1-1-4': false });
    expect(measuredMap({ counts: {} })).toEqual({});
  });
});
