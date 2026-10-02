// Shared top chrome of the guide family (05/06/07/18): stage rail + beads with their text lines
// (R-405: two levels, never a bare "1/6") and the Guide · Text · Overview toggle.
import { useNavigate } from 'react-router-dom';
import { ProgressRail } from '../../components';
import { t } from '../../i18n';
import { AbsentBadge } from '../../components';
import { useNotYet } from '../ready';
import type { FlowState } from '../machine';
import { position, skippedStops } from '../model';
import type { View } from '../store';
import type { FlowGuide } from '../types';

export function StageProgress({
  guide,
  state,
  complete,
}: {
  guide: FlowGuide;
  state: FlowState;
  complete?: boolean;
}) {
  const p = position(guide, state.unitId);
  const step = guide.steps[p.stageIndex];
  const skipped = skippedStops(guide, state.visited, state.discussed)
    .map((s) => step.units.findIndex((u) => u.id === s.afterUnitId))
    .filter((i) => i >= 0);
  const n = p.stageIndex + 1;
  const unitN = complete ? p.unitCount : p.unitIndex + 1;
  return (
    <div className="fia-flow-progress" data-stage={n} data-unit={unitN}>
      <ProgressRail
        stages={guide.steps.map((s) => s.title)}
        currentStage={complete ? guide.steps.length : p.stageIndex}
        units={p.unitCount}
        currentUnit={complete ? p.unitCount : p.unitIndex}
        skipped={skipped}
        state={complete ? 'finished' : 'default'}
      />
      <p
        className="fia-caption"
        aria-label={t('s.guide.a11y.stage-rail', { n, stage: p.stageTitle })}
      >
        {complete
          ? t('s.completion.stage-label', { stageName: p.stageTitle, n })
          : t('s.guide.stage-line', { stage: p.stageTitle, n })}
      </p>
      <p
        className="fia-caption"
        aria-label={t('s.guide.a11y.beads', {
          n: unitN,
          m: p.unitCount,
          discussed: state.discussed.length,
          skipped: skipped.length,
        })}
      >
        {complete
          ? t('s.completion.beads-label', { m: p.unitCount })
          : `${t('s.guide.unit-line', { n: unitN, m: p.unitCount })}${
              p.moreAhead ? ` · ${t('s.guide.more-ahead')}` : ''
            }`}
      </p>
    </div>
  );
}

const VIEWS: { view: View; key: string; path: string }[] = [
  { view: 'guide', key: 's.guide.view.guided', path: '/guide' },
  { view: 'single-script', key: 's.guide.view.script', path: '/script' },
  { view: 'overview', key: 's.guide.view.overview', path: '/overview' },
];

export function ViewToggle({ active, onView }: { active: View; onView: (v: View) => void }) {
  const nav = useNavigate();
  return (
    <div className="fia-segmented" role="tablist">
      {VIEWS.map((v) => (
        <button
          key={v.view}
          type="button"
          role="tab"
          aria-selected={v.view === active}
          className="fia-segmented__cell"
          onClick={() => {
            onView(v.view);
            nav(v.path);
          }}
        >
          {t(v.key)}
        </button>
      ))}
    </div>
  );
}

/** Loading / error / no-pack states for the guide family. */
export function FlowGate({
  status,
  hasPack,
  onRetry,
}: {
  status: string;
  hasPack: boolean;
  onRetry: () => void;
}) {
  const nav = useNavigate();
  const notYet = useNotYet();
  if (!hasPack)
    return (
      <button type="button" className="fia-secondary" onClick={() => nav('/library')}>
        {t('s.completion.another-passage')}
      </button>
    );
  // GAP-NOPACK: a listed passage this build has no pack for reads "not yet in {language}" with the
  // way to another passage (absent-badge.md: never a dead end), not "Could not read…".
  if (notYet)
    return (
      <AbsentBadge
        language={notYet}
        fallbackLabel={t('s.completion.another-passage')}
        onFallback={() => nav('/library')}
      />
    );
  if (status === 'error' && notYet !== undefined)
    return (
      <div role="alert">
        <p>{t('s.passage.error')}</p>
        <button type="button" className="fia-secondary" onClick={onRetry}>
          {t('s.common.try-again')}
        </button>
      </div>
    );
  return <p className="fia-caption" aria-busy="true" data-state="loading" />;
}
