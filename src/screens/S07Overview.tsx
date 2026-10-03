import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreSheet } from '../components';
import { FiaLogo } from '../components/FiaLogo';
import { AuroraField, Bead, BeadStrip, GlassButton, GlassSheet, Icon } from '../components/glass';
import { KitPrimary } from '../components/PrimaryButton';
import { stopsPassed } from '../flow/model';
import { FlowGate } from '../flow/ui/GuideChrome';
import { iconSize, keepRef, useTextScale } from '../flow/ui/guideKit';
import { LegendWell } from '../frame/BeadLegend';
import { keepNumber } from '../frame/text';
import { useGuide } from '../flow/ui/useGuide';
import type { GuideStop } from '../flow/types';
import { t } from '../i18n';
import { ForwardJumpSheet } from './SH5ForwardJumpGuard';
import { guideMap, MAP_KINDS, stepBeads, type MapPart, type MapStep } from './S07Overview.map';
import './S07Overview.css';

// S07 Whole guide map, v2 (BUILD-ORDER F6-S07; nodded mock cookbook design/alpha-v2-screens/07-overview.html;
// PRD § 4 row S07, § 8.1–8.3, § 8.5). A full-height kit GlassSheet reached from Explore › This passage:
// the FIA logo · "‹ Explore" pinned row, the title and one line of counts, the "What the marks mean"
// legend, then every step (number · title · counts · its coded beads) with the step of "you are here"
// open as part rows and a talk row after each talk. One primary, "‹ Back to part n", in the thumb
// slot. No view switcher (Overview left the card, PRD § 8.1 (c)) and no bar (RULING 2026-10-01
// 21:23 ET (a)). Kept bones (R-412, 07-overview.md): a jump back is free; a jump forward past an
// un-discussed talk asks once per talk (sheet 24, SH5ForwardJumpGuard, imported as is).

const STATE_KEY = {
  done: 's.legend.state.heard',
  current: 's.legend.state.here',
  upcoming: 's.legend.state.ahead',
} as const;

function PartRow({
  part,
  big,
  scale,
  onGo,
}: {
  part: MapPart;
  big: boolean;
  scale: number;
  onGo: (unitId: string) => void;
}) {
  const b = 10 * Math.min(scale, 2.4);
  const cur = part.state === 'current';
  const label = [
    t('s.overview.v2.a11y.part', {
      n: part.n,
      state: t(STATE_KEY[part.state]),
      words: part.words,
    }),
    part.talk ? t('s.overview.v2.a11y.talk') : null,
  ]
    .filter(Boolean)
    .join('. ');
  return (
    <>
      <button
        type="button"
        className={`s07-part is-${part.state}`}
        data-unit-id={part.unit.id}
        aria-label={label}
        aria-current={cur ? 'step' : undefined}
        onClick={() => onGo(part.unit.id)}
      >
        <span className="s07-part__bead">
          <Bead
            kind={part.kind}
            kinds={MAP_KINDS}
            state={part.state}
            more={part.more || undefined}
            size={cur ? b : 1.6 * b}
          />
        </span>
        <span className="s07-part__n fia-num">
          {big ? t('s.overview.v2.part', { n: part.n }) : part.n}
        </span>
        <span className="s07-part__words" dir="auto">
          {part.words}
          {cur && <span className="s07-part__here">{t('s.overview.v2.here')}</span>}
        </span>
        <span className="s07-chev">
          <Icon name="chevronRight" size={iconSize(16, scale)} />
        </span>
      </button>
      {part.talk && (
        // A talk: a full-width row in the stop colour, led by the bar and the users icon. Not a control.
        <div
          className="s07-talk"
          data-stop-id={part.talk.stop.id}
          data-skipped={part.talk.skipped || undefined}
        >
          <Icon name="users" size={iconSize(18, scale)} />
          <span>
            {keepNumber(t('s.stop.v2.band', { n: part.n }))}
            {part.talk.skipped && ` · ${t('s.overview.glyph.skipped')}`}
          </span>
        </div>
      )}
      {part.end && (
        <div className="s07-talk s07-talk--end">
          <span>{keepNumber(t('s.overview.v2.end', { n: part.n }))}</span>
        </div>
      )}
    </>
  );
}

