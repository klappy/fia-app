import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { DownloadTierPicker, type TierRow } from '../src/components/DownloadTierPicker';
import { initialState } from '../src/flow/machine';
import type { CatalogEntry, FlowGuide } from '../src/flow/types';
import { EN } from '../src/i18n';
import {
  EMPTY_FACTS,
  guideVoice,
  keepRef,
  legendRows,
  rightsLine,
  startCopy,
  subLine,
  talkStops,
  voiceOf,
  type PackFacts,
} from '../src/screens/passageCard';
import { fixtureCatalog, PACK } from './flow/fixture';

// F6-S04 Passage card in glass (mock design/alpha-v2-screens/04-passage-card.html): the card's words and
// counts come from the pack, never invented; the tier picker is kit GlassSegmented with the unpublished
// tiers shown "not yet" and not choosable; the changed files take the kit only from its vendored paths.
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('data/packs/eng.MRK-1-1-13/manifest.json')) as {
  counts: Record<string, number>;
};
const entry = (
  JSON.parse(read('data/catalog/manifest.json')) as { entries: CatalogEntry[] }
).entries.find((e) => e.packId === PACK)!;
/** A passage with no clips: no generated narration and no stand-in. */
const bare = (
  JSON.parse(read('data/catalog/manifest.json')) as { entries: CatalogEntry[] }
).entries.find((e) => e.packId === 'eng.MRK-1-14-20')!;
const FACTS: PackFacts = {
  counts: manifest.counts,
  editions: ['BSB', 'ULT', 'UST', 'WEB', 'WEBU'],
};

let guide: FlowGuide;
beforeAll(async () => {
  guide = await fixtureCatalog().guide(PACK);
});

describe('F6-S04 card words from the pack', () => {
  it('Includes: one row per kind the pack carries, in the mock order, with pack counts', () => {
    const rows = legendRows(guide, entry, FACTS);
    expect(rows.map((r) => r.kind)).toEqual([
      'plain',
      'scripture',
      'term',
      'media',
      'video',
      'stop',
    ]);
    expect(rows.map((r) => `${r.word} | ${r.count}`)).toEqual([
      'Guide parts | 130 in 6 steps',
      'Scripture | 5 editions',
      'Key terms | 21 · all with audio',
      'Images, maps | Images 4 · Maps 4',
      'Videos | 3',
      'Talk together | 23 stops',
    ]);
    // the terminal stop is the guide's end, not a talk
    expect(talkStops(guide)).toBe(guide.stops.length - 1);
  });

  it('leaves out what the pack does not carry; never a zero row', () => {
    const bare: CatalogEntry = { ...entry, resourceTypes: ['guide', 'term', 'map'] };
    const rows = legendRows(guide, bare, {
      counts: { terms: 3, termAudio: 1, images: 4, maps: 2, videos: 3 },
      editions: [],
    });
    expect(rows.map((r) => r.kind)).toEqual(['plain', 'term', 'media', 'stop']);
    expect(rows[1].count).toBe('3 · 1 with audio');
    expect(rows[2].count).toBe('Maps 2');
    // before the pack files are read: the guide's own rows only
    expect(legendRows(guide, entry, EMPTY_FACTS).map((r) => r.kind)).toEqual(['plain', 'stop']);
  });

  it('voice chip: "AI voice" wherever AI narration plays (catalog or stand-in), else "voice not yet"', () => {
    // Mark 1:1–13: the catalog has generated 0 (source 21 = term recordings), but the guide plays the
    // stand-in's AI-voiced PoC clips, so the passage is marked AI (C-06), the same on S02, S04 and S05.
    expect(voiceOf(entry)).toBe('ai');
    expect(voiceOf({ ...entry, provenance: null })).toBe('ai');
    // A passage with no clips at all is the only one that reads "Text · voice not yet".
    expect(voiceOf(bare)).toBe('none');
    expect(voiceOf({ ...bare, provenance: { audio: { generated: 117 } } })).toBe('ai');
    expect(voiceOf(undefined)).toBe('none');
    expect(EN['s.passage.voice-not-yet']).toBe('Text · voice not yet');
  });

  it('S05 voice chip agrees with S02/S04 and sheet 20: a clip that plays is named', () => {
    const clip = { id: 'S01-U001', url: '/a.mp3' };
    const ai = { clip, mark: 'ai-voice' as const };
    const noClip = { clip: null, mark: 'absent' as const, silent: 'no-audio' as const };
    // J-A1 walk: the stand-in clip plays on Mark 1:1–13 → "AI voice", as S02 and S04 now say.
    expect(guideVoice(entry, ai)).toEqual({ mark: 'ai-voice', words: 'AI voice' });
    expect(guideVoice(undefined, ai).words).toBe('AI voice'); // before the catalog is read
    expect(guideVoice(entry, { clip, mark: 'source' }).mark).toBe('source');
    expect(
      guideVoice(entry, { clip: null, mark: 'absent', silent: 'source-only-silent' }).words,
    ).toBe('Silent: recorded voices only');
    // A part without a clip in a voiced passage, and a passage with no clips at all.
    expect(guideVoice(entry, noClip).words).toBe('No voice for this part');
    expect(guideVoice(bare, noClip)).toEqual({ mark: 'absent', words: 'Text · voice not yet' });
  });

  it('sub line, sources line and the reference that never breaks at its dash', () => {
    expect(subLine('English', guide)).toBe('English · 6 steps · 130 parts');
    expect(subLine('', guide)).toBe('6 steps · 130 parts');
    expect(rightsLine(FACTS)).toBe(
      'Guide: FIA Translation Guide · Scripture: BSB, ULT, UST, WEB, WEBU · Rights: Explore › About',
    );
    expect(rightsLine(EMPTY_FACTS)).toBe('Guide: FIA Translation Guide · Rights: Explore › About');
    expect(keepRef('Mark 1:1–13')).toBe('Mark 1:1⁠–⁠13');
  });

  it('primary and start line: fresh (mock), started and finished (unmocked, mock words)', () => {
    const fresh = initialState(guide);
    expect(startCopy(guide, fresh)).toEqual({
      primary: 'Start Mark 1:1⁠–⁠13',
      hint: `Starts at Step 1 · ${guide.steps[0].title}`,
    });
    const ids = guide.steps.flatMap((s) => s.units.map((u) => u.id));
    const at = ids.indexOf('S03-U004');
    const started = { ...fresh, unitId: 'S03-U004', visited: ids.slice(0, at + 1) };
    expect(startCopy(guide, started)).toEqual({
      primary: 'Continue Mark 1:1⁠–⁠13',
      hint: 'Step 3 of 6 · part 4 of 25 in this step',
    });
    expect(startCopy(guide, { ...started, finished: true }).primary).toBe(
      'Start Mark 1:1⁠–⁠13 again',
    );
  });
});

