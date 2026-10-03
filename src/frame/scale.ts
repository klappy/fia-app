import { useSyncExternalStore } from 'react';

// Text scale of the shared app layer (mock head work, cookbook design/alpha-v2-screens/_frame.js:12-21, 40-42).
// C-10 text size → html[data-text-step] (settings/apply.ts) → 1 · 1.5 · 2 · 3.1, the mock's --fia-text-scale.
// One reader for every screen: S02, S03, S04, S18 and S19 each kept their own copy of it.

const STEP_SCALE: Record<string, number> = { x150: 1.5, x200: 2, x310: 3.1 };

/** The current scale, read once (1 when there is no document). */
export const readScale = () =>
  STEP_SCALE[globalThis.document?.documentElement.getAttribute('data-text-step') ?? ''] ?? 1;

/** 200% and 310% (mock html.fia-big, scale >= 2). */
export const readBig = () => readScale() >= 2;

/** Calls `f` whenever the text step changes; returns the unsubscribe. */
export const watchScale = (f: () => void) => {
  const mo = new MutationObserver(f);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-text-step'] });
  return () => mo.disconnect();
};

/** 1 · 1.5 · 2 · 3.1, live. */
export const useTextScale = (): number => useSyncExternalStore(watchScale, readScale, () => 1);

/** 200% and 310% text, live (mock `big`). */
export const useBig = (): boolean => useSyncExternalStore(watchScale, readBig, () => false);

/** Icon box: base × min(scale, 2) (mock iconSz, _frame.js:41). */
export const iconSz = (base: number, scale: number) => Math.round(base * Math.min(scale, 2));
