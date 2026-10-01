import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { position, units } from '../flow/model';
import { FlowGate } from '../flow/ui/GuideChrome';
import { useGuide } from '../flow/ui/useGuide';
import { t } from '../i18n';
import { ScreenFrame } from './ScreenFrame';

const INCLUDES: [string, string][] = [
  ['guide', 's.passage.inc.guide'],
  ['scripture', 's.passage.inc.scripture'],
  ['term', 's.passage.inc.terms'],
  ['image', 's.passage.inc.images'],
  ['map', 's.passage.inc.maps'],
  ['video', 's.passage.inc.video'],
];

// S04 Passage card (04-passage-card.md): what the passage holds (C-03 resourceTypes), progress,
// one primary: Start / Continue · {stage} / Start again. The save row belongs to the offline lane.
export default function S04PassageCard() {
  const nav = useNavigate();
  const { session, snap } = useGuide();
  useEffect(() => void session.loadCatalog(), [session]);
  const entry = snap.manifest?.entries.find((e) => e.packId === snap.packId);
  const { guide, state } = snap;
  if (!guide || !state) {
    return (
      <ScreenFrame id="S04" title={entry?.title} dockActive="guide" primaryLabel={null}>
        <FlowGate
          status={snap.guideStatus}
          hasPack={!!snap.packId}
          onRetry={() => void session.loadGuide(true)}
        />
      </ScreenFrame>
    );
  }
  const started = state.visited.length > 1 || state.played.length > 0;
  const p = position(guide, state.unitId);
  const label = state.finished
    ? t('s.passage.primary-again')
    : started
      ? t('s.passage.primary-continue', { stage: p.stageTitle })
      : t('s.passage.primary-start');
  return (
    <ScreenFrame
      id="S04"
      title={guide.title}
      dockActive="guide"
      primaryLabel={label}
      onPrimary={() => {
        if (state.finished) session.dispatch({ type: 'restart' });
        session.setView('guide');
        nav('/guide');
      }}
    >
      <p className="fia-caption">
        {t('s.passage.meta', { stages: guide.steps.length, units: units(guide).length })}
      </p>
      {started && !state.finished && (
        <p className="fia-caption">
          {t('s.passage.progress-line', {
            stage: p.stageTitle,
            unit: p.unitIndex + 1,
            total: p.unitCount,
          })}
        </p>
      )}
      {entry && (
        <>
          <h2 className="fia-caption">{t('s.passage.includes')}</h2>
          <ul className="fia-list">
            {INCLUDES.filter(([k]) => entry.resourceTypes.includes(k)).map(([k, key]) => (
              <li key={k}>{t(key)}</li>
            ))}
          </ul>
        </>
      )}
      {!started && <p className="fia-caption">{t('s.passage.start-hint')}</p>}
    </ScreenFrame>
  );
}
