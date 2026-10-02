import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { FeedbackForm } from '../src/components/FeedbackForm';
import S16Feedback from '../src/screens/S16Feedback';
import { EN } from '../src/i18n';

// F6-S16 glass skin (mock design/alpha-v2-screens/16-feedback.html): kit FilterChips reasons,
// the marked textarea fallback, the "We will attach" glass card, and the kit GlassField contact.
const form = (text: string, extra: Record<string, unknown> = {}) =>
  renderToString(
    createElement(FeedbackForm, {
      text,
      contact: '',
      onText: vi.fn(),
      onContact: vi.fn(),
      contextLines: ['Mark 1:1–13', 'Español (spa)'],
      ...extra,
    }),
  );

describe('F6-S16 feedback in glass', () => {
  it('reasons are kit FilterChips; the chip whose word leads the text is pressed, with a check', () => {
    const html = form(`${EN['s.feedback.reason.confusing']}: the audio`);
    expect(html).toContain('fia-feedback__reasons');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(3);
    expect(html).toContain('fia-feedback__chip');
  });
  it('message is the marked app-layer textarea; contact is kit GlassField with its own label', () => {
    const html = form('');
    expect(html).toMatch(/<textarea[^>]*id="fia-feedback-text"[^>]*class="fia-glass-area"/);
    expect(html).toMatch(/<input[^>]*id="fia-feedback-contact"/);
    expect(html).toContain(EN['s.feedback.contact']);
    expect(html).toContain('fia-feedback__context');
    expect(html).not.toContain(EN['s.feedback.paused-note']);
    expect(form('', { paused: true })).toContain(EN['s.feedback.paused-note']);
  });
  it('S16 shows where, not the build: no version/theme/size line on screen', () => {
    const html = renderToString(
      createElement(
        MemoryRouter,
        { initialEntries: ['/feedback?from=S05&pack=spa.MRK-1-1-13&unit=S02-U004'] },
        createElement(S16Feedback),
      ),
    );
    expect(html).toContain('spa.MRK-1-1-13');
    expect(html).toContain('Español (spa)');
    expect(html).not.toMatch(/>v\d+\.\d+/);
    expect(html).toContain(EN['s.feedback.paused-note']);
  });
});
