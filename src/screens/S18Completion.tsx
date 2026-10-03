import { useEffect, type ComponentType, type HTMLAttributes, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CatalogRow, GlassSurface, Icon, type KitIconName } from '../components/glass';
import { FlowGate } from '../flow/ui/GuideChrome';
import { useGuide } from '../flow/ui/useGuide';
import { t } from '../i18n';
import { useOffline } from '../offline/useOffline';
import { savedPackIds, useOnline } from '../offline/useOnline';
import {
  Bead as KitBead,
  StageRail as KitStageRail,
} from '../vendor/glass/components/progress/StageRail';
import type { BeadProps, StageRailProps } from '../vendor/glass/components/progress/StageRail';
import { completionSummary, keepRef, nextPassage, type RecapKind } from './completionModel';
import { ScreenFrame } from './ScreenFrame';
import './S18Completion.css';
import { KINDS } from '../frame/kinds';
import { useTextScale } from '../frame/scale';

// S18 Completion in glass (F6-S18; nodded mock cookbook design/alpha-v2-screens/18-completion.html; PRD § 4
// row S18, § 8.1–8.5). Home frame: header (shell) · the recap plate (kit glass/GlassSurface): a glass
// done mark, "You finished Mark 1:1–13", "All 6 steps · 130 of 130 parts", the six steps on the kit's
// progress/StageRail plus the end mark, every step named and ticked, then "What your group went
// through", one line per kind led by the kit's progress/Bead · quiet rows on kit resources/CatalogRow ·
// one primary, the next passage, in the thumb slot. Nothing plays and nothing auto-navigates (SB-5,
// R-407); counts come from the guide and the person's own record (R-410: talked is never played).

// Typing only (as components/glass.ts and S04): the kit .d.ts omit the `...rest` the .jsx forward.
const Bead = KitBead as unknown as ComponentType<BeadProps & HTMLAttributes<SVGElement>>;
const StageRail = KitStageRail as unknown as ComponentType<
  StageRailProps & HTMLAttributes<HTMLElement>
>;

const KIND_KEY: Record<RecapKind, string> = {
  term: 's.completion.kind.term',
  media: 's.completion.kind.media',
  video: 's.completion.kind.video',
  scripture: 's.completion.kind.scripture',
  stop: 's.completion.kind.stop',
};

/** One quiet row (mock Row): kit CatalogRow, icon + label, chevron. */
function Row({
  icon,
  label,
  first,
  role,
  onOpen,
}: {
  icon: KitIconName;
  label: ReactNode;
  first?: boolean;
  role: string;
  onOpen: () => void;
}) {
  return (
    <li>
      <CatalogRow
        className="fia-catalog s18-row"
        first={first}
        data-role={role}
        onOpen={onOpen}
        title={
          <span className="fia-row-label">
            <Icon name={icon} size={18} />
            <span>{label}</span>
          </span>
        }
        meta={<Icon name="chevronRight" size={16} />}
      />
    </li>
  );
}

