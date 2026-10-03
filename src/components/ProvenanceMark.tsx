import { markWords } from '../media/marks';
import { GlassChip, Icon, type KitIconName } from './glass';
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

// ── v2 chip (PRD § 3 provenance-mark: kit GlassChip with icon + word; mock ProvenanceChip) ──────────

export interface ProvenanceChipProps {
  provenance: Provenance;
  /** the chip's word ("AI voice", "No voice for this part") */
  words: string;
  /** accessible name of the button ("AI voice. About this voice") */
  ariaLabel?: string;
  iconSize?: number;
  /** opens sheet 20 (S20); without it the chip is a status mark, not a control */
  onInfo?: () => void;
}

const CHIP_ICON: Record<Provenance, KitIconName> = {
  source: 'mic',
  'ai-voice': 'sparkle',
  'ai-translation': 'sparkle',
  absent: 'info',
};

/** The honesty marker in the guide card (AI is always named; never shown as source, C-06). */
export function ProvenanceChip({
  provenance,
  words,
  ariaLabel,
  iconSize = 14,
  onInfo,
}: ProvenanceChipProps) {
  const chip = (
    <GlassChip
      className={`fia-chip fia-prov-chip fia-prov-chip--${provenance}`}
      leading={<Icon name={CHIP_ICON[provenance]} size={iconSize} />}
    >
      {words}
    </GlassChip>
  );
  return onInfo ? (
    <button
      type="button"
      className="fia-chip-btn"
      aria-haspopup="dialog"
      aria-label={ariaLabel ?? words}
      data-provenance={provenance}
      onClick={onInfo}
    >
      {chip}
    </button>
  ) : (
    <span className="fia-chip-mark" data-provenance={provenance}>
      {chip}
    </span>
  );
}
