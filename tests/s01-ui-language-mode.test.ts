// @vitest-environment happy-dom
// S01 and the UI language (review rev-spaui-1220 on #98, item 1): first run sets the guide and the
// menus (SB-3 (1)); use mode (`/?mode=use`, the header pill) changes the content only — the UI
// language never flips silently (design/alpha-screens/01-first-run-language.md:64, J-A7--P-01).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setUiLanguage, uiLanguage } from '../src/i18n';
import S01FirstRunLanguage from '../src/screens/S01FirstRunLanguage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const read = (f: string) =>
  JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/l5', f), 'utf8'));
const manifest = read('catalog-manifest.json');
const counts = read('language-counts.json');

beforeAll(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/catalog/manifest.json')) return new Response(JSON.stringify(manifest));
      const m = /\/catalog\/([a-z]{3})\.json$/.exec(url);
      if (m && counts[m[1]])
        return new Response(JSON.stringify({ language: m[1], counts: counts[m[1]], entries: [] }));
      return new Response('not found', { status: 404 });
    }),
  );
});

let host: HTMLDivElement;
let root: Root;
const $ = (s: string) => host.querySelector<HTMLElement>(s);
const settle = async () => {
  for (let i = 0; i < 20; i++) await act(() => new Promise((r) => setTimeout(r, 5)));
};
function Where() {
  return createElement('output', { id: 'where' }, useLocation().pathname);
}

async function open(entry: string, ui: string) {
  localStorage.clear();
  localStorage.setItem(
    'fia.settings.v1',
    JSON.stringify({
      schemaVersion: 1,
      narrationMode: 'source-fallback',
      mediaTier: 'phone',
      contentLanguage: ui,
      uiLanguage: ui,
      textSize: 'system',
      lowLiteracy: false,
      theme: 'system',
      disclosuresPresented: [],
      telemetryOptIn: false,
    }),
  );
  await setUiLanguage(ui);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [entry] },
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
}

async function pick(code: string) {
  await act(async () => $(`[role="radio"][data-code="${code}"]`)!.click());
  await act(async () => $('[data-role="primary"]')!.click());
  await vi.waitFor(() => expect($('#where')!.textContent).toBe('/library'));
}

const saved = () => JSON.parse(localStorage.getItem('fia.settings.v1')!);

afterEach(async () => {
  act(() => root.unmount());
  host.remove();
  await setUiLanguage('eng');
});

describe('S01 and the UI language', () => {
  it('first run: one pick sets content and menus (Español → spa)', async () => {
    await open('/', 'eng');
    await pick('spa');
    expect(saved()).toMatchObject({ contentLanguage: 'spa', uiLanguage: 'spa' });
    expect(uiLanguage()).toBe('spa');
  });

  it('first run: a pick with no UI catalog keeps English menus', async () => {
    await open('/', 'spa');
    await pick('hau');
    expect(saved()).toMatchObject({ contentLanguage: 'hau', uiLanguage: 'eng' });
    expect(uiLanguage()).toBe('eng');
  });

  it('use mode (header pill): content changes, the Spanish menus stay', async () => {
    await open('/?mode=use', 'spa');
    await pick('hau');
    expect(saved()).toMatchObject({ contentLanguage: 'hau', uiLanguage: 'spa' });
    expect(uiLanguage()).toBe('spa');
  });

  it('use mode: picking English content does not switch the menus to English', async () => {
    await open('/?mode=use', 'spa');
    await pick('eng');
    expect(saved()).toMatchObject({ contentLanguage: 'eng', uiLanguage: 'spa' });
    expect(uiLanguage()).toBe('spa');
  });
});