export default function S18Completion() {
  const nav = useNavigate();
  const { session, snap } = useGuide();
  const { guide, state } = snap;
  const scale = useTextScale();
  const online = useOnline();
  const off = useOffline();
  useEffect(() => {
    void session.loadCatalog();
  }, [session]);

  if (!guide || !state) {
    return (
      <ScreenFrame id="S18" primaryLabel={null}>
        <FlowGate
          status={snap.guideStatus}
          hasPack={!!snap.packId}
          onRetry={() => void session.loadGuide(true)}
        />
      </ScreenFrame>
    );
  }

  const sum = completionSummary(guide, state);
  const n = sum.steps.length;
  const stepsWords =
    sum.stepsReached === n
      ? t('s.completion.all-steps', { n })
      : t('s.completion.some-steps', { k: sum.stepsReached, n });
  // The rail fills the steps the group reached; a step never reached stays an outline (unmocked).
  const firstGap = sum.steps.findIndex((st) => !st.reached);
  const headline = t('s.completion.headline', { passage: keepRef(guide.title) });
  const next =
    snap.manifest && snap.catalogStatus === 'ready'
      ? nextPassage(snap.manifest, snap.language ?? guide.language, guide.packId)
      : undefined;
  const catalogKnown = snap.catalogStatus === 'ready' || snap.catalogStatus === 'error';
  // C-07 STATUS: verified saves only (offline/useOnline savedPackIds); no worker → nothing is saved.
  const saved = savedPackIds(off.packs).has(guide.packId);
  const beadSize = 10 * Math.min(scale, 2.4);
  const iconSize = (base: number) => Math.round(base * Math.min(scale, 2));
  const kindLines: { kind: RecapKind; text: string }[] = sum.kinds.map((k) => ({
    kind: k.kind,
    text: t(KIND_KEY[k.kind], { n: k.parts }),
  }));
  if (sum.talks > 0)
    kindLines.push({
      kind: 'stop',
      text: t(KIND_KEY.stop, { d: sum.discussed, stops: sum.talks }),
    });

  return (
    <ScreenFrame
      id="S18"
      title={headline}
      titleHidden
      primaryLabel={
        next
          ? t('s.completion.primary.next', { ref: keepRef(next.title) })
          : catalogKnown
            ? t('s.common.explore.passages')
            : null
      }
      onPrimary={() => {
        if (next) {
          session.selectBook(next.book);
          session.selectPack(next.packId);
          nav('/passage');
        } else nav('/pericopes');
      }}
    >
      <GlassSurface
        level={2}
        blur="strong"
        radius="2xl"
        shadow="card"
        className="s18-recap"
        data-role="recap"
      >
        <div className="s18-recap__body">
          <div className="s18-top">
            {/* A mark, not a button: glass with a check, so the primary stays the one dark fill. */}
            <span className="s18-mark" aria-hidden="true">
              <Icon name="check" size={Math.round(28 * Math.min(scale, 1.5))} stroke={2.4} />
            </span>
            {/* The frame's <h1> carries the headline for assistive tech; this is its visible face. */}
            <p className="s18-h1" aria-hidden="true">
              {headline}
            </p>
            <p className="s18-sum" data-role="summary">
              {stepsWords}
              {' · '}
              {t('s.completion.parts-of', { v: sum.visited, total: sum.total })}
            </p>
          </div>
          <div className="s18-overall" role="group" aria-label={stepsWords}>
            <div className="s18-segs">
              <StageRail
                className="s18-rail"
                stages={sum.steps}
                current={firstGap < 0 ? n : firstGap}
                progress={0}
                height={Math.round(6 * Math.min(scale, 1.67))}
                label={stepsWords}
              />
              <Bead kind="end" state="done" size={beadSize} kinds={KINDS} />
            </div>
            <ol className="s18-steps">
              {sum.steps.map((st, i) => (
                <li key={st.id} className="s18-step" data-reached={st.reached || undefined}>
                  <span className="s18-tick" aria-hidden="true">
                    {st.reached && <Icon name="check" size={iconSize(14)} stroke={2.2} />}
                  </span>
                  <span>
                    <span className="s18-step-n">{i + 1}</span> {st.title}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <hr className="s18-rule" />
          <h2 className="fia-overline s18-overline">{t('s.completion.went-through')}</h2>
          <ul className="s18-kinds">
            {kindLines.map((k) => (
              <li key={k.kind} className="s18-kind" data-kind={k.kind}>
                <span className="s18-legend-mark">
                  <Bead kind={k.kind} state="done" size={beadSize} kinds={KINDS} />
                </span>
                <span>{k.text}</span>
              </li>
            ))}
          </ul>
          <p className="fia-caption s18-kept">{t('s.completion.marks-kept')}</p>
        </div>
      </GlassSurface>
      <GlassSurface level={2} blur="medium" radius="xl" shadow="rest" className="s18-more">
        <ul className="s18-list">
          <Row
            first
            role="start-again"
            icon="headphones"
            label={t('s.completion.start-guide-again')}
            onOpen={() => {
              session.dispatch({ type: 'restart' });
              session.setView('guide');
              nav('/guide');
            }}
          />
          <Row
            role="feedback"
            icon="message"
            label={t('s.completion.send-feedback')}
            onOpen={() => nav('/feedback?from=S18')}
          />
          {saved ? (
            <Row
              role="saved"
              icon="check"
              label={t('s.completion.saved-ready')}
              onOpen={() => nav('/downloads')}
            />
          ) : (
            // Unmocked (v1 18 § States "not saved"): the row offers the save; offline it says it waits.
            <Row
              role="save"
              icon={online ? 'download' : 'cloudOff'}
              label={online ? t('s.completion.save-offline') : t('s.passage.save-row-offline')}
              onOpen={() => nav('/passage?save=1')}
            />
          )}
          {sum.skipped > 0 && (
            // Unmocked (v1 18 § States "some stops skipped"): the talks passed by stay one tap away.
            <Row
              role="review-skipped"
              icon="users"
              label={t('s.completion.review-skipped')}
              onOpen={() => nav('/overview')}
            />
          )}
        </ul>
      </GlassSurface>
    </ScreenFrame>
  );
}
