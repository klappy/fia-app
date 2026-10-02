import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DiscussionStopBand, SecondaryAction, TextBlock } from '../components';
import { COUNTDOWN_MS, PRIMARY_KEY, UNDO_MS, primaryAction, primaryKind } from '../flow/machine';
import { indexOf, isLast, isScriptureCue, stopAt, unitAt } from '../flow/model';
import { FlowGate, StageProgress, ViewToggle } from '../flow/ui/GuideChrome';
import { useGuide } from '../flow/ui/useGuide';
import { t } from '../i18n';
import { DiscussionStopSheet } from './SH2DiscussionStop';
import { ScreenFrame } from './ScreenFrame';

// S05 Guide (05-guide.md): one unit at a time with "more ahead" (R-401), exactly one primary
// (R-402), quiet Back/Skip (R-403), two-level progress (R-405), persistent states (R-406),
// nothing plays unless Play is pressed (R-407), countdown/stop (R-408), resume (R-410).
export default function S05Guide() {
  const nav = useNavigate();
  const { session, snap } = useGuide();
  const { guide, state } = snap;
  const [collapsed, setCollapsed] = useState(false);

  const phase = state?.phase;
  useEffect(() => {
    if (phase !== 'countdown') return;
    const id = setTimeout(() => session.dispatch({ type: 'countdown-done' }), COUNTDOWN_MS);
    return () => clearTimeout(id);
  }, [phase, session]);

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
      <ScreenFrame id="S05" primaryLabel={null}>
        <FlowGate
          status={snap.guideStatus}
          hasPack={!!snap.packId}
          onRetry={() => void session.loadGuide(true)}
        />
      </ScreenFrame>
    );
  }

  const unit = unitAt(guide, indexOf(guide, state.unitId))!;
  const kind = primaryKind(guide, state);
  const atStop = state.phase === 'stop';
  const lastStop = atStop && isLast(guide, state.unitId);
  const label = lastStop ? t('s.stop.primary.finish') : t(PRIMARY_KEY[kind]);
  const sheetOpen = atStop && !state.stopSheetSeen && !collapsed;
  const stop = stopAt(guide, state.unitId);
  const cue = isScriptureCue(unit, guide.title);
  const uiState = atStop
    ? 'discussion-stop'
    : state.phase === 'countdown'
      ? 'countdown'
      : state.phase === 'playing'
        ? 'playing'
        : 'default';

  const press = () => {
    if (atStop) {
      setCollapsed(false);
      session.dispatch({ type: 'stop-sheet-seen' });
    }
    session.dispatch(primaryAction(kind));
  };

  return (
    <ScreenFrame
      id="S05"
      title={guide.title}
      primaryLabel={sheetOpen ? null : label}
      primaryState={uiState}
      onPrimary={press}
    >
      <div data-phase={state.phase} data-unit-id={state.unitId}>
        <StageProgress guide={guide} state={state} />
        <ViewToggle active="guide" onView={(v) => session.setView(v)} />
        {snap.changed.includes(state.unitId) && (
          <p className="fia-notice" role="status">
            {t('s.guide.unit-changed')}
          </p>
        )}
        {atStop && (
          <DiscussionStopBand
            lead={`💬 ${t('s.guide.stop-band')}`}
            body={state.stopSheetSeen || collapsed ? t('s.stop.band') : undefined}
            state="discussion-stop"
          />
        )}
        <TextBlock
          kind="guide"
          lang={guide.language}
          segments={[{ id: unit.id, text: unit.text }]}
          state={atStop ? 'discussion-stop' : 'default'}
        />
        {cue && (
          <SecondaryAction
            label={t('s.guide.read-scripture', { ref: guide.title })}
            onPress={() => nav('/scripture')}
          />
        )}
        {state.undo && (
          <DiscussionStopBand
            lead={`💬 ${t('s.stop.undo-band')}`}
            undoLabel={t('s.stop.undo')}
            onUndo={() => session.dispatch({ type: 'undo' })}
          />
        )}
        {!state.hasAudio && (
          <p className="fia-transport fia-caption" role="note">
            <span className="fia-mark fia-mark--absent">◌</span> {t('s.guide.no-audio-reason')}
          </p>
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
      {stop && (
        <DiscussionStopSheet
          guide={guide}
          state={state}
          open={sheetOpen}
          onContinue={press}
          onCollapse={() => {
            setCollapsed(true);
            session.dispatch({ type: 'stop-sheet-seen' });
          }}
        />
      )}
    </ScreenFrame>
  );
}
