import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  READY_INDEX,
  REQUIRED_DATA,
  shipData,
  shippedPacks,
} from '../src/offline/ship-data-plugin';
import { shellEntries } from '../src/offline/shell-manifest-plugin';

const DATA = join(__dirname, '..', 'data');
const PACK = 'eng.MRK-1-1-13';

describe('ship-data build step', () => {
  const out = mkdtempSync(join(tmpdir(), 'fia-dist-'));
  shipData(DATA, out);
  const tmp = [out];
  afterAll(() => tmp.forEach((d) => rmSync(d, { recursive: true, force: true })));

  it('puts the catalog manifest at dist/data/catalog/manifest.json', () => {
    const p = join(out, 'data/catalog/manifest.json');
    expect(existsSync(p)).toBe(true);
    expect(() => JSON.parse(readFileSync(p, 'utf8'))).not.toThrow();
  });

  it('ships rights and packs at every path the app requests', () => {
    for (const p of [
      'data/rights/records.json',
      `packs/${PACK}/guide.json`,
      `packs/${PACK}/guide-units.json`,
      `packs/${PACK}/manifest.json`,
      `packs/${PACK}/scripture.json`,
    ])
      expect(existsSync(join(out, p)), p).toBe(true);
  });

  it('ships each pack at one path only, its C-02 path (GAP-OFFLINE)', () => {
    expect(existsSync(join(out, 'data/packs'))).toBe(false);
  });

  it('every file a pack manifest lists exists at its C-02 path', () => {
    const m = JSON.parse(readFileSync(join(out, `packs/${PACK}/manifest.json`), 'utf8'));
    for (const tier of Object.values(m.tiers) as Array<{ files: { path: string }[] }>)
      for (const f of tier.files) expect(existsSync(join(out, f.path)), f.path).toBe(true);
  });

  it('writes the ready index beside the catalog: the packs this build ships with a guide (GAP-NOPACK)', () => {
    expect(READY_INDEX).toBe('data/catalog/ready.json');
    const doc = JSON.parse(readFileSync(join(out, READY_INDEX), 'utf8'));
    expect(doc.packs).toEqual(shippedPacks(DATA));
    expect(doc.packs).toEqual(expect.arrayContaining([PACK, 'arb.GEN-1-1-2-3']));
    expect(doc.packs).not.toContain('eng.MRK-1-14-20');
    // every listed pack opens at its one (C-02) path (the index adds nothing under data/packs)
    for (const id of doc.packs)
      for (const f of ['guide.json', 'guide-units.json'])
        expect(existsSync(join(out, `packs/${id}/${f}`)), `${id}/${f}`).toBe(true);
    // a pack without its guide files is not listed; no packs dir → an empty list
    const data = mkdtempSync(join(tmpdir(), 'fia-data-'));
    tmp.push(data);
    mkdirSync(join(data, 'packs/eng.X-1-1-2'), { recursive: true });
    writeFileSync(join(data, 'packs/eng.X-1-1-2/manifest.json'), '{}');
    expect(shippedPacks(data)).toEqual([]);
    expect(shippedPacks(join(data, 'none'))).toEqual([]);
  });

  it('ships JSON only', () => {
    expect(existsSync(join(out, 'data/catalog/COVERAGE.md'))).toBe(false);
  });

  it('never ships the pipeline cache (data/cache/, BL4d subtitle cache)', () => {
    const data = mkdtempSync(join(tmpdir(), 'fia-data-'));
    const dest = mkdtempSync(join(tmpdir(), 'fia-out-'));
    tmp.push(data, dest);
    for (const f of [...REQUIRED_DATA, 'cache/subtitles/abc.json']) {
      mkdirSync(dirname(join(data, f)), { recursive: true });
      writeFileSync(join(data, f), '{}');
    }
    shipData(data, dest);
    expect(existsSync(join(dest, 'data/catalog/manifest.json'))).toBe(true);
    expect(existsSync(join(dest, 'data/cache'))).toBe(false);
  });

  it('keeps pipeline data out of the shell precache (C-07)', () => {
    writeFileSync(join(out, 'index.html'), '<!doctype html>');
    const paths = shellEntries(out).map((e) => e.path);
    expect(paths).toEqual(['/index.html']);
  });

  it('fails loudly when the catalog manifest is missing', () => {
    const empty = mkdtempSync(join(tmpdir(), 'fia-data-'));
    const dest = mkdtempSync(join(tmpdir(), 'fia-out-'));
    tmp.push(empty, dest);
    mkdirSync(join(empty, 'rights'));
    writeFileSync(join(empty, 'rights/records.json'), '[]');
    expect(() => shipData(empty, dest)).toThrow(/catalog\/manifest\.json/);
  });
});