describe('F6-S04 tier picker on kit GlassSegmented', () => {
  const rows: TierRow[] = [
    { tier: 'text', label: 'Text', size: '0.5 MB', note: EN['s.passage.tier.text-note'] },
    { tier: 'phone', label: 'Phone', size: 'not yet', disabled: true, note: 'phone note' },
    { tier: 'original', label: 'Full', size: 'not yet', disabled: true, note: 'full note' },
  ];
  const html = renderToString(
    createElement(DownloadTierPicker, { tiers: rows, value: 'text', label: 'How much to save' }),
  );
  it('three icon + word + size cells in one radiogroup; the chosen one checked; its note below', () => {
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="How much to save"');
    expect(html.split('role="radio"').length - 1).toBe(3);
    expect(html.split('aria-checked="true"').length - 1).toBe(1);
    expect(html.split('<svg').length - 1).toBe(3);
    expect(html).toContain('data-testid="tier-size-text"');
    expect(html).toContain(EN['s.passage.tier.text-note']);
    expect(html).not.toContain('phone note');
  });
  it('an unpublished tier says "not yet" under its word and is marked not choosable', () => {
    expect(html.split('>not yet<').length - 1).toBe(2);
    expect(html.split('data-disabled="true"').length - 1).toBe(2);
  });
});

describe('F6-S04 G-F import check (PRD § 5 rule 3)', () => {
  const files = [
    'src/screens/S04PassageCard.tsx',
    'src/offline/SaveRow.tsx',
    'src/components/DownloadTierPicker.tsx',
  ];
  it('kit parts come only from the vendored kit (directly or via components/glass.ts)', () => {
    for (const f of files) {
      const src = read(f);
      const kit = [...src.matchAll(/from '([^']*(?:vendor|glass)[^']*)'/g)].map((m) => m[1]);
      expect(kit.length, f).toBeGreaterThan(0);
      for (const p of kit)
        expect(p, f).toMatch(
          /^(\.\.\/)+(vendor\/glass\/components\/|components\/glass$)|^\.\/glass$/,
        );
    }
    expect(read(files[0])).toMatch(/GlassSurface/);
    expect(read(files[0])).toMatch(/vendor\/glass\/components\/glass\/GlassChip/);
    expect(read(files[0])).toMatch(/vendor\/glass\/components\/progress\/StageRail/);
    expect(read(files[1])).toMatch(/vendor\/glass\/components\/scripture\/SyncBadge/);
    expect(read(files[2])).toMatch(/GlassSegmented/);
  });
});
