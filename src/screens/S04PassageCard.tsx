import { useEffect, useState, type ComponentType, type HTMLAttributes } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GlassButton, GlassSurface, Icon } from '../components/glass';
import { bookName } from '../flow/catalog';
import { FlowGate } from '../flow/ui/GuideChrome';
import { useGuide } from '../flow/ui/useGuide';
import { t } from '../i18n';
import { SaveRow, useSaveRow, useOffline } from '../offline';
import { GlassChip as KitGlassChip } from '../vendor/glass/components/glass/GlassChip';
import type { GlassChipProps } from '../vendor/glass/components/glass/GlassChip';
import { Bead as KitBead } from '../vendor/glass/components/progress/StageRail';
import type { BeadProps } from '../vendor/glass/components/progress/StageRail';
import {
  EMPTY_FACTS,
  keepRef,
  legendRows,
  rightsLine,
  startCopy,
  subLine,
  voiceOf,
  type LegendRow,
  type PackFacts,
} from './passageCard';
import { ScreenFrame } from './ScreenFrame';
import './S04PassageCard.css';

// S04 Passage card in glass (F6-S04; nodded mock cookbook design/alpha-v2-screens/04-passage-card.html,
// rev4; PRD § 4 row S04, § 8.1–8.5). Browse frame: header (shell) · quiet ‹ {book} · the reference as
// hero · "English · 6 steps · 130 parts" · the voice chip (kit GlassChip) · "Includes" (kit GlassSurface,
// the bead legend on the kit's progress Bead, taught before the guide starts) · "Save for offline" (kit
// GlassSurface + the tier picker on kit GlassSegmented) · sources line · the start line · one primary.
// Kept bones: Start / Continue / Start again into the guide, the save-intent primary (`?save=1` from S13),
// the C-07 save. Counts come from the pack (manifest.json counts, scripture.json editions, C-04 stops).

// Typing only (as components/glass.ts): the kit .d.ts omit the `...rest` the .jsx forward.
const GlassChip = KitGlassChip as unknown as ComponentType<
  GlassChipProps & HTMLAttributes<HTMLElement>
>;
const Bead = KitBead as unknown as ComponentType<BeadProps & HTMLAttributes<SVGElement>>;

/** --fia-text-scale per C-10 text step (settings/apply.ts; mock _frame.js:16-21). */
const STEP_SCALE: Record<string, number> = { x150: 1.5, x200: 2, x310: 3.1 };
const textScale = () =>
  STEP_SCALE[globalThis.document?.documentElement.getAttribute('data-text-step') ?? ''] ?? 1;

/** The pack's own counts and edition names (C-02 manifest.json, scripture.json); empty until read. */
function usePackFacts(packId: string | undefined): PackFacts {
  const [read, setRead] = useState<{ id?: string; facts: PackFacts }>({ facts: EMPTY_FACTS });
  useEffect(() => {
    if (!packId) return;
    let live = true;
    const json = (file: string) =>
      fetch(`/packs/${packId}/${file}`)
        .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
        .catch(() => null);
    void Promise.all([json('manifest.json'), json('scripture.json')]).then(([m, s]) => {
      if (!live) return;
      const man = m as { packId?: unknown; counts?: unknown } | null;
      const counts =
        man?.packId === packId && man.counts && typeof man.counts === 'object'
          ? (man.counts as Record<string, number>)
          : {};
      const eds = (s as { editions?: { short?: unknown }[] } | null)?.editions;
      const editions = Array.isArray(eds)
        ? eds.map((e) => e?.short).filter((x): x is string => typeof x === 'string')
        : [];
      setRead({ id: packId, facts: { counts, editions } });
    });
    return () => {
      live = false;
    };
  }, [packId]);
  return read.id === packId ? read.facts : EMPTY_FACTS;
}

