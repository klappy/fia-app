// @vitest-environment happy-dom
// F6-S01 glass skin (mock cookbook design/alpha-v2-screens/01-first-run-language.html): Linear frame with the
// 44 px lockup hero, the kit LanguagePicker over catalog rows with the mock's chips, radio semantics added by
// the wrapper, unmocked loading/error states, "Send feedback", and one primary that sets the guide's and the
// app's language before the library.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EN } from '../src/i18n';
import { flowSession } from '../src/flow/session';
import S01FirstRunLanguage from '../src/screens/S01FirstRunLanguage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const read = (f: string) =>
  JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/l5', f), 'utf8'));
const manifest = read('catalog-manifest.json');
const counts = read('language-counts.json');

let catalogUp = false;
const fetchStub = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.endsWith('/catalog/manifest.json')) {
    if (!catalogUp) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(manifest), { status: 200 });
  }
  const m = /\/catalog\/([a-z]{3})\.json$/.exec(url);
  if (m && counts[m[1]])
    return new Response(JSON.stringify({ language: m[1], counts: counts[m[1]], entries: [] }));
  return new Response('not found', { status: 404 });
});

function Where() {
  const loc = useLocation();
  return createElement('output', { id: 'where' }, loc.pathname + loc.search);
}

let host: HTMLDivElement;
let root: Root;
const $ = <T extends Element = HTMLElement>(s: string) => host.querySelector<T>(s);
const $$ = (s: string) => [...host.querySelectorAll<HTMLElement>(s)];
const primary = () => $('[data-role="primary"]')!;
const settle = async () => {
  for (let i = 0; i < 20; i++) await act(() => new Promise((r) => setTimeout(r, 5)));
};

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchStub);
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        createElement(Where),
        createElement(
          Routes,
          null,
          createElement(Route, { path: '/', element: createElement(S01FirstRunLanguage) }),
          createElement(Route, { path: '*', element: createElement('p', null, 'elsewhere') }),
        ),
      ),
    ),
  );
  await settle();
});
afterAll(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('F6-S01 first run · language in glass', () => {
  it('Linear frame: the 44 px lockup hero with "Alpha · prototype", the title, no language pill or Explore', () => {
    const logo = $('.s01-hero svg[role="img"]')!;
    expect(logo.getAttribute('aria-label')).toBe('FIA');
    expect(logo.getAttribute('height')).toBe('44');
    expect($('.fia-qualifier')!.textContent).toBe(EN['s.about.qualifier']);
    expect($$('h1').map((h) => h.textContent)).toEqual([EN['s.lang.title']]);
    expect($('.fia-lang')).toBeNull();
    expect($('.fia-explore')).toBeNull();
  });

  it('no catalog (first run offline): the error card and one primary, "Try again"', () => {
    expect($('[role="alert"]')!.textContent).toContain(EN['s.lang.error']);
    expect($$('[data-role="primary"]')).toHaveLength(1);
    expect(primary().textContent).toContain(EN['s.lang.primary-retry']);
    expect($$('[role="radio"]')).toHaveLength(0);
  });

  it('Try again loads the catalog: kit picker rows from C-03, the mock chips, radio semantics', async () => {
    catalogUp = true;
    await act(async () => primary().click());
    await settle();
    expect($('[role="alert"]')).toBeNull();
    const radios = $$('[role="radio"]');
    expect(radios.map((r) => r.dataset.code).sort()).toEqual(['arb', 'eng', 'hau', 'spa']);
    expect($('[role="radiogroup"]')!.getAttribute('aria-label')).toBe(EN['s.lang.picker-title']);
    expect($('.fia-lp input')!.getAttribute('aria-label')).toBe(EN['s.lang.search-languages']);
    // the users' words, not the kit's Bible · Notes · Words
    const text = $('.fia-lp')!.textContent!;
    for (const k of ['scripture', 'guide', 'terms', 'maps'])
      expect(text).toContain(EN[`s.coverage.type.${k}`]);
    expect(text).not.toMatch(/\bBible\b|\bNotes\b|\bWords\b/);
    // chips come from coverage (hau: no Scripture, key-term text AI-filled)
    const hau = radios.find((r) => r.dataset.code === 'hau')!;
    expect(hau.getAttribute('aria-label')).toContain('Scripture not yet, Guide available');
    expect(hau.querySelector('[title="Key terms · AI-translatable"]')).not.toBeNull();
    expect(hau.querySelector('[title="Scripture · none"]')).not.toBeNull();
    expect($('.s01-lede')!.textContent).toContain('4 languages');
  });

  it('English is chosen first (the phone); the primary names the autonym', () => {
    const eng = $('[role="radio"][data-code="eng"]')!;
    expect(eng.getAttribute('aria-checked')).toBe('true');
    expect($$('[role="radio"][aria-checked="true"]')).toHaveLength(1);
    expect(primary().textContent).toContain('Continue in English');
  });

  it('picking Español moves the check and the primary; Continue sets both languages and opens the library', async () => {
    await act(async () => $('[role="radio"][data-code="spa"]')!.click());
    expect($('[role="radio"][data-code="spa"]')!.getAttribute('aria-checked')).toBe('true');
    expect($('[role="radio"][data-code="eng"]')!.getAttribute('aria-checked')).toBe('false');
    expect(primary().textContent).toContain('Continue in Español');
    await act(async () => primary().click());
    expect($('#where')!.textContent).toBe('/library');
    expect(flowSession().get().language).toBe('spa');
    expect(JSON.parse(localStorage.getItem('fia.settings.v1')!).contentLanguage).toBe('spa');
  });

  it('the kit picker is imported from the vendored kit path (G-F)', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/LanguagePicker.tsx'), 'utf8');
    expect(src).toContain("from '../vendor/glass/components/language/LanguagePicker'");
  });
});
