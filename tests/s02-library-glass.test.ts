import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CoverageChips } from '../src/components/CoverageChips';
import { PericopeCard } from '../src/components/PericopeCard';
import type { CatalogManifest } from '../src/flow/types';
import { EN, t } from '../src/i18n';
import S02Library from '../src/screens/S02Library';
import { libraryBooks, openBook, passageMatches, resumeRecap } from '../src/screens/libraryModel';
import { fixtureCatalog, PACK } from './flow/fixture';

// F6-S02 Library in glass (mock design/alpha-v2-screens/02-library.html): kit CatalogRow book rows,
// kit GlassSearch, the "Where you left off" recap on the kit StageRail/BeadStrip, PericopeCard on
// CatalogRow with the reference as the title (subtitle off by default), CoverageChips on GlassChip.
const manifest = JSON.parse(
  readFileSync(new URL('../data/catalog/manifest.json', import.meta.url), 'utf8'),
) as CatalogManifest;

describe('F6-S02 library model (C-03 catalog)', () => {
  it('books: canonical order, passage counts, saved counts from verified saves only', () => {
    const books = libraryBooks(manifest, 'eng', new Set(['eng.MRK-1-1-13']));
    expect(books).toHaveLength(32);
    expect(books[0]).toMatchObject({ book: 'GEN', name: 'Genesis' });
    expect(books.reduce((n, b) => n + b.count, 0)).toBe(1497);
    const mark = books.find((b) => b.book === 'MRK')!;
    expect(mark).toMatchObject({ name: 'Mark', count: 68, saved: 1 });
    expect(books.filter((b) => b.saved > 0).map((b) => b.book)).toEqual(['MRK']);
  });
  it('voice line follows passageCard voiceOf: Mark plays the stand-in AI clips, no other book has a voice', () => {
    const books = libraryBooks(manifest, 'eng', new Set());
    expect(books.filter((b) => b.voice === 'ai').map((b) => b.book)).toEqual(['MRK']);
    const voiced: CatalogManifest = {
      ...manifest,
      entries: manifest.entries.map((e) =>
        e.packId === 'eng.LUK-1-1-4'
          ? { ...e, provenance: { audio: { source: 0, generated: 20, missing: 0 } } }
          : e,
      ),
    };
    const after = libraryBooks(voiced, 'eng', new Set());
    expect(after.filter((b) => b.voice === 'ai').map((b) => b.book)).toEqual(['MRK', 'LUK']);
  });
  it('search finds passages by reference: whole numbers, any dash, none for an empty query', () => {
    const titles = passageMatches(manifest, 'eng', 'Mark 1').map((e) => e.title);
    expect(titles[0]).toBe('Mark 1:1–13');
    expect(titles.every((x) => x.startsWith('Mark 1:'))).toBe(true);
    expect(passageMatches(manifest, 'eng', 'mark 1:1-13').map((e) => e.packId)).toEqual([
      'eng.MRK-1-1-13',
    ]);
    expect(passageMatches(manifest, 'eng', '   ')).toEqual([]);
    expect(passageMatches(manifest, 'eng', 'Mark', 5)).toHaveLength(5);
  });
  it('first-visit primary book: a saved book, else the last one opened, else Mark, else the first', () => {
    const none = libraryBooks(manifest, 'eng', new Set());
    expect(openBook(none)?.book).toBe('MRK');
    expect(openBook(none, 'JHN')?.book).toBe('JHN');
    const saved = libraryBooks(manifest, 'eng', new Set(['eng.LUK-1-1-4']));
    expect(openBook(saved, 'JHN')?.book).toBe('LUK');
    expect(openBook(none.filter((b) => b.book !== 'MRK'))?.book).toBe('GEN');
    expect(openBook([])).toBeUndefined();
  });
});

