import { useEffect, useLayoutEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DiscussionStopBand, TextBlock } from '../components';
import { GuideTransport } from '../components/AudioControls';
import { GlassButton, GlassSurface, Icon } from '../components/glass';
import { GuidePrimary, type GuideGlyph } from '../components/PrimaryButton';
import { ProvenanceChip } from '../components/ProvenanceMark';
import { UNDO_MS, type FlowState } from '../flow/machine';
import { indexOf, isLast, isScriptureCue, position, stopAt, unitAt } from '../flow/model';
import type { FlowGuide } from '../flow/types';
import { bandModel } from '../flow/ui/band';
import { CardViews, FlowGate, PartChips, ProgressBand, StickyStrip } from '../flow/ui/GuideChrome';
import {
  iconSize,
  NB,
  partItems,
  tailWords,
  useTextScale,
  type CardView,
} from '../flow/ui/guideKit';
import { useGuide } from '../flow/ui/useGuide';
import { t } from '../i18n';
import { useGuideRights } from '../media/guideRights';
import { languageName } from '../media/lang';
import type { ResourcesPack } from '../media/resources';
import { STANDINS } from '../media/standin';
import { DEFAULT_PACK, usePackFile } from '../media/usePack';
import { DiscussionStopSheet } from './SH2DiscussionStop';
import { ProvenanceSheet } from './SH1ProvenanceInfo';
import { ScreenFrame } from './ScreenFrame';
import './s06.css';

/**
 * A talk the person has not had yet, on a part whose clip would close it (S05: the clip ends, then the
 * talk waits). With the voice off the reader's own reading stands for that clip.
 */
const talkAhead = (g: FlowGuide, s: FlowState) => {
  const stop = stopAt(g, s.unitId);
  return !!stop && !s.discussed.includes(stop.id) && s.hasAudio && s.phase !== 'stop';
};

/**
 * The line under the card (mock 06 FlowLine; PRD § 9.2): what follows this part and the only place the
 * guide waits, in the band's own words. None at a talk: the band and sheet 21 already say it.
 */
function flowLine(g: FlowGuide, s: FlowState): string | null {
  if (s.phase === 'stop') return null;
  if (isLast(g, s.unitId)) return t('s.script.flow.guide-ends');
  const b = bandModel(g, s.unitId);
  if (b.n === b.m) return t('s.script.flow.next-step', { n: b.stepIndex + 2 });
  if (b.tail.kind === 'talk-here') return t('s.script.flow.next-only', { n: b.n + 1 });
  // The line breaks after the dot, never before it (mock SEP, _frame.js:81).
  return t('s.script.flow.next', { n: b.n + 1, tail: tailWords(b.tail) }).replace(' · ', `${NB}· `);
}

