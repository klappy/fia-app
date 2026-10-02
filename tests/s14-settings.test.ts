import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SettingsRow, SettingsToggle } from '../src/components/SettingsRow';
import S14Settings from '../src/screens/S14Settings';
import { EN } from '../src/i18n';
import {
  DEFAULT_SETTINGS,
  TEXT_STEP_ATTR,
  applyToDocument,
  normalizeSettings,
} from '../src/settings';

// F6-S14: S14 in glass (mock design/alpha-v2-screens/14-settings.html; PRD § 8.5).
const html = () =>
  renderToString(
    createElement(MemoryRouter, { initialEntries: ['/settings'] }, createElement(S14Settings)),
  );

describe('S14 Settings in glass', () => {
  it('offers the four text sizes of PRD § 8.5 with Follows phone selected by default', () => {
    const h = html();
    for (const k of ['system', 'large', 'max', 'huge'])
      expect(h).toContain(EN[`s.settings.text-size.${k}`]);
    expect(h).toMatch(/role="radiogroup"[^>]*aria-label="Text size"/);
    expect(h).toMatch(/aria-checked="true"[^>]*>(?:(?!<\/button>).)*Follows phone/);
  });
  it('is one kit sheet with one primary and no bottom bar or hub links (RULING 2026-10-01 (a), (d))', () => {
    const h = html();
    expect(h).toContain('role="dialog"');
    expect(h.match(/<button[^>]*class="fia-primary[" ]/g)?.length).toBe(1);
    expect(h).toContain(EN['s.settings.primary.done']);
    expect(h).not.toContain('href="/downloads"');
    expect(h).not.toContain('href="/feedback"');
    expect(h).not.toContain('fia-dock');
  });
  it('language is a read-only pointer to the header pill (ruling (b))', () => {
    const h = html();
    expect(h).not.toContain('href="/?mode=use"');
    expect(h).toContain('button at the top of the guide or the library');
  });
  it('marks every kit-gap glyph in code', () => {
    const h = html();
    expect(h).toContain('data-kit-gap="smartphone"');
    expect(h).toContain('data-kit-gap="sun"');
  });
});

describe('Text-size steps 100 / 150 / 200 / 310% (PRD § 8.5)', () => {
  it('C-10 accepts huge and maps each step to its own html attribute', () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, textSize: 'huge' }).settings.textSize).toBe(
      'huge',
    );
    expect(TEXT_STEP_ATTR).toEqual({ system: null, large: 'x150', max: 'x200', huge: 'x310' });
    const root = { attrs: new Map<string, string>() } as unknown as HTMLElement & {
      attrs: Map<string, string>;
    };
    const el = {
      setAttribute: (k: string, v: string) => root.attrs.set(k, v),
      removeAttribute: (k: string) => root.attrs.delete(k),
      toggleAttribute: () => true,
    } as unknown as HTMLElement;
    applyToDocument({ ...DEFAULT_SETTINGS, textSize: 'huge' }, el);
    expect(root.attrs.get('data-text-step')).toBe('x310');
  });
});

describe('SettingsRow on glass', () => {
  it('renders icon, label, note and the kit switch with an On/Off word', () => {
    const h = renderToString(
      createElement(SettingsRow, {
        label: 'Easy mode',
        consequence: 'Hold any label to hear it read aloud.',
        icon: createElement('i', { 'data-icon': 'x' }),
        control: createElement(SettingsToggle, {
          on: true,
          label: 'Easy mode',
          onChange: () => {},
        }),
      }),
    );
    expect(h).toContain('data-icon="x"');
    expect(h).toContain('Hold any label to hear it read aloud.');
    expect(h).toMatch(
      /role="switch"[^>]*aria-checked="true"|aria-checked="true"[^>]*role="switch"/,
    );
    expect(h).toContain('aria-label="Easy mode"');
    expect(h).toContain(EN['s.settings.on']);
  });
});
