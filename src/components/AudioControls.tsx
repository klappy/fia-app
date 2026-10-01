import { ProvenanceMark } from './ProvenanceMark';
import { stateAttrs, type Provenance, type StateProps } from './types';

// audio-controls.md — transport line: mark chip + `{elapsed} / {total}` + seek ≥ 30 s (rule 10).
export interface AudioControlsProps extends StateProps {
  provenance: Provenance;
  elapsedSec: number;
  totalSec: number;
  onSeek?: (sec: number) => void;
  /** `s.common.other-clip-playing` banner text when another owner's clip is playing */
  otherClipBanner?: string;
  onPauseOther?: () => void;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function AudioControls({
  provenance,
  elapsedSec,
  totalSec,
  onSeek,
  otherClipBanner,
  onPauseOther,
  state = 'default',
  className,
}: AudioControlsProps) {
  return (
    <div className={['fia-transport', className].filter(Boolean).join(' ')} {...stateAttrs(state)}>
      {otherClipBanner && (
        <button type="button" className="fia-transport__other" onClick={onPauseOther}>
          {otherClipBanner}
        </button>
      )}
      <div className="fia-transport__line">
        <ProvenanceMark provenance={provenance} />
        <span className="fia-transport__time">
          {mmss(elapsedSec)} / {mmss(totalSec)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(totalSec, 1)}
        value={elapsedSec}
        aria-label="Seek"
        onChange={(e) => onSeek?.(Number(e.target.value))}
        className="fia-transport__seek"
        disabled={state === 'disabled' || state === 'loading'}
      />
    </div>
  );
}
