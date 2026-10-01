import { useNavigate } from 'react-router-dom';
import { SecondaryAction } from '../components';
import { skippedStops, units, waitingStops } from '../flow/model';
import { FlowGate, StageProgress } from '../flow/ui/GuideChrome';
import { useGuide } from '../flow/ui/useGuide';
import { t } from '../i18n';
import { ScreenFrame } from './ScreenFrame';

// S18 Completion (18-completion.md, R-415): quiet done state, counts from the C-11 record
// (played and discussed never collapse into one number, R-410); nothing plays or navigates.
export default function S18Completion() {
  const nav = useNavigate();
  const { session, snap } = useGuide();
  const { guide, state } = snap;
  if (!guide || !state) {
    return (
      <ScreenFrame id="S18" dockActive="guide" primaryLabel={null}>
        <FlowGate
          status={snap.guideStatus}
          hasPack={!!snap.packId}
          onRetry={() => void session.loadGuide(true)}
        />
      </ScreenFrame>
    );
  }
  const stops = waitingStops(guide).length;
  const d = state.discussed.length;
  const k = skippedStops(
    guide,
    units(guide).map((u) => u.id),
    state.discussed,
  ).length;
  return (
    <ScreenFrame
      id="S18"
      title={guide.title}
      dockActive="guide"
      primaryLabel={t('s.completion.primary.start-again')}
      onPrimary={() => {
        session.dispatch({ type: 'restart' });
        session.setView('guide');
        nav('/guide');
      }}
    >
      <StageProgress guide={guide} state={state} complete />
      <div className="fia-done" role="status">
        <span className="fia-done__mark" aria-hidden>
          ✓
        </span>
        <h2>{t('s.completion.headline', { passage: guide.title })}</h2>
        <p>
          {t('s.completion.summary', {
            stages: guide.steps.length,
            units: units(guide).length,
            stops,
          })}
        </p>
        <p>
          {k > 0
            ? t('s.completion.discussed-skipped', { d, stops, k })
            : t('s.completion.discussed', { d, stops })}
        </p>
        <p className="fia-caption">{t('s.completion.marks-kept')}</p>
      </div>
      <h3 className="fia-caption">{t('s.completion.next')}</h3>
      <SecondaryAction
        label={`${t('s.completion.another-passage')} ⟶`}
        onPress={() => nav('/pericopes')}
      />
      <SecondaryAction
        label={`${t('s.completion.send-feedback')} ⟶`}
        onPress={() => nav('/feedback?from=S18')}
      />
      {k > 0 && (
        <SecondaryAction
          label={t('s.completion.review-skipped')}
          onPress={() => nav('/overview')}
        />
      )}
    </ScreenFrame>
  );
}
