import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { EN } from '../src/i18n';
import S19Coverage from '../src/screens/S19Coverage';
import {
  coverageCards,
  marksUsed,
  voiceState,
  type LanguageFile,
  type TypeCard,
} from '../src/screens/coverageCards';
import { coverageFor, type CatalogManifest } from '../src/settings/coverage';

// F6-S19: the type cards of the nodded mock 19-coverage.html, read from the shipped pipeline catalog
// (data/catalog @ this commit). The mock drew Español from the same counts; where the data has not
// filled a slot (guide and Scripture audio: BL3/B2b), the card says "not yet", never the mock's word.
const read = (f: string) =>
  JSON.parse(readFileSync(new URL(`../data/catalog/${f}`, import.meta.url), 'utf8'));
const manifest = read('manifest.json') as CatalogManifest;
const files = new Map<string, LanguageFile>();
const file = (code: string) => {
  if (!files.has(code)) files.set(code, read(`${code}.json`) as LanguageFile);
  return files.get(code)!;
};
const cardsFor = (code: string, f: LanguageFile = file(code)) =>
  coverageCards(coverageFor(manifest, code, f.counts), f);
const by = (cards: TypeCard[]) => Object.fromEntries(cards.map((c) => [c.key, c]));
const words = (cards: TypeCard[]) =>
  cards.map((c) => [c.key, `${c.text.mark}:${c.text.words}`, `${c.audio.mark}:${c.audio.words}`]);

describe('F6-S19 type cards from the catalog', () => {
  it('spa: the mock\'s six cards, in its order, from data; unfilled audio says "not yet"', () => {
    const cards = cardsFor('spa');
    expect(cards.map((c) => c.kind)).toEqual([
      'plain',
      'scripture',
      'term',
      'media',
      'media',
      'video',
    ]);
    expect(words(cards)).toEqual([
      ['guide', 'on:396 passages', 'absent:not yet'],
      ['scripture', 'on:2 editions', 'absent:not yet'],
      ['terms', 'on:238 terms', 'on:10 recordings'],
      ['images', 'on:217 titles', 'none:none'],
      ['maps', 'absent:not yet · English shown', 'none:none'],
      ['videos', 'on:55 titles', 'on:in the video'],
    ]);
    // the key lists the marks the cards use (no AI voice is in the data yet), in the mock's order
    expect(marksUsed(cards)).toEqual(['on', 'absent']);
    expect(voiceState(cards)).toBe('not-yet');
  });

  it('eng: counts read with grouping, maps localized', () => {
    const b = by(cardsFor('eng'));
    expect(b.guide.text.words).toBe('1,497 passages');
    expect(b.images.text.words).toBe('1,743 titles');
    expect(b.maps.text).toEqual({ mark: 'on', words: '227 titles' });
    expect(b.terms.audio.words).toBe('256 recordings');
  });

  it('hau: nothing on Aquifer is "not yet", English shown only where passages carry it', () => {
    const b = by(cardsFor('hau'));
    expect(b.guide.text.words).toBe('14 passages');
    expect(b.scripture.text).toEqual({ mark: 'absent', words: 'not yet' });
    expect(b.terms.text).toEqual({ mark: 'absent', words: 'not yet · English shown' });
    expect(b.terms.audio).toEqual({ mark: 'absent', words: 'not yet' });
    expect(b.videos.text.mark).toBe('absent');
    expect(b.videos.audio).toEqual({ mark: 'absent', words: 'not yet' });
  });

  it('rus: key-term recordings show even where the term text is English only', () => {
    const b = by(cardsFor('rus'));
    expect(b.terms.text.mark).toBe('absent');
    expect(b.terms.audio).toEqual({ mark: 'on', words: '37 recordings' });
  });

  it('a filled guide voice slot reads AI voice (generated) or recordings (source); one is singular', () => {
    const base = file('spa');
    const withNarration = (statuses: string[]): LanguageFile => ({
      ...base,
      entries: statuses.map((status) => ({ guide: { narration: { status } } })),
    });
    const ai = cardsFor('spa', withNarration(['generated', 'absent']));
    expect(by(ai).guide.audio).toEqual({ mark: 'ai', words: 'AI voice' });
    expect(voiceState(ai)).toBe('ai');
    expect(marksUsed(ai)).toEqual(['on', 'ai', 'absent']);
    const rec = cardsFor('spa', withNarration(['source', 'generated']));
    expect(by(rec).guide.audio).toEqual({ mark: 'on', words: '1 recording' });
    expect(voiceState(rec)).toBe('recorded');
  });

  it('every language: Scripture text is never AI, and no chip claims AI the data does not have', () => {
    for (const { code } of manifest.languages) {
      const cards = cardsFor(code);
      expect(cards).toHaveLength(6);
      expect(by(cards).scripture.text.mark).not.toBe('ai');
      expect(cards.some((c) => c.text.mark === 'ai' || c.audio.mark === 'ai')).toBe(false);
      for (const c of cards) {
        expect(c.text.words).not.toMatch(/\{|\}/);
        expect(c.audio.words).not.toMatch(/\{|\}/);
        // images and maps have no audio of their own: "none", never "not yet"
        if (c.key === 'images' || c.key === 'maps') expect(c.audio.mark).toBe('none');
      }
    }
  });
});

describe('F6-S19 screen', () => {
  const render = (path: string) =>
    renderToString(
      createElement(MemoryRouter, { initialEntries: [path] }, createElement(S19Coverage)),
    );
  it('starts loading: the title, one way back, no invented cards, no primary', () => {
    const html = render('/coverage?lang=spa');
    expect(html).toContain('data-screen="S19"');
    expect(html).toContain(EN['s.common.loading']);
    expect(html).toContain(EN['s.common.back']);
    expect(html).toContain(EN['s.coverage.subtitle']);
    expect(html).not.toContain('s19-cards');
    expect(html).not.toContain('data-role="primary"');
  });
});
