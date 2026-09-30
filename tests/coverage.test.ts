import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  coverageFor,
  validateCatalog,
  type CatalogManifest,
  type LanguageCounts,
} from '../src/settings/coverage';

// Fixture = a slice of alpha/l1-pipeline data/catalog/manifest.json (C-03) + per-language counts.
const read = (f: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/l5/${f}`, import.meta.url), 'utf8'));
const manifest = read('catalog-manifest.json') as CatalogManifest;
const counts = read('language-counts.json') as Record<string, LanguageCounts>;

describe('R-314 coverage from C-03', () => {
  it('fixture validates against C-03', () => {
    const r = validateCatalog(manifest);
    expect(r.errors).toEqual([]);
  });
  it('spa: localized counts shown, maps English only, videos absent from these passages', () => {
    const c = coverageFor(manifest, 'spa', counts.spa);
    expect(c.language?.autonym).toBe('Español');
    const by = Object.fromEntries(c.rows.map((r) => [r.key, r]));
    expect(by.guide).toMatchObject({ status: 'available', count: 396 });
    expect(by.scripture).toMatchObject({ status: 'available', count: 2 });
    expect(by.terms).toMatchObject({ status: 'available', count: 238, sourceAudio: 10 });
    expect(by.maps.status).toBe('english-only');
    expect(by.videos.status).toBe('absent');
  });
  it('hau: nothing invented — no Scripture edition means English only / absent, never AI', () => {
    const c = coverageFor(manifest, 'hau', counts.hau);
    const by = Object.fromEntries(c.rows.map((r) => [r.key, r]));
    expect(by.guide).toMatchObject({ status: 'available', count: 14 });
    expect(by.scripture.status).toBe('absent');
    expect(by.images.status).toBe('english-only');
    expect(by.terms.status).toBe('english-only');
    expect(c.rows.every((r) => r.status !== 'available' || (r.count ?? 0) > 0)).toBe(true);
  });
  it('without localized counts, present types claim no number', () => {
    const c = coverageFor(manifest, 'spa');
    for (const r of c.rows) {
      expect(['listed', 'absent']).toContain(r.status);
      expect(r.count).toBeUndefined();
    }
  });
  it('provenance sums the manifest records, deduplicated by packId', () => {
    const c = coverageFor(manifest, 'hau', counts.hau);
    expect(c.passages).toBe(2);
    expect(c.provenance.text).toEqual({ source: 2, generated: 0, missing: 18 });
    expect(c.provenance.audio.missing).toBe(113);
  });
  it('a language with no entries is all absent', () => {
    const c = coverageFor(manifest, 'arb', undefined);
    expect(c.passages).toBe(0);
    expect(c.rows.every((r) => r.status === 'absent')).toBe(true);
  });
});
