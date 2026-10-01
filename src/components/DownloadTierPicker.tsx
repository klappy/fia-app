import { stateAttrs, type StateProps } from './types';

// download-tier-picker.md — tier rows (Text · Phone · Medium · Original, C-07 / R-306) with size,
// one-line help and the recommended chip; progress line while a save runs. Labels arrive
// translated: this component holds no copy of its own.
export type Tier = 'text' | 'phone' | 'medium' | 'original';

export interface TierRow {
  tier: Tier;
  label: string;
  /** Size already formatted for the locale, e.g. `t('s.passage.tier-size', { mb })`. */
  size: string;
  help?: string;
  /** Translated `recommended` chip text; rendered only when set. */
  recommended?: string;
}

export interface DownloadTierPickerProps extends StateProps {
  tiers: TierRow[];
  value?: Tier;
  onChange?: (tier: Tier) => void;
  /** Accessible name of the radio group (the section heading). */
  label?: string;
  /** 0..1 when a save is running */
  progress?: number;
  progressLine?: string;
}

export function DownloadTierPicker({
  tiers,
  value,
  onChange,
  label,
  progress,
  progressLine,
  state = 'default',
  className,
}: DownloadTierPickerProps) {
  return (
    <div
      className={['fia-tiers', className].filter(Boolean).join(' ')}
      role="radiogroup"
      aria-label={label}
      {...stateAttrs(state)}
    >
      {tiers.map((r) => (
        <label
          key={r.tier}
          className="fia-tiers__row"
          data-tier={r.tier}
          data-recommended={r.recommended ? true : undefined}
        >
          <input
            type="radio"
            name="tier"
            value={r.tier}
            checked={value === r.tier}
            onChange={() => onChange?.(r.tier)}
            disabled={state === 'disabled'}
          />
          <span className="fia-tiers__text">
            <span className="fia-tiers__name">
              {r.label}
              {r.recommended && <span className="fia-chip fia-tiers__rec">{r.recommended}</span>}
            </span>
            {r.help && <span className="fia-caption">{r.help}</span>}
          </span>
          <span className="fia-tiers__size" data-testid={`tier-size-${r.tier}`}>
            {r.size}
          </span>
        </label>
      ))}
      {progress !== undefined && (
        <div
          className="fia-tiers__progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          {progressLine}
        </div>
      )}
    </div>
  );
}
