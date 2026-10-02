import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { indexOf, position, skippedStops, stopAt, stopsPassed, unitTitle } from '../flow/model';
import { FlowGate, StageProgress, ViewToggle } from '../flow/ui/GuideChrome';
import { useGuide } from '../flow/ui/useGuide';
import type { GuideStop, GuideUnit } from '../flow/types';
import { t } from '../i18n';
import { ForwardJumpSheet } from './SH5ForwardJumpGuard';
import { ScreenFrame } from './ScreenFrame';

// S07 Overview (07-overview.md, R-412): all stages and units with quiet state glyphs; jumping
// back is free, jumping forward past an un-discussed stop asks once (sheet 24).
export default function S07Overview() {
  const nav = useNavigate();
  const { session, snap } = useGuide();
  const { guide, state } = snap;
  const [selected, setSelected] = useState<string | undefined>();
  const [open, setOpen] = useState<number | undefined>();
  const [guard, setGuard] = useState<GuideStop[]>([]);

  if (!guide || !state) {
    return (
      <ScreenFrame id="S07" primaryLabel={null}>
        <FlowGate
          status={snap.guideStatus}
          hasPack={!!snap.packId}
          onRetry={() => void session.loadGuide(true)}
        />
      </ScreenFrame>
    );
  }

  const current = position(guide, state.unitId);
  const expanded = open ?? current.stageIndex;
  const skipped = new Set(
    skippedStops(guide, state.visited, state.discussed).map((s) => s.afterUnitId),
  );
  const target = selected ?? state.unitId;

  const glyph = (u: GuideUnit): [string, string] => {
    const stop = stopAt(guide, u.id);
    if (u.id === state.unitId) return ['▶', t('s.overview.glyph.current')];
    if (skipped.has(u.id)) return ['○', t('s.overview.glyph.skipped')];
    if (stop && state.discussed.includes(stop.id)) return ['◉', t('s.overview.glyph.discussed')];
    if (state.played.includes(u.id) || state.visited.includes(u.id))
      return ['●', t('s.overview.glyph.played')];
    return ['·', t('s.overview.glyph.not-yet')];
  };

  const go = (unitId: string) => {
    session.dispatch({ type: 'jump', unitId });
    session.setView('guide');
    nav('/guide');
  };
  const press = () => {
    if (target === state.unitId) return go(target);
    const passed = stopsPassed(guide, state.unitId, target, state.discussed).filter(
      (s) => !state.asked.includes(s.id),
    );
    if (passed.length) return setGuard(passed);
    go(target);
  };
  const n = indexOf(guide, target) + 1;
  const targetUnit = guide.steps.flatMap((s) => s.units).find((u) => u.id === target)!;
  const title = unitTitle(targetUnit, 40);
  const label =
    target === state.unitId
      ? t('s.overview.primary-back', { n })
      : title.length > 32
        ? t('s.overview.primary-go-n', { n })
        : t('s.overview.primary-go', { unit: title });

  return (
    <ScreenFrame
      id="S07"
      title={guide.title}
      primaryLabel={guard.length ? null : label}
      onPrimary={press}
    >
      <StageProgress guide={guide} state={state} />
      <ViewToggle active="overview" onView={(v) => session.setView(v)} />
      {guide.provenance !== 'source' && (
        <p className="fia-mark">✦ {t('s.overview.whole-guide-ai')}</p>
      )}
      <ol className="fia-overview">
        {guide.steps.map((step, si) => {
          const done = step.units.every((u) => state.played.includes(u.id));
          return (
            <li key={step.id}>
              <button
                type="button"
                className="fia-overview__stage"
                aria-expanded={si === expanded}
                aria-label={t('s.overview.a11y.stage', {
                  n: si + 1,
                  stage: step.title,
                  units: step.units.length,
                  done: done ? t('s.overview.done') : '',
                })}
                onClick={() => setOpen(si === expanded ? -1 : si)}
              >
                <span className="fia-badge">{si + 1}</span> {step.title}{' '}
                <span className="fia-caption">
                  {t('s.overview.units-count', { n: step.units.length })}
                </span>
                {done && <span className="fia-chip">{t('s.overview.done')}</span>}
              </button>
              {si === expanded && (
                <ul>
                  {step.units.map((u) => {
                    const [g, word] = glyph(u);
                    const isStop = !!stopAt(guide, u.id);
                    return (
                      <li key={u.id}>
                        <button
                          type="button"
                          className="fia-overview__unit"
                          data-unit-id={u.id}
                          aria-pressed={u.id === selected}
                          aria-label={t('s.overview.a11y.unit', {
                            title: unitTitle(u),
                            state: word,
                            stop: isStop ? ` ${t('s.overview.stop-tag')}` : '',
                          })}
                          onClick={() => setSelected(u.id)}
                        >
                          <span aria-hidden>{g}</span> <span dir="auto">{unitTitle(u)}</span>
                          {isStop && (
                            <span className="fia-caption"> {t('s.overview.stop-tag')}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      <ForwardJumpSheet
        guide={guide}
        stops={guard}
        open={guard.length > 0}
        onToStop={(s) => {
          session.dispatch({ type: 'asked', stopIds: guard.map((x) => x.id) });
          setGuard([]);
          go(s.afterUnitId);
        }}
        onGoAhead={() => {
          session.dispatch({ type: 'asked', stopIds: guard.map((x) => x.id) });
          setGuard([]);
          go(target);
        }}
        onCancel={() => setGuard([])}
      />
    </ScreenFrame>
  );
}
