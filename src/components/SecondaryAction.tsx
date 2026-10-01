import type { ReactNode } from 'react';
import { stateAttrs, type StateProps } from './types';

// secondary-action.md — quiet text + icon action; never a filled button (rule 2).
export interface SecondaryActionProps extends StateProps {
  label: string;
  icon?: ReactNode;
  onPress?: () => void;
  /** half-width row pairing at +2 (README: never full-row secondaries above the primary). */
  half?: boolean;
}

export function SecondaryAction({
  label,
  icon,
  onPress,
  half,
  state = 'default',
  className,
}: SecondaryActionProps) {
  return (
    <button
      type="button"
      className={['fia-secondary', half && 'fia-secondary--half', className]
        .filter(Boolean)
        .join(' ')}
      {...stateAttrs(state, 'secondary')}
      onClick={onPress}
    >
      {icon && <span aria-hidden>{icon}</span>}
      <span>{label}</span>
    </button>
  );
}
