import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import S14Settings from '../src/screens/S14Settings';
import S15AboutRights from '../src/screens/S15AboutRights';
import S16Feedback from '../src/screens/S16Feedback';
import S19Coverage from '../src/screens/S19Coverage';
import { EN } from '../src/i18n';

// Server-render smoke: each L5 screen mounts without storage or network, and S15 never renders
// the M5 placeholder slot (must not ship as placeholder — design/alpha-screens/15-about-rights.md).
const render = (C: () => React.ReactElement, path: string) =>
  renderToString(createElement(MemoryRouter, { initialEntries: [path] }, createElement(C)));

describe('L5 screens render', () => {
  it('S14 shows the three narration modes with source-fallback checked by default', () => {
    const html = render(S14Settings, '/settings');
    expect(html).toContain(EN['s.settings.narration.fallback']);
    expect(html).toContain(EN['s.settings.narration.ai-only']);
    expect(html).toMatch(/aria-checked="true"[^>]*>(?:(?!<\/button>).)*Recorded \+ AI/);
    expect(html).toContain(EN['s.settings.primary.done']);
  });
  it('S15 renders LICENSE verbatim holder line and never the M5 slot', () => {
    const html = render(S15AboutRights, '/about');
    expect(html).toContain('Word Collective · MIT License');
    expect(html).toContain(EN['s.about.source.narration']);
    expect(html).not.toContain('pending review');
    expect(html).not.toContain('pending M5');
  });
  it('S16 composes with the anonymous note and the Send primary', () => {
    const html = render(S16Feedback, '/feedback?from=S05');
    expect(html).toContain(EN['s.feedback.anon-note']);
    expect(html).toContain(EN['s.feedback.primary.send']);
  });
  it('S19 starts loading (no invented rows before data)', () => {
    const html = render(S19Coverage, '/coverage?lang=spa');
    expect(html).toContain(EN['s.common.loading']);
    expect(html).not.toContain('fia-coverage-cards');
  });
});
