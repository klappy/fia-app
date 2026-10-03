// Apply C-10 display settings to <html> (tokens read data-theme / data-text-step; alpha.css).
// Text steps 100 / 150 / 200 / 310% (PRD § 8.5): x150 / x200 / x310 scales live in alpha.css's
// hand-written block; the generated plus2/max steps (which hide captions) are no longer set.
// Beside the step, the mock's two flags (cookbook design/alpha-v2-screens/_frame.js:20-21):
// html.fia-scaled (any step above 1×) and html.fia-big (200% and 310%), which the shared
// stylesheet (frame/frame.css) and every screen's large-text rules key on.
import type { Settings } from './settings';

export const TEXT_STEP_ATTR: Record<Settings['textSize'], string | null> = {
  system: null,
  large: 'x150',
  max: 'x200',
  huge: 'x310',
};

export function applyToDocument(
  s: Settings,
  root: HTMLElement | undefined = globalThis.document?.documentElement,
) {
  if (!root) return;
  if (s.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', s.theme);
  const step = TEXT_STEP_ATTR[s.textSize];
  if (step) root.setAttribute('data-text-step', step);
  else root.removeAttribute('data-text-step');
  setScaleFlags(root, step);
  root.toggleAttribute('data-low-literacy', s.lowLiteracy);
}

const BIG_STEPS = new Set(['x200', 'x310']);

/** html.fia-scaled / html.fia-big from html[data-text-step] (_frame.js:20-21). */
export function syncScaleFlags(root: HTMLElement) {
  setScaleFlags(root, root.getAttribute('data-text-step'));
}

function setScaleFlags(root: HTMLElement, step: string | null) {
  // Optional chaining: unit tests hand in a bare attribute stub without classList.
  root.classList?.toggle('fia-scaled', step != null);
  root.classList?.toggle('fia-big', step != null && BIG_STEPS.has(step));
}

/** Keeps the flags in step with any later write of data-text-step (S14 live, tests); returns stop. */
export function watchScaleFlags(root: HTMLElement = globalThis.document?.documentElement) {
  if (!root || typeof MutationObserver === 'undefined') return () => {};
  syncScaleFlags(root);
  const mo = new MutationObserver(() => syncScaleFlags(root));
  mo.observe(root, { attributes: true, attributeFilter: ['data-text-step'] });
  return () => mo.disconnect();
}
