import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DiscussionStopBand, TextBlock } from '../components';
import { GuideTransport } from '../components/AudioControls';
import { GlassButton, GlassSurface, Icon } from '../components/glass';
import { GuidePrimary, type GuideGlyph } from '../components/PrimaryButton';
import { ProvenanceChip } from '../components/ProvenanceMark';
import type { Provenance } from '../components/types';
import { COUNTDOWN_MS, UNDO_MS, primaryAction, primaryKind } from '../flow/machine';
import { indexOf, isLast, isScriptureCue, position, stopAt, unitAt } from '../flow/model';
import { CardViews, FlowGate, PartChips, ProgressBand, StickyStrip } from '../flow/ui/GuideChrome';
import { iconSize, partItems, useTextScale, type CardView } from '../flow/ui/guideKit';
import { useGuide } from '../flow/ui/useGuide';
import { t } from '../i18n';
import { languageName } from '../media/lang';
import type { ResourcesPack } from '../media/resources';
import { formatClock } from '../media/seek';
import { STANDINS } from '../media/standin';
import { DEFAULT_PACK, usePackFile } from '../media/usePack';
import { DiscussionStopSheet } from './SH2DiscussionStop';
import { useGuideRights } from '../media/guideRights';
import { ProvenanceSheet } from './SH1ProvenanceInfo';
import { ScreenFrame } from './ScreenFrame';

