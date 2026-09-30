import { describe, expect, it } from 'vitest';
import {
  booksFor,
  bookName,
  ContractError,
  createCatalog,
  pericopesFor,
} from '../../src/flow/catalog';
import { indexOf, isScriptureCue, stopsPassed, units, waitingStops } from '../../src/flow/model';
import { fixtureCatalog, fixtureFetch, PACK } from './fixture';

describe('catalog loader (C-03)', () => {
  it('loads and validates the manifest; books and pericopes per language', async () => {
    const m = await fixtureCatalog().manifest();
    expect(m.languages.map((l) => l.code).sort()).toEqual(['arb', 'eng', 'spa']);
    const eng = booksFor(m, 'eng');
    expect(eng.map((b) => b.book)).toEqual(expect.arrayContaining(['MRK', 'JAS']));
    expect(eng.find((b) => b.book === 'MRK')).toMatchObject({ name: 'Mark', count: 6 });
    const mrk = pericopesFor(m, 'eng', 'MRK').map((e) => e.pericope);
    expect(mrk[0]).toBe('MRK-1-1-13');
    expect(mrk).toEqual([...mrk].sort((a, b) => Number(a.split('-')[2]) - Number(b.split('-')[2])));
  });
  it('rejects a manifest that breaks C-03', async () => {
    const bad = createCatalog('/data', async () => ({ schemaVersion: 1, languages: [] }));
    await expect(bad.manifest()).rejects.toBeInstanceOf(ContractError);
  });
  it('rejects guide units that break C-04', async () => {
    const bad = createCatalog('/data', async (url) =>
      url.endsWith('guide-units.json') ? { packId: PACK, steps: [], stops: [] } : fixtureFetch(url),
    );
    await expect(bad.guide(PACK)).rejects.toBeInstanceOf(ContractError);
  });
  it('bookName strips the reference', () => {
    expect(bookName('1 Chronicles 1:1–7')).toBe('1 Chronicles');
  });
});

describe('guide join and model (eng Mark 1:1–13)', async () => {
  const g = await fixtureCatalog().guide(PACK);
  it('joins text onto every C-04 unit: six stages', () => {
    expect(g.steps).toHaveLength(6);
    expect(units(g).every((u) => u.text.length > 0 && /^[a-f0-9]{64}$/.test(u.textSha256))).toBe(
      true,
    );
    expect(g.title).toBe('Mark 1:1–13');
  });
  it('waiting stops exclude terminal ones', () => {
    expect(waitingStops(g).every((s) => s.kind !== 'terminal')).toBe(true);
    expect(waitingStops(g).length).toBeGreaterThan(0);
  });
  it('forward jump past a stop is guarded; backward and on-stop landings are not (R-412)', () => {
    const [s1] = waitingStops(g); // stop-001 after S02-U005
    const all = units(g);
    const before = all[indexOf(g, s1.afterUnitId) - 1].id;
    const after = all[indexOf(g, s1.afterUnitId) + 1].id;
    expect(stopsPassed(g, before, after, []).map((s) => s.id)).toEqual([s1.id]);
    expect(stopsPassed(g, before, s1.afterUnitId, [])).toEqual([]);
    expect(stopsPassed(g, after, before, [])).toEqual([]);
    expect(stopsPassed(g, before, after, [s1.id])).toEqual([]);
  });
  it('the step-1 listening unit is a Scripture cue', () => {
    expect(units(g).some((u) => isScriptureCue(u, g.title))).toBe(true);
  });
});
