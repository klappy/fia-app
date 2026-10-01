import { stateAttrs, type StateProps } from './types';

// download-tier-picker.md — tier rows (Text · Phone · Full) with size, one-line help and time; progress ring.
export type Tier = 'text' | 'phone' | 'full';

export interface TierRow {
  tier: Tier;
  label: string;
  mb: number;
  help?: string;
  recommended?: boolean;
}

export interface DownloadTierPickerProps extends StateProps {
  tiers: TierRow[];
  value?: Tier;
  onChange?: (tier: Tier) => void;
  /** 0..1 when a save is running */
  progress?: number;
  progressLine?: string;
}

export function DownloadTierPicker({
  tiers,
  value,
  onChange,
  progress,
  progressLine,
  state = 'default',
  className,
}: DownloadTierPickerProps) {
  return (
    <div
      className={['fia-tiers', className].filter(Boolean).join(' ')}
      role="radiogroup"
      {...stateAttrs(state)}
    >
      {tiers.map((r) => (
        <label
          key={r.tier}
          className="fia-tiers__row"
          data-recommended={r.recommended || undefined}
        >
          <input
            type="radio"
            name="tier"
            value={r.tier}
            checked={value === r.tier}
            onChange={() => onChange?.(r.tier)}
            disabled={state === 'disabled'}
          />
          <span>
            {r.label} · {r.mb} MB
          </span>
          {r.help && <span className="fia-caption">{r.help}</span>}
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
