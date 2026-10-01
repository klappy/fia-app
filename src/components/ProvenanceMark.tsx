import { t } from '../i18n';
import { stateAttrs, type Provenance, type StateProps } from './types';

// provenance-mark.md — icon + user-word chip, never bracket glyphs (README § Marks).
export interface ProvenanceMarkProps extends StateProps {
  provenance: Provenance;
  /** autonym for `not yet in {language}` / `AI voice · {language}` */
  language?: string;
}

const ICON: Record<Provenance, string> = {
  source: '🎙',
  'ai-voice': '✦',
  'ai-translation': '✦',
  absent: '◌',
};
const KEY: Record<Provenance, string> = {
  source: 's.common.mark.source',
  'ai-voice': 's.common.mark.ai-voice',
  'ai-translation': 's.common.mark.ai-translation',
  absent: 's.common.mark.absent',
};

export function ProvenanceMark({
  provenance,
  language = '',
  state = 'default',
  className,
}: ProvenanceMarkProps) {
  return (
    <span
      className={['fia-mark', `fia-mark--${provenance}`, className].filter(Boolean).join(' ')}
      {...stateAttrs(state)}
    >
      <span aria-hidden>{ICON[provenance]}</span> {t(KEY[provenance], { language })}
    </span>
  );
}
