// Apply C-10 display settings to <html> (tokens read data-theme / data-text-step; alpha.css).
// Text steps 100 / 150 / 200 / 310% (PRD § 8.5): x150 / x200 / x310 scales live in alpha.css's
// hand-written block; the generated plus2/max steps (which hide captions) are no longer set.
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
  root.toggleAttribute('data-low-literacy', s.lowLiteracy);
}
