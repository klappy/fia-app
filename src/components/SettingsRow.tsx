import type { ReactNode } from 'react';
import { t } from '../i18n';
import { GlassToggle } from './glass';
import { stateAttrs, type StateProps } from './types';

// settings-row.md on glass (F6-S14; mock design/alpha-v2-screens/14-settings.html ToggleRow): icon · label
// over its note (consequence) · control. 48 px floor; at 200% and 310% text the control drops under the
// label (PRD § 8.5). Styles: src/tokens/alpha.css hand-written block (`.fia-srow`).
export interface SettingsRowProps extends StateProps {
  label: string;
  control: ReactNode;
  consequence?: ReactNode;
  /** Leading icon (kit `Icon` or a marked kit-gap glyph). */
  icon?: ReactNode;
  onPress?: () => void;
}

export function SettingsRow({
  label,
  control,
  consequence,
  icon,
  onPress,
  state = 'default',
  className,
}: SettingsRowProps) {
  return (
    <div
      className={['fia-srow', className].filter(Boolean).join(' ')}
      onClick={onPress}
      {...stateAttrs(state)}
    >
      <div className="fia-srow__text">
        <div className="fia-srow__label fia-type-label fia-fw-semibold fia-lh-125 fia-tone-title">
          {icon}
          <span>{label}</span>
        </div>
        {consequence && <div className="fia-caption fia-srow__note">{consequence}</div>}
      </div>
      <div className="fia-srow__control">{control}</div>
    </div>
  );
}

/**
 * Toggle for settings rows: the kit's GlassToggle (forms/GlassToggle) with the On/Off word beside it,
 * so the track colour is never the only signal (R-604). The word is aria-hidden: the switch carries
 * role, label and aria-checked.
 */
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
    <span className="fia-srow__toggle fia-switch fia-switch--knob">
      <span
        className="fia-srow__state fia-type-caption fia-fw-semibold fia-lh-100 fia-tone-muted"
        aria-hidden="true"
      >
        {on ? t('s.settings.on') : t('s.settings.off')}
      </span>
      <GlassToggle checked={on} aria-label={label} onChange={onChange} style={{ padding: 0 }} />
    </span>
  );
}
