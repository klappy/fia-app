import { t } from '../i18n';
import { stateAttrs, type CoverageLevel, type ResourceType, type StateProps } from './types';

// coverage-chips.md — per resource type: available · AI-filled · not yet (R-304); tap → S19.
export interface CoverageChipsProps extends StateProps {
  coverage: Partial<Record<ResourceType, CoverageLevel>>;
  onOpenCoverage?: () => void;
}

const TYPES: ResourceType[] = ['guide', 'scripture', 'terms', 'images', 'video', 'audio'];
const LEVEL_KEY: Record<CoverageLevel, string> = {
  available: 's.lang.cov.available',
  ai: 's.lang.cov.ai',
  absent: 's.lang.cov.absent',
};

export function CoverageChips({
  coverage,
  onOpenCoverage,
  state = 'default',
  className,
}: CoverageChipsProps) {
  return (
    <div className={['fia-coverage', className].filter(Boolean).join(' ')} {...stateAttrs(state)}>
      <ul className="fia-coverage__list">
        {TYPES.filter((k) => coverage[k]).map((k) => (
          <li key={k} data-level={coverage[k]}>
            {t(`s.lang.cov.${k}`)} · {t(LEVEL_KEY[coverage[k]!])}
          </li>
        ))}
      </ul>
      {onOpenCoverage && (
        <button type="button" className="fia-coverage__open" onClick={onOpenCoverage}>
          {t('s.common.coverage-chip')} ⟶
        </button>
      )}
    </div>
  );
}
