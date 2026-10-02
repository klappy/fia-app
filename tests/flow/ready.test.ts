import { describe, expect, it } from 'vitest';
import {
  booksWithReady,
  createReadyStore,
  isNotYet,
  PACK_INDEX_URL,
  readPackIndex,
  readyFirst,
} from '../../src/flow/ready';
import { READY_INDEX } from '../../src/offline/ship-data-plugin';
import type { CatalogEntry } from '../../src/flow/types';

// GAP-NOPACK: the catalog lists every guide; only packs in the build's index open.
const entry = (packId: string): CatalogEntry =>
  ({ packId, book: packId.split('.')[1].split('-')[0] }) as CatalogEntry;

describe('pack index (GAP-NOPACK)', () => {
  it('is read beside the catalog, where the build writes it — never under /data/packs', () => {
    expect(PACK_INDEX_URL).toBe('/data/catalog/ready.json');
    expect(PACK_INDEX_URL).toBe(`/${READY_INDEX}`);
  });

  it('reads { packs: [...] } and refuses anything else', () => {
    expect([...readPackIndex({ packs: ['eng.MRK-1-1-13'] })!]).toEqual(['eng.MRK-1-1-13']);
    expect(readPackIndex({ packs: [1] })).toBeNull();
    expect(readPackIndex(null)).toBeNull();
    expect(readPackIndex('<!doctype html>')).toBeNull();
  });

  it('marks a pack not yet only when the index is known and lacks it', () => {
    const ready = new Set(['eng.MRK-1-1-13']);
    expect(isNotYet(ready, 'eng.MRK-1-14-20')).toBe(true);
    expect(isNotYet(ready, 'eng.MRK-1-1-13')).toBe(false);
    expect(isNotYet(undefined, 'eng.MRK-1-14-20')).toBe(false); // loading
    expect(isNotYet(null, 'eng.MRK-1-14-20')).toBe(false); // unknown
    expect(isNotYet(ready, undefined)).toBe(false);
  });

  it('puts ready rows first and keeps each group in its order', () => {
    const rows = ['GEN', 'EXO', 'MRK', 'LUK', 'JHN'];
    const ok = new Set(['MRK', 'JHN']);
    expect(readyFirst(rows, (r) => ok.has(r))).toEqual(['MRK', 'JHN', 'GEN', 'EXO', 'LUK']);
    expect(readyFirst(rows, () => true)).toEqual(rows);
  });

  it('lists the books that have a passage that opens', () => {
    const entries = ['eng.GEN-1-1-2-3', 'eng.MRK-1-1-13', 'eng.MRK-1-14-20'].map(entry);
    expect([...booksWithReady(entries, new Set(['eng.MRK-1-1-13']))!]).toEqual(['MRK']);
    expect(booksWithReady(entries, undefined)).toBeNull();
    expect(booksWithReady(entries, null)).toBeNull();
  });

  it('loads the index once; a missing or HTML answer leaves it unknown and is tried again', async () => {
    const answers = [
      new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }),
      new Response(JSON.stringify({ packs: ['arb.GEN-1-1-2-3'] })),
    ];
    let calls = 0;
    const store = createReadyStore('/data/catalog/ready.json', async (url) => {
      expect(url).toBe('/data/catalog/ready.json');
      calls++;
      return answers.shift()!;
    });
    expect(store.get()).toBeUndefined();
    await store.load();
    expect(store.get()).toBeNull();
    await store.load();
    expect([...store.get()!]).toEqual(['arb.GEN-1-1-2-3']);
    await store.load();
    expect(calls).toBe(2);
  });

  it('a failed request leaves the index unknown, never throws', async () => {
    const store = createReadyStore('/x', async () => new Response('', { status: 404 }));
    await store.load();
    expect(store.get()).toBeNull();
    const offline = createReadyStore('/x', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(offline.load()).resolves.toBeUndefined();
    expect(offline.get()).toBeNull();
  });
});
