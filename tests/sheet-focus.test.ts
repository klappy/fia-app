// @vitest-environment happy-dom
// PR #22 review finding 1: the Sheet focus trap must not re-run when the parent re-renders with a
// new inline onClose (ScreenFrame.tsx passes `() => setExplore(false)`; useClip re-renders it on
// every `timeupdate`). Re-running moved focus to the opener and back to the first row.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Sheet } from '../src/components/Sheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let opener: HTMLButtonElement;

const frame = (onClose: () => void, tick: number) =>
  createElement(
    Sheet,
    { title: 'Explore', open: true, onClose, closeButton: false },
    createElement('button', { id: 'row-1' }, 'Row 1'),
    createElement('button', { id: 'row-2' }, `Row 2 · ${tick}`),
  );

beforeEach(() => {
  opener = document.createElement('button');
  opener.id = 'opener';
  document.body.append(opener);
  opener.focus();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

describe('Sheet focus trap', () => {
  it('focuses the first focusable when it opens', () => {
    act(() => root.render(frame(() => {}, 0)));
    expect(document.activeElement?.id).toBe('row-1');
  });

  it('keeps focus where the user moved it when the parent re-renders with a new onClose', () => {
    act(() => root.render(frame(() => {}, 0)));
    const row2 = document.getElementById('row-2') as HTMLButtonElement;
    row2.focus();
    expect(document.activeElement).toBe(row2);
    for (let tick = 1; tick <= 3; tick++) act(() => root.render(frame(() => {}, tick)));
    expect(document.activeElement).toBe(row2);
  });

  it('Escape calls the latest onClose, not the one from the first render', () => {
    const calls: string[] = [];
    act(() => root.render(frame(() => calls.push('first'), 0)));
    act(() => root.render(frame(() => calls.push('latest'), 1)));
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(calls).toEqual(['latest']);
  });

  it('returns focus to the opener when the sheet closes', () => {
    act(() => root.render(frame(() => {}, 0)));
    act(() =>
      root.render(createElement(Sheet, { title: 'Explore', open: false, onClose: () => {} })),
    );
    expect(document.activeElement).toBe(opener);
  });
});
