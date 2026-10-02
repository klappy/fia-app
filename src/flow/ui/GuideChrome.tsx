// Shared parts of the guide family (S05, and the views F6 skins next: S06, S07, S18). v2 (F5), drawn
// from the nodded mock design/alpha-v2-screens/_frame.js on the kit: the progress band (overall steps +
// coded beads, PRD § 8.3), the card's Guide · Text · Resources views (§ 8.1 (c)) and the "In this part"
// chips. Every surface is a kit component (src/vendor/glass/components/, via components/glass.ts).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProgressRail } from '../../components';
import { Bead, GlassChip, GlassSegmented, GlassSurface, Icon } from '../../components/glass';
import { t } from '../../i18n';
import { AbsentBadge } from '../../components';
import { useNotYet } from '../ready';
import type { FlowState } from '../machine';
import type { View } from '../store';
import type { FlowGuide } from '../types';
import { bandModel } from './band';
import {
  bandCaption,
  iconSize,
  keepRef,
  NB,
  tailWords,
  useTextScale,
  type CardView,
  type PartItem,
} from './guideKit';
import './guide.css';

// ── progress band ────────────────────────────────────────────────────────────────────────────────

export function ProgressBand({
  guide,
  unitId,
  complete,
  scale = 1,
  lifted,
}: {
  guide: FlowGuide;
  unitId: string;
  complete?: boolean;
  scale?: number;
  /** drawn above the stop sheet's scrim, undimmed (mock 21: "the band is drawn again, undimmed") */
  lifted?: boolean;
}) {
  const b = bandModel(guide, unitId);
  const total = b.steps.length;
  const stepsLabel = complete
    ? t('s.guide.band.done', { m: total })
    : t('s.guide.a11y.band-steps', { n: b.stepIndex + 1, m: total, stage: b.stepTitle });
  return (
    <GlassSurface
      level={2}
      blur="medium"
      radius="xl"
      shadow="rest"
      className="fia-band"
      id="fia-band"
      data-lifted={lifted || undefined}
      data-step={b.stepIndex + 1}
      data-part={b.n}
    >
      <div className="fia-band__inner">
        <span className="fia-overline fia-band__overline">
          {t('s.guide.band.overline', {
            title: keepRef(guide.title),
            n: b.stepIndex + 1,
            m: total,
          }).replace(' · ', `${NB}· `)}
        </span>
        <div className="fia-band__title">{b.stepTitle}</div>
        <ProgressRail
          steps={b.steps}
          currentStep={complete ? total : b.stepIndex}
          progress={b.progress}
          beads={complete ? undefined : b.beads}
          before={b.before}
          after={b.after}
          scale={scale}
          stepsLabel={stepsLabel}
          beadsLabel={t('s.guide.a11y.band-beads', {
            n: b.n,
            m: b.m,
            a: b.from,
            b: b.to,
            tail: tailWords(b.tail),
          })}
        />
        {lifted && b.tail.kind === 'talk-here' ? (
          // At a stop the caption names it in words beside its own bar (mock 21 StopCaption).
          <span className="fia-caption fia-num fia-band__caption fia-band__caption--stop">
            <span>{t('s.guide.band.part', { n: b.n, m: b.m })}</span>
            <span className="fia-band__stopcap">
              <Bead kind="stop" state="done" color="var(--fia-kind-stop)" />
              {t('s.stop.v2.band', { n: b.n })}
            </span>
          </span>
        ) : (
          <span className="fia-caption fia-num fia-band__caption">
            {complete ? stepsLabel : bandCaption(b)}
          </span>
        )}
      </div>
    </GlassSurface>
  );
}

/** The band for the other guide-family screens (S06, S07, S18): one shared part, F6 imports it. */
export function StageProgress({
  guide,
  state,
  complete,
}: {
  guide: FlowGuide;
  state: FlowState;
  complete?: boolean;
}) {
  const scale = useTextScale();
  return <ProgressBand guide={guide} unitId={state.unitId} complete={complete} scale={scale} />;
}

/**
 * Slim words strip, sticky at the top once the band has scrolled away (large text only; mock
 * StickyStrip, _frame.js:195-203). Not interactive.
 */
export function StickyStrip({ guide, unitId }: { guide: FlowGuide; unitId: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const band = document.getElementById('fia-band');
    if (!band || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((es) => setShown(!es[0].isIntersecting));
    io.observe(band);
    return () => io.disconnect();
  }, []);
  const b = bandModel(guide, unitId);
  const all = b.steps.length;
  return (
    <div className="fia-sticky-strip" data-shown={shown} aria-hidden>
      <div className="fia-sticky-strip__words fia-num">
        {t('s.guide.band.step', { n: b.stepIndex + 1, m: all })}
        {`${NB}· `}
        {t('s.guide.band.part', { n: b.n, m: b.m })}
      </div>
      <div className="fia-sticky-strip__track">
        <div style={{ width: `${(100 * (b.stepIndex + b.progress)) / all}%` }} />
      </div>
    </div>
  );
}