/** "Includes": the legend, one shape + colour + word per kind (mock Includes; PRD § 8.3). */
function Includes({ rows }: { rows: LegendRow[] }) {
  const size = 10 * Math.min(textScale(), 2.4);
  return (
    <GlassSurface
      as="section"
      level={2}
      blur="medium"
      radius="xl"
      shadow="rest"
      className="s04-card s04-includes"
      aria-labelledby="s04-includes-heading"
    >
      <div className="s04-card__inner">
        <h2 id="s04-includes-heading" className="s04-overline">
          {t('s.passage.inc.heading')}
        </h2>
        <ul className="s04-kinds">
          {rows.map((r) => (
            <li key={r.kind} className="s04-kind" data-kind={r.kind}>
              <span className="s04-mark">
                <Bead kind={r.kind} state="done" size={size} color={`var(--s04-kind-${r.kind})`} />
              </span>
              <span className="s04-kind__text">
                <span className="s04-word">{r.word}</span>
                <span className="s04-count">{r.count}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="s04-note">{t('s.passage.kinds-note')}</p>
      </div>
    </GlassSurface>
  );
}

export default function S04PassageCard() {
  const nav = useNavigate();
  const loc = useLocation();
  const { session, snap } = useGuide();
  useEffect(() => void session.loadCatalog(), [session]);
  const entry = snap.manifest?.entries.find((e) => e.packId === snap.packId);
  const off = useOffline();
  const ctl = useSaveRow(snap.packId, undefined, () => nav('/sheet/storage?variant=quota'));
  const facts = usePackFacts(snap.packId);
  const seeDownloads = () => nav(`/downloads?from=${encodeURIComponent(snap.packId ?? '')}`);
  const { guide, state } = snap;
  if (!guide || !state) {
    return (
      <ScreenFrame id="S04" title={entry?.title} primaryLabel={null}>
        <FlowGate
          status={snap.guideStatus}
          hasPack={!!snap.packId}
          onRetry={() => void session.loadGuide(true)}
        />
      </ScreenFrame>
    );
  }
  const copy = startCopy(guide, state);
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
  const book = bookName(entry?.title ?? guide.title);
  const code = entry?.language ?? snap.language;
  const language = snap.manifest?.languages.find((l) => l.code === code)?.autonym ?? '';
  const voice = voiceOf(entry);
  return (
    <ScreenFrame
      id="S04"
      title={guide.title}
      offline={!off.online}
      primaryLabel={
        intent
          ? t('s.passage.primary-save', {
              tier: t(
                ctl.tier === 'original' ? 's.passage.tier.full' : `s.passage.tier.${ctl.tier}`,
              ),
              mb: ctl.sizeMb!,
            })
          : copy.primary
      }
      primaryState={intent && !ctl.canSave ? 'disabled' : 'default'}
      onPrimary={intent ? () => void ctl.save() : start}
    >
      <div className="s04-back">
        <GlassButton
          type="button"
          variant="quiet"
          size="md"
          className="s04-back__button"
          leading={<Icon name="chevronLeft" size={18} />}
          aria-label={t('s.passage.a11y.back', { book })}
          onClick={() => nav('/pericopes')}
        >
          {book}
        </GlassButton>
      </div>
      <div className="s04-head">
        {/* The frame's <h1> carries the reference for assistive tech; this is its visible face. */}
        <p className="s04-hero" aria-hidden="true">
          {keepRef(guide.title)}
        </p>
        <p className="s04-sub">{subLine(language, guide)}</p>
        <div className="s04-chips">
          <GlassChip
            className="s04-chip"
            data-voice={voice}
            leading={<Icon name={voice === 'ai' ? 'sparkle' : 'book'} size={13} />}
          >
            {voice === 'ai' ? t('s.common.mark.ai-voice') : t('s.passage.voice-not-yet')}
          </GlassChip>
        </div>
      </div>
      <Includes rows={legendRows(guide, entry, facts)} />
      {/* Offline the catalog is not saved; a saved passage still shows its verified row. */}
      {(entry || ctl.rowState.state !== 'none') && (
        <SaveRow ctl={ctl} intent={intent} onStart={start} onSeeDownloads={seeDownloads} />
      )}
      <p className="s04-rights">{rightsLine(facts)}</p>
      {!intent && (
        <p className="s04-start" data-testid="start-line">
          {copy.hint}
        </p>
      )}
    </ScreenFrame>
  );
}
