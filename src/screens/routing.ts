import { t } from '../i18n';
import { SCREENS } from './registry';

/**
 * "Back to {where}" (S16): the screen the person returns to. A title that carries a placeholder
 * (S18 "You finished {passage}") is a headline, not a name, so the screen's name is used instead.
 */
export function whereName(from?: string): string {
  const def = SCREENS.find((x) => x.id === from);
  if (!def) return t('s.common.dock.guide');
  const title = def.titleKey ? t(def.titleKey) : '';
  return title && !/\{\w+\}/.test(title) ? title : def.name;
}

/**
 * S01 at `/`: once a language is chosen, reopening the app starts on the Library (S02) instead of
 * the picker. More → Language (`/?mode=use`) always shows the picker.
 */
export function firstRunRedirect(language: string | undefined, search: string): string | null {
  if (!language) return null;
  return new URLSearchParams(search).get('mode') === 'use' ? null : '/library';
}
