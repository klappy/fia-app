import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { position, units } from '../flow/model';
import { FlowGate } from '../flow/ui/GuideChrome';
import { useGuide } from '../flow/ui/useGuide';
import { t } from '../i18n';
import { SaveRow, useSaveRow, useOffline } from '../offline';
import '../offline/offline.css';
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
// one primary: Start / Continue · {stage} / Start again, and the save row (R-306, R-307, R-309):
// tier picker with C-03 sizes, storage estimate, `Save {tier} ({mb} MB)` → C-07 SAVE.
// save-intent (`?save=1`, from S13 `Save a passage`): the primary saves, Start goes quiet.
export default function S04PassageCard() {
  const nav = useNavigate();
  const loc = useLocation();
  const { session, snap } = useGuide();
  useEffect(() => void session.loadCatalog(), [session]);
  const entry = snap.manifest?.entries.find((e) => e.packId === snap.packId);
  const off = useOffline();
  const ctl = useSaveRow(snap.packId, entry?.tierBytes, undefined, () =>
    nav('/sheet/storage?variant=quota'),
  );
  const seeDownloads = () => nav(`/downloads?from=${encodeURIComponent(snap.packId ?? '')}`);
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
  const start = () => {
    if (state.finished) session.dispatch({ type: 'restart' });
    session.setView('guide');
    nav('/guide');
  };
  const intent =
    new URLSearchParams(loc.search).get('save') === '1' &&
    ctl.rowState.state === 'none' &&
    !!ctl.sizeMb &&
    off.online;
  return (
    <ScreenFrame
      id="S04"
      title={guide.title}
      dockActive="guide"
      offline={!off.online}
      primaryLabel={
        intent
          ? t('s.passage.primary-save', { tier: t(`s.passage.tier.${ctl.tier}`), mb: ctl.sizeMb! })
          : label
      }
      primaryState={intent && !ctl.canSave ? 'disabled' : 'default'}
      onPrimary={intent ? () => void ctl.save() : start}
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
      {entry && (
        <SaveRow
          ctl={ctl}
          tierBytes={entry.tierBytes}
          intent={intent}
          onStart={start}
          onSeeDownloads={seeDownloads}
        />
      )}
      {!started && <p className="fia-caption">{t('s.passage.start-hint')}</p>}
    </ScreenFrame>
  );
}
