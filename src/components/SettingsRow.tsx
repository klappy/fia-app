import type { ReactNode } from 'react';
import { t } from '../i18n';
import { stateAttrs, type StateProps } from './types';

// settings-row.md — label + control + consequence line, 56 px.
export interface SettingsRowProps extends StateProps {
  label: string;
  control: ReactNode;
  consequence?: string;
  onPress?: () => void;
}

export function SettingsRow({
  label,
  control,
  consequence,
  onPress,
  state = 'default',
  className,
}: SettingsRowProps) {
  return (
    <div
      className={['fia-settings-row', className].filter(Boolean).join(' ')}
      onClick={onPress}
      {...stateAttrs(state)}
    >
      <div className="fia-settings-row__text">
        <span className="fia-label">{label}</span>
        {consequence && <span className="fia-caption">{consequence}</span>}
      </div>
      <div className="fia-settings-row__control">{control}</div>
    </div>
  );
}

/** Toggle control for settings rows: a labelled switch that always shows On/Off text (R-604). */
export function SettingsToggle({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="fia-toggle"
      data-on={on || undefined}
      onClick={() => onChange(!on)}
    >
      {on ? t('s.settings.on') : t('s.settings.off')}
    </button>
  );
}
