import type { Provenance } from '../components/types';
import { t } from '../i18n';

// User words for a provenance mark (R-313): never backend names, never a glyph alone.
export const MARK_KEY: Record<Provenance, string> = {
  source: 's.common.mark.source',
  'ai-voice': 's.common.mark.ai-voice',
  'ai-translation': 's.common.mark.ai-translation',
  absent: 's.common.mark.absent',
};

/** User words for a mark (for a11y strings such as `{mark}`). */
export const markWords = (provenance: Provenance, language = '') =>
  provenance === 'ai-voice' && language
    ? t('s.common.mark.ai-voice-lang', { language })
    : t(MARK_KEY[provenance], { language });
