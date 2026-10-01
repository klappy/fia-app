import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DiscussionStopBand, SecondaryAction, TextBlock } from '../components';
import { PRIMARY_KEY, UNDO_MS, primaryAction, primaryKind } from '../flow/machine';
import { indexOf, isLast, position, unitAt } from '../flow/model';
import { FlowGate, StageProgress, ViewToggle } from '../flow/ui/GuideChrome';
import { useGuide } from '../flow/ui/useGuide';
import { t } from '../i18n';
import { ScreenFrame } from './ScreenFrame';

// S06 Single-script view (06-single-script.md, R-411): the same units and the same primary as
// 05, plain — no cards, no media chrome. Position is the shared session state, so toggling
// between Guide / Text / Overview never moves it.
export default function S06SingleScript() {
  const nav = useNavigate();
  const { session, snap } = useGuide();
  const { guide, state } = snap;

  const undo = state?.undo;
  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => session.dispatch({ type: 'undo-expired' }), UNDO_MS);
    return () => clearTimeout(id);
  }, [undo, session]);
  const finished = state?.finished;
  useEffect(() => {
    if (finished) nav('/done');
  }, [finished, nav]);

  if (!guide || !state) {
    return (
      <ScreenFrame id="S06" dockActive="guide" primaryLabel={null}>
        <FlowGate
          status={snap.guideStatus}
          hasPack={!!snap.packId}
          onRetry={() => void session.loadGuide(true)}
        />
      </ScreenFrame>
    );
  }
  const unit = unitAt(guide, indexOf(guide, state.unitId))!;
  const p = position(guide, state.unitId);
  const kind = primaryKind(guide, state);
  const atStop = state.phase === 'stop';
  // Text-first: without narration the primary reads plain Continue (06 § States default).
  const label =
    kind === 'no-audio' || kind === 'continue'
      ? t('s.script.primary-continue')
      : t(PRIMARY_KEY[kind]);
  return (
    <ScreenFrame
      id="S06"
      title={guide.title}
      dockActive="guide"
      primaryLabel={label}
      primaryState={atStop ? 'discussion-stop' : 'default'}
      onPrimary={() => session.dispatch(primaryAction(kind))}
    >
      <div data-phase={state.phase} data-unit-id={state.unitId}>
        <StageProgress guide={guide} state={state} />
        <ViewToggle active="single-script" onView={(v) => session.setView(v)} />
        <h2 className="fia-caption">
          {t('s.script.step-heading', { stage: p.stageTitle, n: p.stageIndex + 1 })}
        </h2>
        {atStop && (
          <DiscussionStopBand lead={`💬 ${t('s.guide.stop-band')}`} state="discussion-stop" />
        )}
        <TextBlock
          kind="guide"
          lang={guide.language}
          segments={[{ id: unit.id, text: unit.text }]}
          state={atStop ? 'discussion-stop' : 'default'}
        />
        {unit.resources.length > 0 && (
          <p className="fia-caption">
            {t('s.script.resources-line', { n: unit.resources.length })}
          </p>
        )}
        {state.undo && (
          <DiscussionStopBand
            lead={`💬 ${t('s.stop.undo-band')}`}
            undoLabel={t('s.stop.undo')}
            onUndo={() => session.dispatch({ type: 'undo' })}
          />
        )}
        <div className="fia-secondaries">
          <SecondaryAction
            label={t('s.guide.back-unit')}
            icon="⟵"
            half
            state={indexOf(guide, state.unitId) === 0 ? 'disabled' : 'default'}
            onPress={() => session.dispatch({ type: 'back' })}
          />
          <SecondaryAction
            label={t('s.guide.skip-ahead')}
            icon="⟶"
            half
            state={isLast(guide, state.unitId) ? 'disabled' : 'default'}
            onPress={() => session.dispatch({ type: 'skip' })}
          />
        </div>
      </div>
    </ScreenFrame>
  );
}