describe('F6-S02 resume recap (PRD § 8.3: S02 recaps the band)', () => {
  it('part 4 of 25 in step 3: six steps, this section between two talks, talk after part 7', async () => {
    const g = await fixtureCatalog().guide(PACK);
    const r = resumeRecap(g, 'S03-U004');
    expect(r).toMatchObject({ stepIndex: 2, n: 4, m: 25, before: 0, after: 3 });
    expect(r.steps).toHaveLength(6);
    expect(r.stepTitle).toBe('Defining the Scenes');
    expect(r.tail).toEqual({ kind: 'talk-after', n: 7 });
    expect(r.progress).toBeCloseTo(4 / 25);
    // seven parts and the talk bar after part 7
    expect(r.beads).toHaveLength(8);
    expect(r.beads.map((b) => b.state)).toEqual([
      'done',
      'done',
      'done',
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
    expect(r.beads[7].kind).toBe('stop');
    // kinds come from the pack only: key terms and the Scripture cue; no media bead is invented
    expect(r.beads.every((b) => ['plain', 'scripture', 'term', 'stop'].includes(b.kind))).toBe(
      true,
    );
  });
  it('on the talk part itself the tail is "talk after this part"', async () => {
    const g = await fixtureCatalog().guide(PACK);
    expect(resumeRecap(g, 'S03-U007').tail).toEqual({ kind: 'talk-here' });
    expect(resumeRecap(g, 'S03-U023').tail).toEqual({ kind: 'step-ends', n: 25 });
  });
});

describe('F6-S02 components on the kit', () => {
  it('PericopeCard: the reference is the title; no subtitle unless one is passed', () => {
    const html = renderToString(
      createElement(PericopeCard, {
        reference: 'Mark 1:1–13',
        packId: PACK,
        saved: 'saved',
        onOpen: () => undefined,
        onInfo: () => undefined,
      }),
    );
    expect(html).toContain('Mark 1:1–13');
    expect(html).toContain(`data-pack-id="${PACK}"`);
    expect(html).not.toContain('fia-pericope__sub');
    expect(html).toContain(EN['s.common.saved-badge']);
    // one open (the row) and one info, side by side: never a control inside the row's button
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*<button/s);
    const sub = renderToString(
      createElement(PericopeCard, { reference: 'Mark 1:1–13', subtitle: 'A line' }),
    );
    expect(sub).toContain('fia-pericope__sub');
    expect(sub).toContain('A line');
  });
  it('PericopeCard offline and unsaved: the needs-connection badge, never a hidden caption', () => {
    const html = renderToString(
      createElement(PericopeCard, { reference: 'Mark 1:14–20', saved: 'not-saved' }),
    );
    expect(html).toContain('data-role="needs-connection"');
    expect(html).toContain(EN['s.common.not-saved-badge']);
  });
  it('CoverageChips: one kit chip per type, each mark is icon or dash plus words', () => {
    const html = renderToString(
      createElement(CoverageChips, {
        coverage: { guide: 'available', audio: 'ai', video: 'absent' },
        onOpenCoverage: () => undefined,
      }),
    );
    expect(html.match(/data-level=/g)).toHaveLength(3);
    expect(html).toContain(`${EN['s.lang.cov.guide']} · ${EN['s.lang.cov.available']}`);
    expect(html).toContain('data-kit-gap="dash"');
    expect(html).toContain(EN['s.common.coverage-chip']);
  });
  it('kit parts come through src/components/glass.ts only', () => {
    for (const f of [
      '../src/screens/S02Library.tsx',
      '../src/components/PericopeCard.tsx',
      '../src/components/CoverageChips.tsx',
    ]) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8');
      expect(src, f).not.toMatch(/vendor\/glass/);
      expect(src, f).toMatch(/from '\.\.?\/(components\/)?glass'/);
    }
  });
});

describe('F6-S02 screen', () => {
  it('renders the Home frame: hero "Library", kit search, no v1 list or card, no bar', () => {
    const html = renderToString(
      createElement(MemoryRouter, { initialEntries: ['/library'] }, createElement(S02Library)),
    );
    expect(html).toContain('data-screen="S02"');
    expect(html).toContain(`>${EN['s.library.title']}</h1>`);
    expect(html).toContain(`aria-label="${EN['s.library.search-placeholder']}"`);
    expect(html).toContain('type="search"');
    expect(html).not.toContain('fia-list');
    expect(html).not.toContain('fia-card');
    expect(html).not.toContain('GlassTabBar');
  });
  it('the mock words: counts, voice line, recap and the first-visit primary', () => {
    expect(
      t('s.library.summary', { language: 'English', b: 32, books: '32', n: 1497, count: '1,497' }),
    ).toBe('English · 32 books · 1,497 passages');
    expect(t('s.library.passages-count', { n: 1, count: '1' })).toBe('1 passage');
    expect(t('s.library.passages-count', { n: 68, count: '68' })).toBe('68 passages');
    expect(t('s.library.voice-not-yet')).toBe('Text · voice not yet');
    expect(t('s.library.resume-overline')).toBe('Where you left off');
    expect(t('s.library.resume-where', { n: 3, total: 6, part: 4, m: 25 })).toBe(
      'Step 3 of 6 · part 4 of 25 in this step',
    );
    expect(t('s.library.resume-next', { tail: t('s.library.tail.talk-after', { n: 7 }) })).toBe(
      'Next: talk after part 7',
    );
    expect(t('s.library.primary-open', { book: 'Mark' })).toBe('Open Mark');
    // no v1 words on glass
    for (const k of Object.keys(EN).filter((x) => x.startsWith('s.library.') && x in NEW))
      expect(EN[k as keyof typeof EN], k).not.toMatch(/\b(units?|Stage)\b|\bguides\b/);
  });
});

const NEW = Object.fromEntries(
  [
    'title',
    'summary',
    'passages-count',
    'voice-not-yet',
    'resume-overline',
    'resume-heading',
    'resume-where',
    'resume-steps',
    'resume-beads',
    'resume-next',
    'tail.talk-here',
    'tail.talk-after',
    'tail.step-ends',
    'tail.guide-ends',
    'primary-open',
    'passages-heading',
  ].map((k) => [`s.library.${k}`, true]),
);
