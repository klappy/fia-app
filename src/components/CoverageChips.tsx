import { t } from '../i18n';
import { GlassButton, GlassChip, Icon } from './glass';
import { stateAttrs, type CoverageLevel, type ResourceType, type StateProps } from './types';

// coverage-chips.md on glass (F6-S02; PRD § 3 row 7): one kit glass/GlassChip per resource type,
// each led by its mark — ✓ available (source) · sparkle AI-filled · — not yet (R-304). The mark is
// icon + word, so colour is never the only signal. Tap "Coverage" → S19 (a quiet kit GlassButton).
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

function Mark({ level }: { level: CoverageLevel }) {
  if (level === 'available') return <Icon name="check" size={12} />;
  if (level === 'ai') return <Icon name="sparkle" size={12} />;
  // The kit has no dash glyph: the [—] mark is a typographic dash, named as a kit gap.
  return (
    <span aria-hidden="true" data-kit-gap="dash">
      —
    </span>
  );
}

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
            <GlassChip leading={<Mark level={coverage[k]!} />}>
              {`${t(`s.lang.cov.${k}`)} · ${t(LEVEL_KEY[coverage[k]!])}`}
            </GlassChip>
          </li>
        ))}
      </ul>
      {onOpenCoverage && (
        <GlassButton
          variant="quiet"
          size="sm"
          className="fia-coverage__open"
          trailing={<Icon name="chevronRight" size={14} />}
          onClick={onOpenCoverage}
        >
          {t('s.common.coverage-chip')}
        </GlassButton>
      )}
    </div>
  );
}
