// Shared state vocabulary for the Alpha design-system components (design/alpha-system/components/*.md).
// Every component takes `state`; the union is the superset of the States tables.
export type UiState =
  | 'default'
  | 'pressed'
  | 'focus'
  | 'disabled'
  | 'loading'
  | 'offline'
  | 'error'
  | 'empty'
  | 'playing'
  | 'paused'
  | 'finished'
  | 'countdown'
  | 'save-intent'
  | 'discussion-stop'
  | 'large-print'
  | 'rtl';

/** Provenance vocabulary (contract C-06 `status`, rendered as user-word chips, never glyphs). */
export type Provenance = 'source' | 'ai-voice' | 'ai-translation' | 'absent';

export type ResourceType = 'guide' | 'scripture' | 'terms' | 'images' | 'video' | 'audio';
export type CoverageLevel = 'available' | 'ai' | 'absent';

export interface StateProps {
  state?: UiState;
  className?: string;
}

export const stateAttrs = (state: UiState = 'default', role?: string) => ({
  'data-state': state,
  ...(role ? { 'data-role': role } : {}),
  'aria-disabled': state === 'disabled' || state === 'loading' ? true : undefined,
});