// S06 Guide · read without voice (BUILD-ORDER F6-S06; nodded mock design/alpha-v2-screens/
// 06-single-script.html; PRD § 4 S06, § 8.1 "S06 is the Guide view with voice off, not a fourth view",
// § 8.2 "Voice off | Next part", § 9.2 the single script flows part to part). The same frame and shared
// parts as S05 (F4, F5): glass header · progress band · the guide card (Guide · Text · Resources, the
// unit text, "In this part") · the thumb zone Back · the big button · Skip. What voice off changes:
// the voice chip's slot holds "Voice off · Turn voice on" (back to S05 at the same part), there is no
// time line and no arc, the big button reads "Next part", and a line under the card says what follows
// and where the guide waits. Nothing plays on this screen: it has no media element (R-407).
export default function S06SingleScript() {
  const nav = useNavigate();
  const { session, snap } = useGuide();
  const { guide, state } = snap;
  const scale = useTextScale();
  const packId = snap.packId ?? DEFAULT_PACK;
  const resources = usePackFile<ResourcesPack>(packId, 'resources');
  const [collapsed, setCollapsed] = useState(false);
  const [reopen, setReopen] = useState(false);
  const [about, setAbout] = useState(false);
  const rights = useGuideRights(snap.packId, about);
  const phase = state?.phase;
  const unitId = state?.unitId;

  // This is the session's single-script view (C-09 workspace `view`), recorded once the guide is in.
  const ready = !!guide;
  useEffect(() => {
    if (ready && session.get().view !== 'single-script') session.setView('single-script');
  }, [ready, session]);

  // The narration mode may have changed in S14 since the guide loaded (R-501): keeps `hasAudio` true.
  useEffect(() => session.refreshNarration(), [session, guide?.packId]);

  // Voice off: nothing plays here. A part left playing or counting down elsewhere stops and waits.
  // A talk not yet had waits at once, as the kept machine does for a part with no voice (machine.ts
  // `enter`); for a part that has a clip the part closes the way the clip's end closes it on S05
  // (play → narration-end; this screen has no media element), and sheet 21 rises as it does there.
  useEffect(() => {
    if (!guide || !state) return;
    if (state.phase === 'playing') session.dispatch({ type: 'pause' });
    else if (state.phase === 'countdown') session.dispatch({ type: 'wait' });
    else if (state.phase !== 'finished' && talkAhead(guide, state)) {
      session.dispatch({ type: 'play' });
      session.dispatch({ type: 'narration-end' });
    }
  }, [guide, state, session]);

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

  // A new part: a reopened sheet closes.
  useEffect(() => setReopen(false), [unitId]);

  // At 1× sheet 21 rises only to just under the band, which stays undimmed above it (mock 21, as S05).
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
      <ScreenFrame frame="guide" id="S06" primaryLabel={null} titleHidden>
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
  const items = partItems(unit, resources.status === 'ready' ? resources.data : null);
  const cue = isScriptureCue(unit, guide.title);
  const aiText = guide.provenance === 'generated';
  const line = flowLine(guide, state);

  // The big button with the voice off (PRD § 8.2): "Next part", no arc; the step's last part reads
  // "Next step" and the guide's last "Finish", as on S05; at a talk, "We talked — continue".
  const gp: { glyph: GuideGlyph; label: string } = atStop
    ? { glyph: 'check', label: last ? t('s.stop.primary.finish') : t('s.stop.primary.continue') }
    : {
        glyph: 'next',
        label: last
          ? t('s.guide.primary-finish')
          : n === p.unitCount
            ? t('s.guide.gp.next-step')
            : t('s.guide.gp.next'),
      };

  const press = () => {
    if (talkAhead(guide, state)) {
      // Never past a talk on the big button (R-410): it waits there first, as the effect above does.
      session.dispatch({ type: 'play' });
      session.dispatch({ type: 'narration-end' });
      return;
    }
    if (atStop) {
      setCollapsed(false);
      setReopen(false);
      session.dispatch({ type: 'stop-sheet-seen' });
    }
    session.dispatch({ type: 'continue' });
  };

  const turnVoiceOn = () => {
    session.setView('guide');
    nav('/guide');
  };

  const toView = (v: CardView) => {
    if (v === 'guide') return;
    const q = `?pack=${encodeURIComponent(packId)}&unit=${encodeURIComponent(unitId)}`;
    nav(v === 'text' ? `/scripture${q}` : `/resources${q}`);
  };

  const primary = (
    <GuidePrimary
      glyph={gp.glyph}
      label={gp.label}
      row={scale > 1}
      state={atStop ? 'discussion-stop' : 'default'}
      onPress={press}
    />
  );
  const transport = (part: 'all' | 'primary' | 'column') => (
    <GuideTransport
      part={part}
      primary={primary}
      iconSize={iconSize(18, scale)}
      time={null}
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

  // The question at a talk: the stop's own words, or the parent's for a pause cue the PoC speaks
  // inside its parent's clip (stand-in `spoken-in-parent`), as S05 quotes it. No clip: voice is off.
  const parentId = snap.narrationStandIn
    ? STANDINS[guide.packId]?.silent.find((s) => s.unitId === unitId)?.parent
    : undefined;
  const question = parentId ? unitAt(guide, indexOf(guide, parentId)) : unit;
  // Above 1× the views are a vertical list below the text (mock README § Large text), as S05.
  const viewsFirst = scale <= 1;
  const views = <CardViews active="guide" count={items.length} scale={scale} onView={toView} />;

  return (
    <ScreenFrame
      frame="guide"
      id="S06"
      title={guide.title}
      titleHidden
      thumb={transport(scale > 1 ? 'primary' : 'all')}
    >
      <div
        className="fia-guide fia-guide--voice-off"
        data-phase={phase}
        data-unit-id={unitId}
        data-voice="off"
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
            <div className="fia-guide-card__voice fia-voice-row">
              <GlassButton
                variant="quiet"
                size="md"
                className="fia-btn fia-quiet fia-voice-off"
                aria-label={t('s.script.a11y.voice-off')}
                leading={<Icon name="headphones" size={iconSize(18, scale)} />}
                onClick={turnVoiceOn}
              >
                <span>
                  <b>{t('s.script.voice-off')}</b>
                  {` · ${t('s.script.turn-voice-on')}`}
                </span>
              </GlassButton>
              {aiText && (
                // AI is always named (C-06): with the voice chip gone, an AI-translated text keeps its mark.
                <ProvenanceChip
                  provenance="ai-translation"
                  words={t('s.common.mark.ai-translation')}
                  iconSize={iconSize(14, scale)}
                  onInfo={() => setAbout(true)}
                />
              )}
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
                  onClick={() => toView('text')}
                >
                  {t('s.guide.read-scripture', { ref: guide.title })}
                </GlassButton>
              )}
            </div>
            {!viewsFirst && views}
          </div>
        </GlassSurface>
        {line && (
          <p className="fia-caption fia-num fia-flow-line" role="note">
            {line}
          </p>
        )}
        {scale > 1 && transport('column')}
      </div>
      {stop && (
        <DiscussionStopSheet
          guide={guide}
          state={state}
          open={sheetOpen}
          scale={scale}
          height={sheetTop != null ? `calc(100% - ${sheetTop}px)` : undefined}
          question={question}
          questionClip={null}
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
          from="S06"
          textMark="ai-translation"
          input={{
            domain: 'text',
            slot: { status: 'generated' },
            language: languageName(guide.language),
            rights,
          }}
        />
      )}
    </ScreenFrame>
  );
}
