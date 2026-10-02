import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CHIP_KEYS,
  chipState,
  deviceLanguage,
  pickerLanguages,
  readCounts,
  rowName,
  suggestedLanguages,
} from '../src/components/languageRows';
import type { CatalogManifest, LanguageCounts } from '../src/settings/coverage';

// F6-S01: the picker rows read from the C-03 catalog (BL2) and S19's coverage statuses, in the mock's
// chips (01-first-run-language.html: Scripture · Guide · Key terms · Maps; COVERAGE.md states).
const read = (f: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/l5/${f}`, import.meta.url), 'utf8'));
const manifest = read('catalog-manifest.json') as CatalogManifest;
const counts = read('language-counts.json') as Record<string, LanguageCounts>;
const codes = manifest.languages.map((l) => l.code);

describe('S01 picker rows', () => {
  it('chip states: available, AI-filled key-term text, none; Scripture is never AI', () => {
    expect(chipState('terms', 'english-only')).toBe('i');
    expect(chipState('scripture', 'english-only')).toBe('n');
    expect(chipState('maps', 'english-only')).toBe('n');
    expect(chipState('guide', 'available')).toBe('a');
    expect(chipState('maps', 'absent')).toBe('n');
    // counts unread: only what the catalog itself tells
    expect(chipState('scripture', 'listed')).toBe('a');
    expect(chipState('terms', 'listed')).toBeNull();
    for (const s of ['available', 'english-only', 'listed', 'absent'] as const)
      expect(chipState('scripture', s)).not.toBe('i');
  });

  it('rows come from the catalog, in its order, with its autonyms and the four chips', () => {
    const rows = pickerLanguages(manifest, counts);
    expect(rows.map((r) => r.code)).toEqual(codes);
    expect(rows.map((r) => r.autonym)).toEqual(manifest.languages.map((l) => l.autonym));
    const by = Object.fromEntries(rows.map((r) => [r.code, r]));
    expect(by.spa).toMatchObject({ english: 'Spanish', dir: 'ltr' });
    expect(by.arb.dir).toBe('rtl');
    expect(by.spa.chips.join('')).toBe('aaan'); // maps: English only → none in Español
    expect(by.hau.chips.join('')).toBe('nain'); // no Scripture; key-term text is an AI slot
    expect(by.eng.chips.join('')).toBe('aaan'); // no passage here carries a map
    expect(by.arb.chips.join('')).toBe('nnnn'); // no passage in this slice: nothing claimed
  });

  it('without the per-language counts a row shows only Scripture and Guide', () => {
    const by = Object.fromEntries(pickerLanguages(manifest).map((r) => [r.code, r.chips.join('')]));
    expect(by).toMatchObject({ spa: 'aa', hau: 'na', eng: 'aa' });
  });

  it('every shipped catalog language gets a row; Scripture is never an AI chip', () => {
    const real = JSON.parse(
      readFileSync(new URL('../data/catalog/manifest.json', import.meta.url), 'utf8'),
    ) as CatalogManifest;
    const realCounts = Object.fromEntries(
      real.languages.map((l) => [
        l.code,
        JSON.parse(readFileSync(new URL(`../data/catalog/${l.code}.json`, import.meta.url), 'utf8'))
          .counts as LanguageCounts,
      ]),
    );
    const rows = pickerLanguages(real, realCounts);
    expect(rows).toHaveLength(real.languages.length);
    for (const r of rows) {
      expect(r.autonym).toBe(real.languages.find((l) => l.code === r.code)?.autonym);
      expect(r.chips).toHaveLength(CHIP_KEYS.length);
      expect(r.chips[0]).not.toBe('i');
    }
  });

  it('a row is named with each chip and its state', () => {
    const hau = pickerLanguages(manifest, counts).find((r) => r.code === 'hau')!;
    expect(rowName(hau)).toBe(
      'Hausa, Hausa. Scripture not yet, Guide available, Key terms AI-filled, Maps not yet.',
    );
  });

  it("the phone's language maps to an Aquifer code the catalog has", () => {
    const all = ['eng', 'spa', 'fra', 'zhs', 'zht', 'arb'];
    expect(deviceLanguage(all, ['es-ES', 'en'])).toBe('spa');
    expect(deviceLanguage(all, ['zh-TW'])).toBe('zht');
    expect(deviceLanguage(all, ['zh-CN'])).toBe('zhs');
    expect(deviceLanguage(all, ['zh-Hant-HK'])).toBe('zht');
    expect(deviceLanguage(all, ['de-DE', 'fr-CA'])).toBe('fra');
    expect(deviceLanguage(all, ['ar-EG'])).toBe('arb');
    expect(deviceLanguage(['eng'], ['es-ES'])).toBeUndefined();
    expect(deviceLanguage(all, [])).toBeUndefined();
  });

  it('Suggested: recent, then the phone, then the gateway languages; three at most', () => {
    const all = ['eng', 'fra', 'hin', 'spa', 'arb'];
    expect(suggestedLanguages(all, undefined, 'eng')).toEqual(['eng', 'fra', 'hin']);
    expect(suggestedLanguages(all, 'arb', 'spa')).toEqual(['arb', 'spa', 'eng']);
    expect(suggestedLanguages(['spa', 'hau'], undefined, undefined)).toEqual([]);
  });
});

/** A response whose body arrives in chunks; `pulled` counts what the reader asked for. */
function chunked(parts: string[], status = 200) {
  const enc = new TextEncoder();
  const state = { pulled: 0, cancelled: false };
  const body = new ReadableStream<Uint8Array>({
    pull(ctl) {
      if (state.pulled >= parts.length) return ctl.close();
      ctl.enqueue(enc.encode(parts[state.pulled++]));
    },
    cancel() {
      state.cancelled = true;
    },
  });
  const res = new Response(body, { status });
  return { state, fetchImpl: (async () => res) as unknown as typeof fetch };
}

describe('readCounts: the counts without the whole per-language file', () => {
  const head = '{"schemaVersion":1,"language":"spa","autonym":"Español","name":"Spanish",';
  const countsJson =
    '"counts":{"pericopes":396,"books":6,"guideUnitsEstimate":33301,"scriptureEditions":2,"terms":238,"termAudio":10,"images":217,"maps":0,"videos":55},';
  it('stops reading and cancels once the counts object closes', async () => {
    const { state, fetchImpl } = chunked([
      head,
      countsJson.slice(0, 40),
      countsJson.slice(40) + '"books":[',
      '{"entries": "megabytes"}',
      ...Array.from({ length: 50 }, () => '"x",'),
    ]);
    const c = await readCounts('/data/catalog/spa.json', { fetchImpl });
    expect(c).toMatchObject({ pericopes: 396, scriptureEditions: 2, terms: 238, maps: 0 });
    expect(state.pulled).toBeLessThanOrEqual(4); // of 54 chunks (the stream may queue one ahead)
    expect(state.cancelled).toBe(true);
  });
  it('null on HTTP errors, on a file with no counts and on a malformed counts object', async () => {
    expect(await readCounts('/x', { fetchImpl: chunked([head], 404).fetchImpl })).toBeNull();
    expect(await readCounts('/x', { fetchImpl: chunked([head, '}']).fetchImpl })).toBeNull();
    expect(
      await readCounts('/x', {
        fetchImpl: chunked([head + '"counts":{"terms":"many"}']).fetchImpl,
      }),
    ).toBeNull();
    const big = chunked([head, 'x'.repeat(70_000), countsJson]);
    expect(await readCounts('/x', { fetchImpl: big.fetchImpl })).toBeNull();
    expect(big.state.cancelled).toBe(true);
  });
  it('null when the fetch itself fails', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    expect(await readCounts('/x', { fetchImpl })).toBeNull();
  });
});
