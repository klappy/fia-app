import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import S16Feedback from '../src/screens/S16Feedback';
import { EN } from '../src/i18n';

// S16 "We will attach" reads where the person was in words, with the stage's unit total:
// "{ref} · {stage}, part {unit} of {units} · {language}" (cookbook design/alpha-screens/16-feedback.md
// s.feedback.context-human; mock design/alpha-v2-screens/16-feedback.html:147 "part 4 of 25").
const units = Array.from({ length: 25 }, (_, i) => ({
  id: `S03-U${String(i + 1).padStart(3, '0')}`,
}));
const guide = {
  packId: 'spa.MRK-1-1-13',
  language: 'spa',
  title: 'Mark 1:1–13',
  passage: 'MRK 1:1-13',
  provenance: 'source',
  steps: [
    { id: 'S01', title: 'Hearing the Passage', units: [{ id: 'S01-U001' }] },
    { id: 'S03', title: 'Defining the Scenes', units },
  ],
  stops: [],
};
vi.mock('../src/flow/session', () => ({
  flowSession: () => ({
    get: () => ({ packId: guide.packId, guide, state: { unitId: 'S03-U004' }, changed: [] }),
  }),
}));

describe('S16 context-human', () => {
  it('the spec string carries the unit total', () => {
    expect(EN['s.feedback.context-human']).toBe(
      '{ref} · {stage}, part {unit} of {units} · {language}',
    );
  });
  it('reads "part n of m" from the live guide session', () => {
    const html = renderToString(
      createElement(
        MemoryRouter,
        { initialEntries: ['/feedback?from=S05'] },
        createElement(S16Feedback),
      ),
    );
    expect(html).toContain('Mark 1:1–13 · Defining the Scenes, part 4 of 25 · Español');
    expect(html).not.toContain('{units}');
  });
});
