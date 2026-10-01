// Apply C-10 display settings to <html> (tokens read data-theme / data-text-step; alpha.css).
import type { Settings } from './settings';

export const TEXT_STEP_ATTR: Record<Settings['textSize'], string | null> = {
  system: null,
  large: 'plus2',
  max: 'max',
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
