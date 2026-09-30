import { t } from '../i18n';
import { SecondaryAction } from './SecondaryAction';
import { stateAttrs, type StateProps } from './types';

// absent-badge.md — "not yet in <language>" with the fallback offer (R-305 ladder), never a dead end.
export interface AbsentBadgeProps extends StateProps {
  language: string;
  fallbackLabel?: string;
  onFallback?: () => void;
}

export function AbsentBadge({
  language,
  fallbackLabel,
  onFallback,
  state = 'default',
  className,
}: AbsentBadgeProps) {
  return (
    <div className={['fia-absent', className].filter(Boolean).join(' ')} {...stateAttrs(state)}>
      <span className="fia-mark fia-mark--absent">◌ {t('s.common.mark.absent', { language })}</span>
      {fallbackLabel && <SecondaryAction label={fallbackLabel} onPress={onFallback} />}
    </div>
  );
}
