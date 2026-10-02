import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EN } from '../src/i18n';
import S17InstallGuide from '../src/screens/S17InstallGuide';

// F6-S17 glass skin (mock design/alpha-v2-screens/17-install-guide.html; steps 1–3, ?os=android,
// ?from=about): kit GlassSurface cards, the marked app-layer step list, glyphs and drawings, and the
// kept flow (platform detection, prompt, skip gate) unchanged.
const install = vi.hoisted(() => ({
  available: false,
  pending: false,
  accepted: false,
  standalone: false,
}));
vi.mock('../src/offline', async (orig) => ({
  ...(await orig<typeof import('../src/offline')>()),
  useInstall: () => install,
}));

const UA = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0 Safari/537.36',
};
const render = (os: keyof typeof UA, url = '/install') => {
  vi.stubGlobal('navigator', { userAgent: UA[os], maxTouchPoints: os === 'desktop' ? 0 : 5 });
  return renderToString(
    createElement(MemoryRouter, { initialEntries: [url] }, createElement(S17InstallGuide)),
  );
};
const count = (html: string, s: string) => html.split(s).length - 1;

afterEach(() => {
  vi.unstubAllGlobals();
  Object.assign(install, { available: false, standalone: false });
});

describe('F6-S17 install guide in glass', () => {
  it('iOS step 1: Why-install card, numbered labelled steps (current = step 1), marked kit gaps', () => {
    const html = render('ios', '/install?from=passage');
    expect(html).toContain(EN['s.install.why-first']);
    expect(html).toContain('data-kit-gap="step-list"');
    expect(count(html, '<li class="fia-install__step')).toBe(3);
    expect(count(html, 'aria-current="step"')).toBe(1);
    for (const n of [1, 2, 3]) expect(html).toContain(EN[`s.install.step-label.ios.${n}`]);
    expect(html).toContain('data-kit-gap="share"');
    expect(html).toContain('data-kit-gap="smartphone"');
    expect(html).toContain('data-kit-gap="illustration"');
    expect(html).toContain(EN['s.install.where.ios']);
    expect(html).toContain(EN['s.install.ios.step1.title']);
    // the S04 save gate keeps "Skip and save anyway"; step 1 has no Previous
    expect(html).toContain(EN['s.install.skip']);
    expect(html).not.toContain(EN['s.install.previous']);
    expect(html).not.toContain(EN['s.install.not-now']);
    expect(count(html, 'data-role="primary"')).toBe(1);
    expect(html).toContain(EN['s.install.primary.next']);
  });
  it('iOS not from the save gate (About, Downloads) reads "Not now"', () => {
    const html = render('ios', '/install?from=about');
    expect(html).toContain(EN['s.install.not-now']);
    expect(html).not.toContain(EN['s.install.skip']);
  });
  it('Android with the install prompt: one step, Chrome box drawn, primary "Install FIA", no Why card', () => {
    install.available = true;
    const html = render('android');
    expect(html).toContain(EN['s.install.android.prompt.title']);
    expect(html).toContain(EN['s.install.primary.install-fia']);
    expect(html).toContain(EN['s.install.where.android']);
    expect(html).toContain(EN['s.install.draw.install-app']);
    expect(html).not.toContain('data-kit-gap="step-list"');
    expect(html).not.toContain(EN['s.install.why-first']);
    expect(html).toContain(EN['s.install.not-now']);
  });
  it('Android without the prompt keeps the ⋮ menu steps (kept flow), labelled', () => {
    const html = render('android');
    expect(html).toContain(EN['s.install.android.step1.title']);
    expect(html).toContain(EN['s.install.step-label.android.1']);
    expect(html).toContain(EN['s.install.primary.next']);
  });
  it('desktop and standalone render on kit glass; "Installed" draws the check as a kit icon', () => {
    expect(render('desktop')).toContain(EN['s.install.desktop']);
    install.standalone = true;
    const html = render('ios');
    expect(html).toContain(EN['s.install.installed-body']);
    expect(html).not.toContain('✓');
    expect(html).toContain('fia-install__title--icon');
  });
  it('imports kit components only through src/components/glass.ts', () => {
    const src = readFileSync(
      new URL('../src/screens/S17InstallGuide.tsx', import.meta.url),
      'utf8',
    );
    expect(src).not.toMatch(/vendor\/glass/);
    expect(src).toMatch(/from '\.\.\/components\/glass'/);
  });
});