function StepRow({
  step,
  of,
  here,
  open,
  big,
  scale,
  onToggle,
  onGo,
}: {
  step: MapStep;
  of: number;
  here: number;
  open: boolean;
  big: boolean;
  scale: number;
  onToggle: () => void;
  onGo: (unitId: string) => void;
}) {
  const words = [
    t('s.overview.v2.step-parts', { n: step.parts.length }),
    step.talks ? t('s.overview.v2.step-talks', { n: step.talks }) : null,
    step.status === 'done'
      ? t('s.overview.done')
      : step.status === 'current'
        ? t('s.overview.v2.step-here', { n: here })
        : t('s.overview.v2.step-ahead'),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="s07-step-wrap" data-step-id={step.id}>
      <button
        type="button"
        className={`s07-step is-${step.status}${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-label={t('s.overview.v2.a11y.step', {
          n: step.index + 1,
          m: of,
          title: step.title,
          words,
        })}
        onClick={onToggle}
      >
        <span className="s07-step__badge fia-num">{step.index + 1}</span>
        <span className="s07-step__text">
          <span className="s07-step__title" dir="auto">
            {step.title}
          </span>
          <span className="fia-caption-v2 s07-step__words fia-num">{words}</span>
          {!open && (
            <BeadStrip
              className="s07-step__beads"
              items={stepBeads(step)}
              size={10 * Math.min(scale, 2.4)}
              gap={6 * Math.min(scale, 2)}
              kinds={MAP_KINDS}
            />
          )}
        </span>
        <span className="s07-chev">
          <Icon name="chevronRight" size={iconSize(18, scale)} />
        </span>
      </button>
      {open && (
        <div
          className="s07-parts"
          role="list"
          aria-label={t('s.overview.v2.a11y.parts', { n: step.index + 1 })}
        >
          {step.parts.map((p) => (
            <div role="listitem" key={p.unit.id}>
              <PartRow part={p} big={big} scale={scale} onGo={onGo} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function S07Overview() {
  const nav = useNavigate();
  const { session, snap } = useGuide();
  const { guide, state } = snap;
  const scale = useTextScale();
  const big = scale >= 2;
  const [open, setOpen] = useState<number | undefined>();
  const [guard, setGuard] = useState<{ stops: GuideStop[]; target: string } | null>(null);
  const [explore, setExplore] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const ready = !!guide && !!state;

  // The map opens with "you are here" in view: when the current part row is below the fold, the
  // sheet body (not the page) scrolls so the row sits at the top of the visible body (mock :125-133).
  useLayoutEffect(() => {
    const el = body.current;
    if (!ready || !el) return;
    const row = el.querySelector<HTMLElement>('.s07-part.is-current');
    if (!row) return;
    const r = row.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    if (r.bottom > b.bottom - 8)
      el.scrollTop = Math.min(r.top - b.top - 8, el.scrollHeight - el.clientHeight);
  }, [ready]);

  const map = guide && state ? guideMap(guide, state) : null;
  const expanded = open ?? map?.current.stepIndex;

  // Back to the guide. The current part is not re-entered (that would reset a paused clip to Play);
  // a finished guide re-opens on its last part, as v1's "Back to unit n" did.
  const back = () => {
    if (state?.finished) session.dispatch({ type: 'jump', unitId: state.unitId });
    session.setView('guide');
    nav('/guide');
  };
  const go = (unitId: string) => {
    session.dispatch({ type: 'jump', unitId });
    session.setView('guide');
    nav('/guide');
  };
  const onGo = (unitId: string) => {
    if (!guide || !state) return;
    if (unitId === state.unitId) return back();
    const passed = stopsPassed(guide, state.unitId, unitId, state.discussed).filter(
      (s) => !state.asked.includes(s.id),
    );
    if (passed.length) return setGuard({ stops: passed, target: unitId });
    go(unitId);
  };

  const summary =
    guide && map
      ? t('s.overview.v2.summary', {
          title: keepRef(guide.title),
          steps: map.steps.length,
          parts: map.parts,
          talks: map.talks,
        })
      : undefined;
  const brand = (
    <div className="s07-brand">
      <FiaLogo />
      <GlassButton
        variant="quiet"
        size="md"
        className="fia-btn fia-quiet s07-explore"
        leading={<Icon name="chevronLeft" size={iconSize(18, scale)} />}
        aria-haspopup="dialog"
        onClick={() => setExplore(true)}
      >
        {t('s.common.explore')}
      </GlassButton>
    </div>
  );
  const heading = <h1 className="s07-h">{t('s.common.explore.map')}</h1>;

  return (
    <AuroraField
      className="fia-aurora"
      drift={false}
      style={{ height: '100dvh', overflow: 'clip' }}
    >
      <div className={`s07-page${big ? ' is-big' : ''}`} data-screen="S07">
        <GlassSheet
          open
          className="fia-sheet s07-sheet"
          height={big ? '100%' : 'calc(100% - 14px)'}
          title={
            big ? (
              brand
            ) : (
              <>
                {brand}
                {heading}
              </>
            )
          }
          description={big ? undefined : summary}
          actions={
            map ? (
              <div className="fia-sheet__actions">
                <div className="fia-primary-slot">
                  <KitPrimary
                    icon="chevronLeft"
                    label={t('s.overview.v2.back', { n: map.current.n })}
                    onPress={back}
                  />
                </div>
              </div>
            ) : undefined
          }
        >
          <div className="fia-sheet-body s07-body" ref={body}>
            {big && (
              // At 200%+ the title and counts scroll with the map; the logo row and the action stay.
              <div className="s07-head">
                {heading}
                {summary && <div className="s07-head__desc">{summary}</div>}
              </div>
            )}
            {!guide || !map ? (
              <FlowGate
                status={snap.guideStatus}
                hasPack={!!snap.packId}
                onRetry={() => void session.loadGuide(true)}
              />
            ) : (
              <>
                {guide.provenance !== 'source' && (
                  <p className="fia-caption-v2 s07-ai">
                    <Icon name="sparkle" size={iconSize(14, scale)} />
                    {t('s.overview.whole-guide-ai')}
                  </p>
                )}
                <LegendWell
                  kinds={map.kinds}
                  steps={map.steps.length}
                  scale={scale}
                  id="s07-legend-title"
                />
                <div className="s07-steps">
                  {map.steps.map((st) => (
                    <StepRow
                      key={st.id}
                      step={st}
                      of={map.steps.length}
                      here={map.current.n}
                      open={st.index === expanded}
                      big={big}
                      scale={scale}
                      onToggle={() => setOpen(st.index === expanded ? -1 : st.index)}
                      onGo={onGo}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </GlassSheet>
        {guide && state && guard && (
          <ForwardJumpSheet
            guide={guide}
            state={state}
            target={guard.target}
            stops={guard.stops}
            open
            onToStop={(s) => {
              session.dispatch({ type: 'asked', stopIds: guard.stops.map((x) => x.id) });
              setGuard(null);
              go(s.afterUnitId);
            }}
            onGoAhead={() => {
              session.dispatch({ type: 'asked', stopIds: guard.stops.map((x) => x.id) });
              setGuard(null);
              go(guard.target);
            }}
            onCancel={() => setGuard(null)}
          />
        )}
        <MoreSheet open={explore} onClose={() => setExplore(false)} from="S07" />
      </div>
    </AuroraField>
  );
}
