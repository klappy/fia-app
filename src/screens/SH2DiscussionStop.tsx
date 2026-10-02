import { useNavigate } from 'react-router-dom';
import { Sheet } from '../components';
import { isLast, stopAt, unitAt, indexOf } from '../flow/model';
import { useFlow, flowSession } from '../flow/session';
import type { FlowState } from '../flow/machine';
import type { FlowGuide } from '../flow/types';
import { t } from '../i18n';

export interface DiscussionStopSheetProps {
  guide: FlowGuide;
  state: FlowState;
  open: boolean;
  onContinue: () => void;
  /** tap outside / close: collapse to the band on 05, nothing is lost (21 § States). */
  onCollapse: () => void;
}

// SH-2 Discussion-stop prompt (21-sheet-discussion-stop.md). Non-blocking: rail and dock stay
// live; the quoted question is the stop unit's source text, verbatim (R-409).
export function DiscussionStopSheet({
  guide,
  state,
  open,
  onContinue,
  onCollapse,
}: DiscussionStopSheetProps) {
  const stop = stopAt(guide, state.unitId);
  if (!stop) return null;
  const unit = unitAt(guide, indexOf(guide, state.unitId));
  const discussed = state.discussed.includes(stop.id);
  const primary = discussed
    ? t('s.stop.primary.resume')
    : isLast(guide, state.unitId)
      ? t('s.stop.primary.finish')
      : t('s.stop.primary.continue');
  return (
    <Sheet
      brand
      open={open}
      title={t('s.stop.title')}
      primaryLabel={primary}
      onPrimary={onContinue}
      onClose={onCollapse}
      state="discussion-stop"
      className="fia-sheet--stop"
    >
      {discussed && <span className="fia-chip">✓ {t('s.stop.discussed-mark')}</span>}
      <p>
        <strong>{t('s.stop.body-lead')}</strong>
      </p>
      <p>{t('s.stop.body')}</p>
      {unit?.text ? (
        <>
          <p className="fia-caption">{t('s.stop.question-again')}</p>
          <blockquote dir="auto" lang={guide.language}>
            {unit.text}
          </blockquote>
        </>
      ) : null}
    </Sheet>
  );
}

// Route host for the smoke and deep links: renders the sheet over the current session.
export default function SH2DiscussionStop() {
  const nav = useNavigate();
  const snap = useFlow();
  const session = flowSession();
  if (!snap.guide || !snap.state || !stopAt(snap.guide, snap.state.unitId)) {
    return (
      <Sheet
        brand
        title={t('s.stop.title')}
        primaryLabel={t('s.stop.primary.resume')}
        onClose={() => nav(-1)}
        onPrimary={() => nav('/guide')}
      >
        <p>{t('s.stop.body')}</p>
      </Sheet>
    );
  }
  return (
    <DiscussionStopSheet
      guide={snap.guide}
      state={snap.state}
      open
      onContinue={() => {
        session.dispatch({ type: 'continue' });
        nav('/guide');
      }}
      onCollapse={() => nav('/guide')}
    />
  );
}
