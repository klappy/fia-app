import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { EN } from '../src/i18n';
import S15AboutRights from '../src/screens/S15AboutRights';
import { DATA_PATHS, packLineParts, parsePackRights } from '../src/settings';

// F6-S15 glass skin (mock design/alpha-v2-screens/15-about.html): lockup card, This app (Install),
// Sources and rights with legend marks and the BL8 pack holder · licence lines, Data we send toggle,
// quiet Send feedback; the v1 verbatim notices stay (PoC is the floor).
const render = () =>
  renderToString(
    createElement(MemoryRouter, { initialEntries: ['/about'] }, createElement(S15AboutRights)),
  );
const pack = JSON.parse(
  readFileSync(new URL('../data/packs/eng.MRK-1-1-13/rights.json', import.meta.url), 'utf8'),
);

describe('F6-S15 pack rights lines (BL8)', () => {
  it('reads every source of the eng pack verbatim, holder and licence present', () => {
    const lines = parsePackRights(pack);
    expect(lines.length).toBe(pack.sources.length);
    const guide = lines.find((l) => l.collection === 'FIATranslationGuide');
    expect(packLineParts(guide)).toEqual({
      holder: 'Word Collective, Mission Mutual',
      licence: 'CC BY-SA 4.0 license',
    });
  });
  it('a missing holder or licence stays unlisted, never filled in', () => {
    const lines = parsePackRights({
      sources: [
        { id: 'a@1', collection: 'A', holders: null, licence: { name: 'X' } },
        { id: 'b@1', collection: 'B', holders: ['H'], licence: null },
        { nope: true },
      ],
    });
    expect(lines.length).toBe(2);
    expect(lines.map(packLineParts)).toEqual([null, null]);
    expect(parsePackRights(null)).toEqual([]);
  });
  it('the pack path is per pack id', () => {
    expect(DATA_PATHS.packRights('eng.MRK-1-1-13')).toMatch(
      /\/packs\/eng\.MRK-1-1-13\/rights\.json$/,
    );
  });
});

describe('F6-S15 about and rights in glass', () => {
  it('renders the mock order: lockup + qualifier, This app, sources, data, Send feedback', () => {
    const html = render();
    const at = (s: string) => html.indexOf(s);
    for (const k of [
      's.about.qualifier',
      's.about.this-app',
      's.about.install',
      's.about.sources',
      's.about.tap-notice',
      's.about.data',
      's.about.data.count',
      's.about.send-feedback',
    ] as const)
      expect(at(EN[k]), k).toBeGreaterThan(-1);
    expect(at(EN['s.about.install'])).toBeLessThan(at(EN['s.about.sources']));
    expect(at(EN['s.about.sources'])).toBeLessThan(at(EN['s.about.data.count']));
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-label="FIA"');
  });
  it('each FIA source leads with its legend mark (kit gap, marked); no primary, no version line', () => {
    const html = render();
    for (const k of ['plain', 'term', 'media', 'video'])
      expect(html).toContain(`fia-about__mark--${k}`);
    expect(html.split('data-kit-gap="legend-mark"').length - 1).toBe(5);
    expect(html).toContain('data-kit-gap="message"');
    expect(html).not.toContain('data-role="primary"');
    expect(html).not.toContain('FIA Alpha · v');
    expect(html).not.toContain('pending M5');
  });
  it('imports kit components only through src/components/glass.ts', () => {
    const src = readFileSync(new URL('../src/screens/S15AboutRights.tsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/vendor\/glass/);
    expect(src).toMatch(/from '\.\.\/components\/glass'/);
  });
});
