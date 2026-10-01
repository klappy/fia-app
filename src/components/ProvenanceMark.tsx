import { markWords } from '../media/marks';
import { stateAttrs, type Provenance, type StateProps } from './types';

// provenance-mark.md — icon + user-word chip, never bracket glyphs (README § Marks). AI-made
// content always carries its mark (C-06); tapping the mark opens sheet 20 (SH-1) when wired.
export interface ProvenanceMarkProps extends StateProps {
  provenance: Provenance;
  /** autonym for `not yet in {language}` / `AI voice · {language}` */
  language?: string;
  /** opens the provenance sheet (SH-1); renders the chip as a button */
  onInfo?: () => void;
}

const ICON: Record<Provenance, string> = {
  source: '🎙',
  'ai-voice': '✦',
  'ai-translation': '✦',
  absent: '◌',
};
export function ProvenanceMark({
  provenance,
  language = '',
  onInfo,
  state = 'default',
  className,
}: ProvenanceMarkProps) {
  const cls = ['fia-mark', `fia-mark--${provenance}`, className].filter(Boolean).join(' ');
  const body = (
    <>
      <span aria-hidden>{ICON[provenance]}</span> {markWords(provenance, language)}
    </>
  );
  return onInfo ? (
    <button type="button" className={cls} onClick={onInfo} {...stateAttrs(state)}>
      {body}
    </button>
  ) : (
    <span className={cls} {...stateAttrs(state)}>
      {body}
    </span>
  );
}
