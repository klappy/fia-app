import { useNavigate } from 'react-router-dom';
import { SecondaryAction, Sheet } from '../components';
import { position, unitAt, indexOf, unitTitle } from '../flow/model';
import type { GuideStop, FlowGuide } from '../flow/types';
import { t } from '../i18n';

export interface ForwardJumpSheetProps {
  guide: FlowGuide;
  /** un-discussed stops the jump would pass, in guide order */
  stops: GuideStop[];
  open: boolean;
  /** primary: go to the (first) stop */
  onToStop: (stop: GuideStop) => void;
  /** secondary: jump anyway; stops stay un-discussed (reported as skipped on 18) */
  onGoAhead: () => void;
  /** tap outside / swipe: stay on 07, selection kept */
  onCancel: () => void;
}

// SH-5 Forward-jump guard (24-sheet-forward-jump-guard.md, R-412). Asked once per stop per
// session (Q24-a); backward jumps and jumps passing no stop never show it.
export function ForwardJumpSheet({
  guide,
  stops,
  open,
  onToStop,
  onGoAhead,
  onCancel,
}: ForwardJumpSheetProps) {
  if (stops.length === 0) return null;
  const many = stops.length > 1;
  const listed = stops.slice(0, 2);
  const rest = stops.length - listed.length;
  return (
    <Sheet
      brand
      open={open}
      title={many ? t('s.jump.title.many', { k: stops.length }) : t('s.jump.title.one')}
      primaryLabel={many ? t('s.jump.primary.many') : t('s.jump.primary.one')}
      onPrimary={() => onToStop(stops[0])}
      onClose={onCancel}
      className="fia-sheet--stop"
    >
      <ul className="fia-jump__stops">
        {listed.map((s) => {
          const u = unitAt(guide, indexOf(guide, s.afterUnitId));
          const n = position(guide, s.afterUnitId).stageIndex + 1;
          return (
            <li key={s.id} dir="auto">
              {t('s.jump.stop-line', { n, stopTitle: u ? unitTitle(u, 60) : s.id })}
            </li>
          );
        })}
      </ul>
      {rest > 0 && <p className="fia-caption">{t('s.jump.and-more', { k: rest })}</p>}
      <p>{many ? t('s.jump.not-discussed-many') : t('s.jump.not-discussed')}</p>
      <p className="fia-caption">{many ? t('s.jump.body-many') : t('s.jump.body')}</p>
      <SecondaryAction label={t('s.jump.go-ahead')} onPress={onGoAhead} />
    </Sheet>
  );
}

// Route host: the guard only makes sense over 07, which owns the selection; the route sends
// the person there.
export default function SH5ForwardJumpGuard() {
  const nav = useNavigate();
  return (
    <Sheet
      brand
      title={t('s.jump.title.one')}
      primaryLabel={t('s.jump.cancel')}
      onClose={() => nav('/overview')}
      onPrimary={() => nav('/overview')}
    >
      <p className="fia-caption">{t('s.jump.body')}</p>
    </Sheet>
  );
}
