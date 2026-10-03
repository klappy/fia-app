import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EN } from '../src/i18n';
import type { FlowGuide } from '../src/flow/types';
import {
  freeWords,
  keepRef,
  listFacts,
  metaWords,
  rowFacts,
  selectionBytes,
  sizeWords,
} from '../src/screens/pericopeList';

// F6-S03 pericope list facts (mock design/alpha-v2-screens/03-pericope-list.html "≈78 parts · 20 KB"):
// every number has a source, and an estimate never reads as exact (R-307, R-309).
const NB = ' ';
const doc = JSON.parse(
  readFileSync(new URL('../data/catalog/eng.json', import.meta.url), 'utf8'),
) as unknown;
const manifest = JSON.parse(
  readFileSync(new URL('../data/catalog/manifest.json', import.meta.url), 'utf8'),
) as { entries: { packId: string; tierBytes: { text: number } }[] };
const entry = (id: string) => manifest.entries.find((e) => e.packId === id)!;

const guide = (packId: string, hidden: boolean[]): FlowGuide => ({
  packId,
  language: 'eng',
  title: 'Mark 1:1–13',
  passage: '',
  provenance: 'source',
  steps: [
    {
      id: 'S01',
      title: 'Step',
      units: hidden.map((h, i) => ({
        id: `S01-U00${i}`,
        stepId: 'S01',
        kind: 'paragraph',
        text: '',
        textSha256: '',
        hidden: h,
        resources: [],
      })),
    },
  ],
  stops: [],
});

describe('F6-S03 list facts', () => {
  const facts = listFacts(doc);

  it('reads the per-language catalog: parts estimate and measured flag per pack', () => {
    expect(facts['eng.MRK-1-14-20']).toEqual({ units: 78, measured: false });
    expect(facts['eng.MRK-1-1-13'].measured).toBe(true);
    expect(listFacts(null)).toEqual({});
    expect(listFacts({ entries: [{ packId: 'x', guide: { unitsEstimate: 0 } }] })).toEqual({
      x: { units: undefined, measured: undefined },
    });
  });

  it('an unbuilt passage: ≈ parts and ≈ Text size (estimates, as the catalog marks them)', () => {
    const e = entry('eng.MRK-1-14-20');
    const f = rowFacts(e, facts[e.packId], undefined, undefined);
    expect(f.parts).toEqual({ n: 78, exact: false });
    expect(f.bytes).toEqual({ n: e.tierBytes.text, exact: false });
    expect(metaWords(f)).toBe(`≈78${NB}parts${NB}· ≈${Math.round(e.tierBytes.text / 1000)}${NB}KB`);
  });

  it('the guide in progress counts its walked parts (hidden example parts are not walked)', () => {
    const e = entry('eng.MRK-1-1-13');
    const f = rowFacts(e, facts[e.packId], guide(e.packId, [false, false, true]), undefined);
    expect(f.parts).toEqual({ n: 2, exact: true });
    // measured Text size: exact
    expect(f.bytes).toEqual({ n: e.tierBytes.text, exact: true });
    // another pack's guide is not this row's count
    expect(
      rowFacts(e, facts[e.packId], guide('eng.MRK-1-14-20', [false]), undefined).parts,
    ).toEqual({ n: 108, exact: false });
  });

  it('a verified save shows its own bytes, exact', () => {
    const e = entry('eng.MRK-1-14-20');
    const f = rowFacts(e, facts[e.packId], undefined, { tier: 'text', bytes: 230_400 });
    expect(f.bytes).toEqual({ n: 230_400, exact: true });
    expect(sizeWords(f.bytes!)).toBe('230 KB');
  });

  it('sizes: KB under 1 MB, MB above; free space in GB or MB', () => {
    expect(sizeWords({ n: 28_178, exact: true })).toBe('28 KB');
    expect(sizeWords({ n: 400, exact: true })).toBe('1 KB');
    expect(sizeWords({ n: 3_512_000, exact: false })).toBe('≈3.5 MB');
    expect(freeWords(11_200_000_000)).toBe('11.2 GB');
    expect(freeWords(912_000_000)).toBe('912 MB');
  });

  it('the select summary sums the chosen; exact only when every size is', () => {
    expect(selectionBytes([])).toBeUndefined();
    expect(
      selectionBytes([{ bytes: { n: 1000, exact: true } }, { bytes: { n: 2000, exact: false } }]),
    ).toEqual({ n: 3000, exact: false });
    expect(selectionBytes([{ bytes: { n: 1000, exact: true } }, {}])).toEqual({
      n: 1000,
      exact: false,
    });
  });

  it('references never break at the dash', () => {
    expect(keepRef('Mark 1:1–13')).toBe('Mark 1:1⁠–⁠13');
  });

  it('the mock words are in the string catalog (keys added, none renamed)', () => {
    expect(EN['s.pericopes.select']).toBe('Select');
    expect(EN['s.pericopes.select-done']).toBe('Done');
    expect(EN['s.pericopes.chip.selected']).toBe('Selected');
    expect(EN['s.pericopes.chip.add']).toBe('Add');
    expect(EN['s.pericopes.chip.saved']).toBe('Saved');
    expect(EN['s.pericopes.text-only']).toBe('Text only');
    expect(EN['s.pericopes.primary-save-offline']).toBe('Save {n} for offline');
    expect(EN['s.pericopes.summary']).toBe('Selected {n} · {size} of guide text');
    // v1 keys stay (add only)
    expect(EN['s.pericopes.search-placeholder']).toBe('Search in {book}…');
  });
});