// ── card: Guide · Text · Resources (kit forms/GlassSegmented, icon + label nodes) ───────────────────
// One row fits only at 1×. Above 1× the views are a vertical list (mock README § Large text; S14's
// segmented rows also stack from 150%), so no option runs past the card at 320 or 390 px.

export function CardViews({
  active,
  count,
  scale = 1,
  onView,
}: {
  active: CardView;
  count?: number;
  scale?: number;
  onView: (v: CardView) => void;
}) {
  const opt = (value: CardView, icon: 'headphones' | 'book' | 'globe', word: string) => ({
    value,
    label: (
      <span className="fia-seg">
        <Icon name={icon} size={iconSize(18, scale)} stroke={value === active ? 2.2 : 1.7} />
        {word}
      </span>
    ),
  });
  return (
    <GlassSegmented
      className={['fia-views', scale > 1 && 'is-vertical'].filter(Boolean).join(' ')}
      size="md"
      aria-label={t('s.guide.view.label')}
      value={active}
      onChange={(v) => onView(v as CardView)}
      options={[
        opt('guide', 'headphones', t('s.guide.view.guided')),
        opt('text', 'book', t('s.guide.view.script')),
        opt(
          'resources',
          'globe',
          count ? t('s.guide.view.resources-count', { n: count }) : t('s.guide.view.resources'),
        ),
      ]}
    />
  );
}

// ── "In this part": key terms (pack) and images or maps (PoC cues), each led by its bead ───────────

const KIND_WORD = {
  term: 's.guide.kind.term',
  image: 's.guide.kind.image',
  map: 's.guide.kind.map',
} as const;

export function PartChips({
  items,
  packId,
  unitId,
  scale = 1,
}: {
  items: PartItem[];
  packId: string;
  unitId: string;
  scale?: number;
}) {
  const nav = useNavigate();
  if (!items.length) return null;
  const q = (id: string) =>
    `?pack=${encodeURIComponent(packId)}&id=${encodeURIComponent(id)}&unit=${encodeURIComponent(unitId)}`;
  return (
    <div className="fia-chips">
      <span className="fia-caption fia-chips__label">{t('s.guide.in-this-part')}</span>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className="fia-chip-btn"
          aria-label={t('s.guide.a11y.part-chip', {
            kind: t(KIND_WORD[it.kind]),
            title: it.label ?? it.title,
          })}
          onClick={() => nav(`${it.kind === 'term' ? '/term' : '/viewer'}${q(it.id)}`)}
        >
          <GlassChip
            className="fia-chip fia-chip--part"
            leading={
              <Bead
                kind={it.kind === 'term' ? 'term' : 'media'}
                state="done"
                size={9 * Math.min(scale, 2)}
                color={it.kind === 'term' ? 'var(--fia-kind-term)' : 'var(--fia-kind-media)'}
              />
            }
          >
            <span className="fia-chip-label">{it.label ?? it.title}</span>
          </GlassChip>
        </button>
      ))}
    </div>
  );
}

// ── v1 view toggle (S06, S07 until their F6 rows re-skin them on CardViews) ─────────────────────────

const VIEWS: { view: View; key: string; path: string }[] = [
  { view: 'guide', key: 's.guide.view.guided', path: '/guide' },
  { view: 'single-script', key: 's.guide.view.script', path: '/script' },
  { view: 'overview', key: 's.guide.view.overview', path: '/overview' },
];

export function ViewToggle({ active, onView }: { active: View; onView: (v: View) => void }) {
  const nav = useNavigate();
  return (
    <div className="fia-segmented" role="tablist">
      {VIEWS.map((v) => (
        <button
          key={v.view}
          type="button"
          role="tab"
          aria-selected={v.view === active}
          className="fia-segmented__cell"
          onClick={() => {
            onView(v.view);
            nav(v.path);
          }}
        >
          {t(v.key)}
        </button>
      ))}
    </div>
  );
}

/** Loading / error / no-pack states for the guide family. */
export function FlowGate({
  status,
  hasPack,
  onRetry,
}: {
  status: string;
  hasPack: boolean;
  onRetry: () => void;
}) {
  const nav = useNavigate();
  const notYet = useNotYet();
  if (!hasPack)
    return (
      <button type="button" className="fia-secondary" onClick={() => nav('/library')}>
        {t('s.completion.another-passage')}
      </button>
    );
  // GAP-NOPACK: a listed passage this build has no pack for reads "not yet in {language}" with the
  // way to another passage (absent-badge.md: never a dead end), not "Could not read…".
  if (notYet)
    return (
      <AbsentBadge
        language={notYet}
        fallbackLabel={t('s.completion.another-passage')}
        onFallback={() => nav('/library')}
      />
    );
  if (status === 'error' && notYet !== undefined)
    return (
      <div role="alert">
        <p>{t('s.passage.error')}</p>
        <button type="button" className="fia-secondary" onClick={onRetry}>
          {t('s.common.try-again')}
        </button>
      </div>
    );
  return <p className="fia-caption" aria-busy="true" data-state="loading" />;
}
