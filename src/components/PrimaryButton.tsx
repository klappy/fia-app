import type { ReactNode } from 'react';
import { stateAttrs, type StateProps } from './types';

// primary-button.md — the one action at the thumb slot. Position and width never change;
// only fill, icon and label change between states. One per screen (`data-role="primary"`).
export interface PrimaryButtonProps extends StateProps {
  label: string;
  icon?: ReactNode;
  onPress?: () => void;
  /** `s.common.a11y.primary-hint` */
  hint?: string;
  /** auto-continue countdown ring, 0..1 */
  countdown?: number;
}

export function PrimaryButton({
  label,
  icon,
  onPress,
  hint,
  state = 'default',
  className,
}: PrimaryButtonProps) {
  return (
    <button
      type="button"
      className={['fia-primary', className].filter(Boolean).join(' ')}
      {...stateAttrs(state, 'primary')}
      onClick={state === 'disabled' || state === 'loading' ? undefined : onPress}
      aria-describedby={hint ? 'fia-primary-hint' : undefined}
    >
      <span className="fia-primary__icon" aria-hidden>
        {icon ?? '▶'}
      </span>
      <span className="fia-primary__label">{label}</span>
      {hint && (
        <span id="fia-primary-hint" hidden>
          {hint}
        </span>
      )}
    </button>
  );
}
