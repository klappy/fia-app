import type { ReactNode } from 'react';
import { t } from '../i18n';
import { formatClock, sliderVisible } from '../media/seek';
import { markWords } from '../media/marks';
import { GlassButton, Icon } from './glass';
import { ProvenanceMark } from './ProvenanceMark';
import { stateAttrs, type Provenance, type StateProps } from './types';

// audio-controls.md — transport line: mark chip + `{elapsed} / {total}` + seek on every clip
// > 30 s (R-505, rule 10). The mark is always shown (R-503) and opens SH-1 via `onMarkInfo`.
export interface AudioControlsProps extends StateProps {
  provenance: Provenance;
  elapsedSec: number;
  totalSec: number;
  onSeek?: (sec: number) => void;
  /** `s.common.other-clip-playing` banner text when another owner's clip is playing */
  otherClipBanner?: string;
  onPauseOther?: () => void;
  /** language autonym for `AI voice · {language}` */
  language?: string;
  onMarkInfo?: () => void;
  /** quiet leading action, e.g. `s.scripture.replay-verse` */
  leading?: { label: string; onPress: () => void };
  /** trailing hint while not playing, e.g. `s.scripture.hint-timed` */
  hint?: string;
  /** v2 layers (S10): the mark is a ProvenanceChip elsewhere on the screen, so the line is time + seek only */
  hideMark?: boolean;
}

export function AudioControls({
  provenance,
  elapsedSec,
  totalSec,
  onSeek,
  otherClipBanner,
  onPauseOther,
  language,
  onMarkInfo,
  leading,
  hint,
  hideMark,
  state = 'default',
  className,
}: AudioControlsProps) {
  const elapsed = formatClock(elapsedSec);
  const total = formatClock(totalSec);
  return (
    <div className={['fia-transport', className].filter(Boolean).join(' ')} {...stateAttrs(state)}>
      {otherClipBanner && (
        <button type="button" className="fia-transport__other" onClick={onPauseOther}>
          {otherClipBanner}
        </button>
      )}
      <div className="fia-transport__line">
        {leading && (
          <button type="button" className="fia-secondary" onClick={leading.onPress}>
            ↺ {leading.label}
          </button>
        )}
        {!hideMark && (
          <ProvenanceMark provenance={provenance} language={language} onInfo={onMarkInfo} />
        )}
        <span className="fia-transport__time fia-num">
          {elapsed} / {total}
        </span>
        {hint && state !== 'playing' && <span className="fia-caption">{hint}</span>}
      </div>
      {sliderVisible(totalSec) && (
        <input
          type="range"
          min={0}
          max={totalSec}
          step={0.1}
          value={Math.min(elapsedSec, totalSec)}
          aria-label={t('s.term.a11y.transport', {
            mark: markWords(provenance, language),
            elapsed,
            total,
          })}
          onChange={(e) => onSeek?.(Number(e.target.value))}
          className="fia-transport__seek"
          disabled={state === 'disabled' || state === 'loading'}
        />
      )}
    </div>
  );
}

// ── v2 guide transport (PRD § 3 audio-controls, § 8.2; mock Transport, _frame.js:350-360) ───────────

interface TransportSide {
  label: string;
  ariaLabel?: string;
  disabled?: boolean;
  onPress: () => void;
}

export interface GuideTransportProps {
  /** the guide primary (GuidePrimary) — the one thing in the thumb slot */
  primary: ReactNode;
  /** "0:17 / 0:42"; null when the part has no voice (the status line is time only) */
  time?: string | null;
  /** quiet Back / Skip beside the primary; S08's reading has neither (its primary stands alone) */
  back?: TransportSide;
  skip?: TransportSide;
  /** icon box for the quiet buttons (18 × min(scale, 2)) */
  iconSize?: number;
  /**
   * 'all' (1×): time · Back · primary · Skip in the thumb zone. Above 1× the big button alone is the
   * sticky thumb zone ('primary') and the time line with Back · Skip sit in the column ('column').
   */
  part?: 'all' | 'primary' | 'column';
}

function Quiet({
  label,
  ariaLabel,
  disabled,
  onPress,
  icon,
  trailing,
  size,
}: TransportSide & { icon?: boolean; trailing?: boolean; size: number }) {
  return (
    <GlassButton
      variant="quiet"
      size="md"
      className="fia-btn fia-quiet"
      aria-label={ariaLabel}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      leading={icon ? <Icon name="chevronLeft" size={size} /> : undefined}
      trailing={trailing ? <Icon name="chevronRight" size={size} /> : undefined}
      onClick={disabled ? undefined : onPress}
    >
      {label}
    </GlassButton>
  );
}

export function GuideTransport({
  primary,
  time,
  back,
  skip,
  iconSize = 18,
  part = 'all',
}: GuideTransportProps) {
  const status = time ? (
    <div className="fia-status fia-num" role="status">
      {time}
    </div>
  ) : null;
  const b = back && <Quiet {...back} icon size={iconSize} />;
  const s = skip && <Quiet {...skip} trailing size={iconSize} />;
  if (part === 'primary') return <>{primary}</>;
  if (part === 'column')
    return (
      <div className="fia-transport-col">
        {status}
        <div className="fia-transport-row">
          {b}
          {s}
        </div>
      </div>
    );
  return (
    <div className="fia-transport-all">
      {status}
      <div className="fia-transport-row">
        {b}
        {primary}
        {s}
      </div>
    </div>
  );
}
