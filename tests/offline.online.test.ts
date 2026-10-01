import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onlineNow, savedPackIds, subscribeOnline, useOnline } from '../src/offline/useOnline';
import { ScreenFrame } from '../src/screens/ScreenFrame';
import { EN } from '../src/i18n';

// R-702: the ⊘ Offline chip follows navigator.onLine and the online/offline events.
afterEach(() => vi.unstubAllGlobals());

describe('useOnline', () => {
  it('reads navigator.onLine and counts a missing navigator as online', () => {
    expect(onlineNow({ onLine: false })).toBe(false);
    expect(onlineNow({ onLine: true })).toBe(true);
    expect(onlineNow(undefined)).toBe(true);
  });

  it('notifies on offline and online events and unsubscribes cleanly', () => {
    const target = new EventTarget();
    const cb = vi.fn();
    const off = subscribeOnline(cb, target);
    target.dispatchEvent(new Event('offline'));
    target.dispatchEvent(new Event('online'));
    expect(cb).toHaveBeenCalledTimes(2);
    off();
    target.dispatchEvent(new Event('offline'));
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('is a no-op subscription without a window', () => {
    expect(() => subscribeOnline(() => undefined, undefined)()).not.toThrow();
  });

  it('the hook returns the current navigator state', () => {
    let seen: boolean | undefined;
    const Probe = () => {
      seen = useOnline();
      return null;
    };
    vi.stubGlobal('navigator', { onLine: false });
    renderToString(createElement(Probe));
    expect(seen).toBe(false);
    vi.stubGlobal('navigator', { onLine: true });
    renderToString(createElement(Probe));
    expect(seen).toBe(true);
  });

  it('savedPackIds keeps only saved packs with an id', () => {
    const ids = savedPackIds([
      { packId: 'spa.MRK-1-1-13', saved: true },
      { packId: 'spa.MRK-1-14-20', saved: false },
      { saved: true },
    ]);
    expect([...ids]).toEqual(['spa.MRK-1-1-13']);
  });
});

describe('ScreenFrame offline chip', () => {
  const frame = () =>
    renderToString(
      createElement(MemoryRouter, null, createElement(ScreenFrame, { id: 'S02', title: 'x' })),
    );
  it('shows ⊘ Offline in the header when navigator is offline', () => {
    vi.stubGlobal('navigator', { onLine: false });
    const html = frame();
    expect(html).toMatch(/<header[^>]*>.*data-role="offline-chip".*<\/header>/s);
    expect(html).toContain('⊘');
    expect(html).toContain(EN['s.common.offline-chip']);
  });
  it('shows no chip when online', () => {
    vi.stubGlobal('navigator', { onLine: true });
    expect(frame()).not.toContain('data-role="offline-chip"');
  });
});
