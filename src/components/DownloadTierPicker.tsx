import { useLayoutEffect, useRef } from 'react';
import { GlassSegmented, Icon, type KitIconName } from './glass';
import { stateAttrs, type StateProps } from './types';
import './DownloadTierPicker.css';

// download-tier-picker (F6-S04; nodded mock design/alpha-v2-screens/04-passage-card.html SaveCard).
// PRD § 3 "app-owned, surfaces from the kit": the choice cells are kit forms/GlassSegmented with icon +
// word + size nodes (GlassSegmented.jsx:5 takes a node label); the app adds the rule the kit has no
// prop for: a tier the pack does not publish is shown with "not yet" under its word and cannot be
// chosen (aria-disabled on its radio, the tap ignored). The selected tier's note sits under the cells.
// Labels arrive translated: this component holds no copy of its own.
export type Tier = 'text' | 'phone' | 'medium' | 'original';

export interface TierRow {
  tier: Tier;
  /** The tier's word: Text · Phone · Full (mock). */
  label: string;
  /** Size already formatted ("0.5 MB"), or the not-yet word for a tier the pack does not publish. */
  size: string;
  /** What this tier saves; shown under the cells while it is the selected tier. */
  note?: string;
  /** A tier the pack does not publish yet: shown, not selectable. */
  disabled?: boolean;
}

export interface DownloadTierPickerProps extends StateProps {
  tiers: TierRow[];
  value?: Tier;
  onChange?: (tier: Tier) => void;
  /** Accessible name of the radio group ("How much to save"). */
  label?: string;
}

/** Kit glyph per tier (mock opt(): Text `book`, Phone `headphones`, Full `plus`). */
const ICON: Record<Tier, KitIconName> = {
  text: 'book',
  phone: 'headphones',
  medium: 'image',
  original: 'plus',
};

export function DownloadTierPicker({
  tiers,
  value,
  onChange,
  label,
  state = 'default',
  className,
}: DownloadTierPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const locked = state === 'disabled';
  // The kit's radios take no per-option attributes: mark the ones that cannot be chosen after render.
  useLayoutEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>('[role="radio"]').forEach((b, i) => {
      const row = tiers[i];
      if (!row) return;
      b.dataset.tier = row.tier;
      if (locked || row.disabled) b.setAttribute('aria-disabled', 'true');
      else b.removeAttribute('aria-disabled');
    });
  });
  const selected = tiers.find((r) => r.tier === value);
  return (
    <div
      ref={ref}
      className={['fia-tierpick', className].filter(Boolean).join(' ')}
      {...stateAttrs(state)}
    >
      <GlassSegmented
        className="fia-tierpick__cells"
        size="md"
        aria-label={label}
        value={value}
        options={tiers.map((r) => ({
          value: r.tier,
          label: (
            <span className="fia-tierpick__cell" data-disabled={r.disabled || undefined}>
              <Icon name={ICON[r.tier]} size={18} stroke={r.tier === value ? 2.2 : 1.7} />
              <span className="fia-tierpick__text">
                <span className="fia-tierpick__word">{r.label}</span>
                <span className="fia-tierpick__size" data-testid={`tier-size-${r.tier}`}>
                  {r.size}
                </span>
              </span>
            </span>
          ),
        }))}
        onChange={(v) => {
          const r = tiers.find((x) => x.tier === v);
          if (!r || r.disabled || locked || r.tier === value) return;
          onChange?.(r.tier);
        }}
      />
      {selected?.note && (
        <p className="fia-tierpick__note" data-testid="tier-note">
          {selected.note}
        </p>
      )}
    </div>
  );
}