// S05 Guide, v2 (BUILD-ORDER F5; nodded mock design/alpha-v2-screens/05-guide.html; PRD § 4 S05, § 8):
// glass header (ScreenFrame) · progress band (overall steps + coded beads) · the guide card (Guide ·
// Text · Resources, the voice chip, the unit text, "In this part") · the thumb zone: Back · the one
// big button · Skip. No bar. The kept flow machine (flow/machine.ts) owns every state; this screen
// plays its clips through one media element and reports `narration-end` back (R-407: nothing plays
// unless the big button is pressed; a countdown of 2 s carries into the next part, RULING).
// The clips are the pack's C-05 narration, or until B2b the stand-in: the PoC's live clips (media/standin).
export default function S05Guide() {
  const nav = useNavigate();
  const { session, snap } = useGuide();
  const { guide, state } = snap;
  const scale = useTextScale();
  const packId = snap.packId ?? DEFAULT_PACK;
  const resources = usePackFile<ResourcesPack>(packId, 'resources');
  const [collapsed, setCollapsed] = useState(false);
  const [reopen, setReopen] = useState(false);
  const [about, setAbout] = useState(false);
  const [clipError, setClipError] = useState(false);
  const [clock, setClock] = useState({ t: 0, d: 0 });
  const [left, setLeft] = useState(COUNTDOWN_MS / 1000);
  const audio = useRef<HTMLAudioElement>(null);
  const phase = state?.phase;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const unitId = state?.unitId;
  const choice = unitId ? snap.narration?.get(unitId) : undefined;
  const clip = choice?.clip ?? null;
  const rights = useGuideRights(snap.packId, about);

  // The narration mode may have changed in S14 since the guide loaded (R-501).
  useEffect(() => session.refreshNarration(), [session, guide?.packId]);

  useEffect(() => {
    if (phase !== 'countdown') return;
    const tick = setInterval(() => setLeft((s) => Math.max(1, s - 1)), 1000);
    const id = setTimeout(() => session.dispatch({ type: 'countdown-done' }), COUNTDOWN_MS);
    return () => {
      clearTimeout(id);
      clearInterval(tick);
      setLeft(COUNTDOWN_MS / 1000); // the next countdown starts its label at 2 s
    };
  }, [phase, session]);

  const undo = state?.undo;
  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => session.dispatch({ type: 'undo-expired' }), UNDO_MS);
    return () => clearTimeout(id);
  }, [undo, session]);

  const finished = state?.finished;
  useEffect(() => {
    if (finished) nav('/done');
  }, [finished, nav]);

  // A new part: its clock starts from the clip's known length; a reopened sheet closes.
  useEffect(() => {
    setClock({ t: 0, d: clip?.durationSec ?? 0 });
    setClipError(false);
    setReopen(false);
  }, [unitId, clip?.url, clip?.durationSec]);

  // The machine drives the media element: playing plays, every other phase is silent.
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    if (phase === 'playing' && clip) {
      void a.play().catch((e: unknown) => {
        if ((e as { name?: string })?.name === 'AbortError') return; // a newer load took over
        setClipError(true);
        session.dispatch({ type: 'pause' });
      });
    } else if (!a.paused) a.pause();
  }, [phase, clip, session]);

  // Leaving the screen never leaves the session "playing" or counting down (nothing plays unseen).
  useEffect(
    () => () => {
      if (phaseRef.current === 'playing') session.dispatch({ type: 'pause' });
      if (phaseRef.current === 'countdown') session.dispatch({ type: 'wait' });
    },
    [session],
  );

  // At 1× sheet 21 rises only to just under the band, which stays undimmed above it (mock 21).
  const atStop = phase === 'stop';
  const sheetOpen = atStop && (reopen || (!state?.stopSheetSeen && !collapsed));
  const [sheetTop, setSheetTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const band = document.getElementById('fia-band')?.getBoundingClientRect();
    const fits = sheetOpen && scale < 2 && !!band && band.bottom > 0;
    setSheetTop(fits ? Math.ceil(band!.bottom + 10) : null);
  }, [sheetOpen, scale, unitId]);

  if (!guide || !state || !unitId) {
    return (
      <ScreenFrame id="S05" primaryLabel={null} titleHidden>
        <FlowGate
          status={snap.guideStatus}
          hasPack={!!snap.packId}
          onRetry={() => void session.loadGuide(true)}
        />
      </ScreenFrame>
    );
  }

  const idx = indexOf(guide, unitId);
  const unit = unitAt(guide, idx)!;
  const p = position(guide, unitId);
  const n = p.unitIndex + 1;
  const last = isLast(guide, unitId);
  const stop = stopAt(guide, unitId);
  const kind = primaryKind(guide, state);
  const items = partItems(unit, resources.status === 'ready' ? resources.data : null);
  const cue = isScriptureCue(unit, guide.title);
  const language = languageName(guide.language);

  // The voice this part has (C-06; AI is always named): the chip in the card, and sheet 20.
  const mark: Provenance = clip ? choice!.mark : 'absent';
  const voiceWords = clip
    ? mark === 'source'
      ? t('s.common.mark.source')
      : t('s.common.mark.ai-voice')
    : choice?.silent === 'source-only-silent'
      ? t('s.guide.voice-silent')
      : t('s.guide.voice-none');

  // The big button: same slot, same shape, one verb per state (PRD § 8.2).
  const arcValue = clock.d > 0 ? Math.min(1, clock.t / clock.d) : 0;
  const gp: {
    glyph: GuideGlyph;
    label: string;
    sub?: string;
    aria?: string;
    arc?: { value: number; seconds?: number };
  } =
    phase === 'playing'
      ? { glyph: 'pause', label: t('s.guide.gp.pause'), arc: { value: arcValue } }
      : phase === 'paused'
        ? { glyph: 'play', label: t('s.guide.gp.continue'), arc: { value: arcValue } }
        : phase === 'idle'
          ? { glyph: 'play', label: t('s.guide.gp.play', { n }) }
          : phase === 'countdown'
            ? {
                glyph: 'pause',
                label: t('s.guide.gp.countdown', { s: left }),
                sub: t('s.guide.gp.tap-to-wait'),
                aria: t('s.guide.gp.a11y-countdown', { s: left }),
                arc: { value: 1, seconds: COUNTDOWN_MS / 1000 },
              }
            : phase === 'stop'
              ? {
                  glyph: 'check',
                  label: last ? t('s.stop.primary.finish') : t('s.stop.primary.continue'),
                }
              : {
                  glyph: 'next',
                  label: last
                    ? t('s.guide.primary-finish')
                    : n === p.unitCount
                      ? t('s.guide.gp.next-step')
                      : t('s.guide.gp.next'),
                };

  const press = () => {
    // Start the media element inside the tap itself (phones that unlock audio only on a gesture);
    // the machine's `playing` effect below then finds it already playing.
    if ((kind === 'play' || kind === 'resume') && clip && state.hasAudio)
      void audio.current?.play().catch(() => undefined);
    if (atStop) {
      setCollapsed(false);
      setReopen(false);
      session.dispatch({ type: 'stop-sheet-seen' });
    }
    session.dispatch(primaryAction(kind));
  };

  const view = (v: CardView) => {
    if (v === 'guide') return;
    const q = `?pack=${encodeURIComponent(packId)}&unit=${encodeURIComponent(unitId)}`;
    nav(v === 'text' ? `/scripture${q}` : `/resources${q}`);
  };

  const primary = (
    <GuidePrimary
      glyph={gp.glyph}
      label={gp.label}
      sub={gp.sub}
      ariaLabel={gp.aria}
      arc={gp.arc}
      row={scale > 1}
      state={
        atStop
          ? 'discussion-stop'
          : phase === 'countdown'
            ? 'countdown'
            : phase === 'playing'
              ? 'playing'
              : 'default'
      }
      onPress={press}
    />
  );
  const transport = (part: 'all' | 'primary' | 'column') => (
    <GuideTransport
      part={part}
      primary={primary}
      iconSize={iconSize(18, scale)}
      time={
        clip
          ? t('s.guide.clip-length', { elapsed: formatClock(clock.t), total: formatClock(clock.d) })
          : null
      }
      back={{
        label: t('s.guide.back'),
        ariaLabel: t('s.guide.a11y.back'),
        disabled: idx === 0,
        onPress: () => session.dispatch({ type: 'back' }),
      }}
      skip={{
        label: t('s.guide.skip'),
        ariaLabel: t('s.guide.a11y.skip'),
        disabled: last,
        onPress: () => session.dispatch({ type: 'skip' }),
      }}
    />
  );

  // The question at a stop: the stop's own words, or the parent's for a pause cue the PoC speaks
  // inside its parent's clip (stand-in `spoken-in-parent`).
  const parentId = snap.narrationStandIn
    ? STANDINS[guide.packId]?.silent.find((s) => s.unitId === unitId)?.parent
    : undefined;
  const question = parentId ? unitAt(guide, indexOf(guide, parentId)) : unit;
  const qChoice = question ? snap.narration?.get(question.id) : undefined;
  const viewsFirst = scale < 2;
  const views = <CardViews active="guide" count={items.length} scale={scale} onView={view} />;

  return (
    <ScreenFrame
      id="S05"
      title={guide.title}
      titleHidden
      thumb={transport(scale > 1 ? 'primary' : 'all')}
    >
      <div
        className="fia-guide"
        data-phase={phase}
        data-unit-id={unitId}
        data-has-audio={state.hasAudio}
        data-narration={snap.narrationStandIn ? 'standin' : 'pack'}
      >
        {scale >= 2 && <StickyStrip guide={guide} unitId={unitId} />}
        <ProgressBand guide={guide} unitId={unitId} scale={scale} lifted={sheetOpen && scale < 2} />
        {snap.changed.includes(unitId) && (
          <p className="fia-caption fia-guide-note" role="status">
            {t('s.guide.unit-changed')}
          </p>
        )}
        {atStop && !sheetOpen && (
          <DiscussionStopBand
            lead={t('s.stop.v2.band', { n })}
            state="discussion-stop"
            action={{ label: t('s.stop.v2.open'), onPress: () => setReopen(true) }}
          />
        )}
        {state.undo && (
          <DiscussionStopBand
            lead={t('s.stop.undo-band')}
            undoLabel={t('s.stop.undo')}
            onUndo={() => session.dispatch({ type: 'undo' })}
          />
        )}
        <GlassSurface level={2} blur="strong" radius="2xl" shadow="card" className="fia-guide-card">
          <div className="fia-guide-card__inner">
            {viewsFirst && views}
            <div className="fia-guide-card__voice">
              <ProvenanceChip
                provenance={mark}
                words={voiceWords}
                ariaLabel={t('s.guide.a11y.voice-chip', { mark: voiceWords })}
                iconSize={iconSize(14, scale)}
                onInfo={() => setAbout(true)}
              />
            </div>
            <div className="fia-card-body">
              <TextBlock
                kind="guide"
                lang={guide.language}
                segments={[{ id: unit.id, text: unit.text, html: unit.html }]}
                state={atStop ? 'discussion-stop' : 'default'}
              />
              <PartChips items={items} packId={packId} unitId={unitId} scale={scale} />
              {cue && (
                <GlassButton
                  variant="quiet"
                  size="md"
                  className="fia-btn fia-quiet fia-guide-cue"
                  leading={<Icon name="book" size={iconSize(18, scale)} />}
                  onClick={() => view('text')}
                >
                  {t('s.guide.read-scripture', { ref: guide.title })}
                </GlassButton>
              )}
            </div>
            {!viewsFirst && views}
          </div>
        </GlassSurface>
        {clipError && (
          <p className="fia-caption fia-guide-note" role="alert">
            {t('s.guide.error-clip')}
          </p>
        )}
        {scale > 1 && transport('column')}
        <audio
          ref={audio}
          src={clip?.url}
          preload="none"
          hidden
          data-clip-id={clip?.id}
          data-unit-id={unitId}
          onTimeUpdate={(e) => {
            const a = e.currentTarget;
            setClock({ t: a.currentTime, d: Number.isFinite(a.duration) ? a.duration : clock.d });
          }}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d)) setClock((c) => ({ ...c, d }));
          }}
          onEnded={() => session.dispatch({ type: 'narration-end' })}
          onError={() => {
            if (phaseRef.current !== 'playing') return;
            setClipError(true);
            session.dispatch({ type: 'pause' });
          }}
        />
      </div>
      {stop && (
        <DiscussionStopSheet
          guide={guide}
          state={state}
          open={sheetOpen}
          scale={scale}
          height={sheetTop != null ? `calc(100% - ${sheetTop}px)` : undefined}
          question={question}
          questionClip={qChoice?.clip ?? null}
          voiceMark={qChoice?.clip ? qChoice.mark : undefined}
          items={items}
          onContinue={press}
          onCollapse={() => {
            setCollapsed(true);
            setReopen(false);
            session.dispatch({ type: 'stop-sheet-seen' });
          }}
        />
      )}
      {about && (
        <ProvenanceSheet
          onClose={() => setAbout(false)}
          from="S05"
          description={t('s.prov.v2.narration-for', { n, m: p.unitCount, title: guide.title })}
          textMark={guide.provenance === 'generated' ? 'ai-translation' : 'source'}
          input={{
            domain: 'audio',
            slot: clip
              ? { status: mark === 'source' ? 'source' : 'generated' }
              : { status: 'absent' },
            language,
            sourceOnlySilent: choice?.silent === 'source-only-silent',
            guidePart: true,
            rights,
          }}
        />
      )}
    </ScreenFrame>
  );
}
