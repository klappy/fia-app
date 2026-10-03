// @vitest-environment happy-dom
// F6-S14 review 2 (R-706): when saving fails, the toast must render where it can be seen — a fixed
// child of the S14 page over the sheet, not static after the 100% sheet inside a clipped field.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import S14Settings from '../src/screens/S14Settings';
import { EN } from '../src/i18n';
import { SETTINGS_KEY } from '../src/settings/settings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const realSet = Storage.prototype.setItem;

beforeEach(() => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, v) {
    if (k === SETTINGS_KEY) throw new DOMException('quota', 'QuotaExceededError');
    realSet.call(this, k, v);
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe('S14 save-failed toast', () => {
  it('shows the alert as a fixed toast on the page, outside the sheet', () => {
    act(() =>
      root.render(
        createElement(MemoryRouter, { initialEntries: ['/settings'] }, createElement(S14Settings)),
      ),
    );
    expect(host.querySelector('[role="alert"]')).toBeNull();
    const dark = [...host.querySelectorAll<HTMLElement>('[role="radio"]')].find((b) =>
      b.textContent?.includes(EN['s.settings.theme.dark']),
    );
    act(() => dark!.click());
    const alert = host.querySelector<HTMLElement>('[role="alert"]');
    expect(alert?.textContent).toContain(EN['s.settings.save-failed']);
    expect(alert?.classList.contains('s14-toast')).toBe(true);
    expect(alert?.parentElement?.classList.contains('s14-page')).toBe(true);
    expect(alert?.closest('[role="dialog"]')).toBeNull();
  });
});
