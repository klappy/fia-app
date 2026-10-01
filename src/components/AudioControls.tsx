import { t } from '../i18n';
import { formatClock, sliderVisible } from '../media/seek';
import { markWords } from '../media/marks';
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
        <ProvenanceMark provenance={provenance} language={language} onInfo={onMarkInfo} />
        <span className="fia-transport__time">
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
