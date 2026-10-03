import { useNavigate } from 'react-router-dom';
import { Sheet } from '../components';
import { Bead, BeadStrip, GlassButton, GlassSurface, Icon } from '../components/glass';
import { KitPrimary } from '../components/PrimaryButton';
import type { FlowState } from '../flow/machine';
import { indexOf, position, unitAt } from '../flow/model';
import type { GuideStop, FlowGuide } from '../flow/types';
import { useTextScale } from '../flow/ui/guideKit';
import { t } from '../i18n';
import { MAP_KINDS, firstWords, guideMap, jumpBeads } from './S07Overview.map';

export interface ForwardJumpSheetProps {
  guide: FlowGuide;
  /** the guide's position: "you are here" (the jump starts at `state.unitId`) */
  state: Pick<FlowState, 'unitId' | 'visited' | 'discussed'>;
  /** the part tapped in the Whole guide map */
  target: string;
  /** un-discussed stops the jump would pass, in guide order */
  stops: GuideStop[];
  open: boolean;
  /** primary: go to the (first) stop */
  onToStop: (stop: GuideStop) => void;
  /** secondary: jump anyway; stops stay un-discussed (reported as skipped on 18) */
  onGoAhead: () => void;
  /** "Stay here", tap outside, Escape: stay on 07, selection kept */
  onCancel: () => void;
}

/** Part n of its step and the step's number: "part 12" inside the step, "step 4, part 2" across. */
const where = (g: FlowGuide, unitId: string) => {
  const p = position(g, unitId);
  return { s: p.stageIndex + 1, n: p.unitIndex + 1, title: g.steps[p.stageIndex]?.title ?? '' };
};

// SH-5 Forward-jump guard, v2 (spec 24 as wireframe; nodded mock cookbook design/alpha-v2-screens/
// 24-sheet-forward-jump-guard.html; PRD § 4 S24). Rises over the Whole guide map (S07) when a forward
// jump would pass a talk not yet held (R-412); asked once per talk per session (Q24-a, S07 records it);
// a jump back or past no talk never shows it. Composed of shared parts only: the app Sheet on the kit
// GlassSheet (brand row, talk-red top edge `fia-sheet--stop`, as sheet 21), sheet 21's quoted-question
// well (`fia-stop-q`), the map's coded beads (S07Overview.map MAP_KINDS · jumpBeads on the kit
// BeadStrip), the band's talk caption (`fia-band__stopcap`), quiet kit GlassButtons and KitPrimary.
export function ForwardJumpSheet({
  guide,
  state,
  target,
  stops,
  open,
  onToStop,
  onGoAhead,
  onCancel,
}: ForwardJumpSheetProps) {
  const scale = useTextScale();
  if (stops.length === 0) return null;
  const many = stops.length > 1;
  const listed = stops.slice(0, 2);
  const rest = stops.length - listed.length;
  const a = where(guide, state.unitId);
  const b = where(guide, target);
  const cross = a.s !== b.s;
  const size = 10 * Math.min(scale, 2.4);
  const first = where(guide, stops[0].afterUnitId);
  return (
    <Sheet
      brand
      open={open}
      title={
        cross ? t('s.jump.v2.title-step', { s: b.s, n: b.n }) : t('s.jump.v2.title', { n: b.n })
      }
      description={t('s.jump.v2.from', { n: a.n, s: a.s, title: a.title })}
      onClose={onCancel}
      closeButton={false}
      state="discussion-stop"
      className="fia-sheet--stop fia-sheet--jump"
      actions={
        <KitPrimary
          icon="users"
          label={many ? t('s.jump.v2.primary.many') : t('s.jump.v2.primary.one')}
          onPress={() => onToStop(stops[0])}
        />
      }
    >
      <GlassSurface level={3} blur="soft" radius="xl" shadow="none" className="fia-stop-q">
        <div className="fia-stop-q__inner fia-jump">
          <div className="fia-jump__ends fia-caption fia-num">
            <span>{t('s.jump.v2.here', { n: a.n })}</span>
            <span>
              {cross ? t('s.jump.v2.to-step', { s: b.s, n: b.n }) : t('s.jump.v2.to', { n: b.n })}
            </span>
          </div>
          <BeadStrip
            className="fia-jump__beads"
            items={jumpBeads(guideMap(guide, state), state.unitId, target, size)}
            size={size}
            gap={6 * Math.min(scale, 2)}
            kinds={MAP_KINDS}
            label={t('s.jump.v2.a11y.beads', { a: a.n, b: b.n, k: stops.length })}
          />
          {listed.map((s) => {
            const at = where(guide, s.afterUnitId);
            const u = unitAt(guide, indexOf(guide, s.afterUnitId));
            return (
              <div key={s.id} className="fia-jump__stop" data-stop-id={s.id}>
                <span className="fia-caption fia-band__stopcap fia-jump__stopcap">
                  <Bead kind="stop" state="done" color="var(--fia-kind-stop)" />
                  {at.s !== a.s
                    ? t('s.jump.v2.stop-line-step', { s: at.s, n: at.n })
                    : t('s.jump.v2.stop-line', { n: at.n })}
                </span>
                {u?.text && (
                  <p className="fia-stop-quote fia-jump__quote" dir="auto" lang={guide.language}>
                    “{firstWords(u.text, 58)}”
                  </p>
                )}
              </div>
            );
          })}
          {rest > 0 && <p className="fia-caption">{t('s.jump.and-more', { k: rest })}</p>}
        </div>
      </GlassSurface>
      <p className="fia-body fia-stop-lead">
        {many ? t('s.jump.v2.body-many', { k: stops.length }) : t('s.jump.v2.body', { n: first.n })}
      </p>
      <div className="fia-jump__choices">
        <GlassButton
          variant="quiet"
          size="md"
          className="fia-btn fia-quiet"
          data-role="cancel"
          leading={<Icon name="x" size={18} />}
          onClick={onCancel}
        >
          {t('s.jump.cancel')}
        </GlassButton>
        <GlassButton
          variant="quiet"
          size="md"
          className="fia-btn fia-quiet"
          data-role="go-ahead"
          trailing={<Icon name="chevronRight" size={18} />}
          onClick={onGoAhead}
        >
          {t('s.jump.go-ahead')}
        </GlassButton>
      </div>
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
