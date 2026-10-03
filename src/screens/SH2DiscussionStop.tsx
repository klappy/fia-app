import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProgressRail, Sheet } from '../components';
import { GlassButton, GlassChip, GlassSurface, Icon } from '../components/glass';
import { ProvenanceChip } from '../components/ProvenanceMark';
import { KitPrimary } from '../components/PrimaryButton';
import type { Provenance } from '../components/types';
import { isLast, stopAt, unitAt, indexOf } from '../flow/model';
import { useFlow, flowSession } from '../flow/session';
import type { FlowState } from '../flow/machine';
import type { FlowGuide, GuideUnit } from '../flow/types';
import { bandModel } from '../flow/ui/band';
import { PartChips } from '../flow/ui/GuideChrome';
import { bandCaption, type PartItem } from '../flow/ui/guideKit';
import { t } from '../i18n';
import type { ClipRef } from '../media/provenance';

export interface DiscussionStopSheetProps {
  guide: FlowGuide;
  state: FlowState;
  open: boolean;
  onContinue: () => void;
  /** tap outside / Escape: collapse to the band on 05, nothing is lost (21 § States). */
  onCollapse: () => void;
  /** the sheet's height: at 1× it rises to just under the progress band (mock 21) */
  height?: string;
  /** text scale: at 200% and above the sheet is full height and carries the beads itself */
  scale?: number;
  /**
   * The unit whose words are the question. Default: the stop's own unit. A pause cue the PoC speaks
   * inside its parent's clip (stand-in `spoken-in-parent`) quotes the parent, as the PoC does.
   */
  question?: GuideUnit;
  /** the question's clip, for "Hear the question again" */
  questionClip?: ClipRef | null;
  /** the question voice's mark (the honesty chip beside "Hear the question again") */
  voiceMark?: Provenance;
  items?: PartItem[];
}

/** "Hear the question again": its own media element, so the guide's position and state never move. */
function HearAgain({ clip }: { clip: ClipRef }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => ref.current?.pause(), []);
  return (
    <>
      <audio
        ref={ref}
        src={clip.url}
        preload="none"
        data-role="question-audio"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        hidden
      />
      <GlassButton
        variant="quiet"
        size="md"
        className="fia-btn fia-quiet fia-stop-again"
        leading={<Icon name={playing ? 'pause' : 'play'} size={16} />}
        aria-pressed={playing}
        onClick={() => {
          const a = ref.current;
          if (!a) return;
          if (a.paused) {
            if (a.ended) a.currentTime = 0;
            void a.play().catch(() => setPlaying(false));
          } else a.pause();
        }}
      >
        {t('s.stop.hear-again')}
      </GlassButton>
    </>
  );
}

// SH-2 Talk together (spec 21; nodded mock design/alpha-v2-screens/21-sheet-discussion-stop.html), on
// the kit's navigation/GlassSheet. Non-blocking: the band stays readable above it at 1×; the quoted
// question is the source text, verbatim (R-409). One primary: "We talked — continue" (check).
export function DiscussionStopSheet({
  guide,
  state,
  open,
  onContinue,
  onCollapse,
  height,
  scale = 1,
  question,
  questionClip,
  voiceMark,
  items = [],
}: DiscussionStopSheetProps) {
  const stop = stopAt(guide, state.unitId);
  if (!stop) return null;
  const unit = question ?? unitAt(guide, indexOf(guide, state.unitId));
  const b = bandModel(guide, state.unitId);
  const discussed = state.discussed.includes(stop.id);
  const primary = discussed
    ? t('s.stop.primary.resume')
    : isLast(guide, state.unitId)
      ? t('s.stop.primary.finish')
      : t('s.stop.primary.continue');
  const big = scale >= 2;
  return (
    <Sheet
      brand
      open={open}
      title={t('s.stop.v2.title')}
      titleIcon={
        <span className="fia-stop-title-icon" aria-hidden>
          <Icon name="users" size={22} />
        </span>
      }
      description={t('s.stop.v2.after', { n: b.n, m: b.m, step: b.stepTitle })}
      onClose={onCollapse}
      closeButton={false}
      tall={big}
      height={big ? undefined : height}
      state="discussion-stop"
      className="fia-sheet--stop"
      actions={<KitPrimary label={primary} icon="check" onPress={onContinue} />}
    >
      {big && (
        <div className="fia-stop-inside">
          <ProgressRail
            steps={b.steps}
            currentStep={b.stepIndex}
            progress={b.progress}
            beads={b.beads}
            before={b.before}
            after={b.after}
            scale={scale}
            stepsLabel={t('s.guide.a11y.band-steps', {
              n: b.stepIndex + 1,
              m: b.steps.length,
              stage: b.stepTitle,
            })}
          />
          <p className="fia-caption fia-num">{bandCaption(b)}</p>
        </div>
      )}
      {discussed && (
        <GlassChip className="fia-chip" leading={<Icon name="check" size={13} />}>
          {t('s.stop.discussed-mark')}
        </GlassChip>
      )}
      <p className="fia-body fia-stop-lead">
        <strong>{t('s.stop.v2.lead-strong')}</strong> {t('s.stop.v2.lead')}
      </p>
      {unit?.text ? (
        <GlassSurface level={3} blur="soft" radius="xl" shadow="none" className="fia-stop-q">
          <div className="fia-stop-q__inner">
            <span className="fia-overline fia-stop-q__label">{t('s.stop.v2.question')}</span>
            <blockquote className="fia-stop-quote" dir="auto" lang={guide.language}>
              “{unit.text}”
            </blockquote>
            {(questionClip || voiceMark) && (
              <div className="fia-stop-again-row">
                {questionClip && <HearAgain clip={questionClip} />}
                {voiceMark && (
                  <ProvenanceChip
                    provenance={voiceMark}
                    words={
                      voiceMark === 'absent'
                        ? t('s.guide.voice-none')
                        : voiceMark === 'source'
                          ? t('s.common.mark.source')
                          : t('s.common.mark.ai-voice')
                    }
                  />
                )}
              </div>
            )}
          </div>
        </GlassSurface>
      ) : null}
      <PartChips items={items} packId={guide.packId} unitId={state.unitId} scale={scale} />
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
        title={t('s.stop.v2.title')}
        closeButton={false}
        onClose={() => nav(-1)}
        actions={
          <KitPrimary
            label={t('s.stop.primary.resume')}
            icon="check"
            onPress={() => nav('/guide')}
          />
        }
      >
        <p className="fia-body">{t('s.stop.body')}</p>
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
