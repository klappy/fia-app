import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AbsentBadge, SecondaryAction, ToastNotice } from '../components';
import { GuideTransport } from '../components/AudioControls';
import { GlassButton, GlassSelect, Icon } from '../components/glass';
import { GuidePrimary, type GuideGlyph } from '../components/PrimaryButton';
import { ProvenanceChip } from '../components/ProvenanceMark';
import { CardViews, ProgressBand } from '../flow/ui/GuideChrome';
import { iconSize, partItems, useTextScale, type CardView } from '../flow/ui/guideKit';
import { useGuide } from '../flow/ui/useGuide';
import { indexOf, unitAt } from '../flow/model';
import type { ResourcesPack } from '../media/resources';
import { formatClock } from '../media/seek';
import { t } from '../i18n';
import { languageName } from '../media/lang';
import {
  editionSwitchTarget,
  positionAt,
  seekToVerse,
  seekToWord,
  splitVerse,
  timingMode,
  usableAlignment,
  type AlignmentSidecar,
  type EditionSwitchSeek,
} from '../media/alignment';
import { clipsFor, scriptureClipId, type NarrationManifest } from '../media/narration';
import { selectNarration } from '../media/provenance';
import { readerEditions, sameVerseIndex, type ScripturePack } from '../media/scripture';
import { PROVENANCE_SHEET_PATH, type ProvenanceSheetState } from '../media/sheet';
import { useClip } from '../media/useClip';
import {
  CONTENT_BASE,
  DEFAULT_PACK,
  packLanguage,
  packUrl,
  useOnline,
  usePackFile,
} from '../media/usePack';
import { ScreenFrame } from './ScreenFrame';
import { GuideCard } from '../frame/GuideCard';

// S08 — Scripture reader, v2 (spec 08 as wireframe; nodded mock cookbook design/alpha-v2-screens/
// 08-scripture-reader.html; PRD § 4 S08 "the card's Text view"). Composed of S05's shared parts: the
// glass frame (ScreenFrame), the progress band, the guide card with Guide · Text · Resources (CardViews,
// Text active), the voice chip (ProvenanceChip → sheet 20), the thumb zone (GuideTransport + GuidePrimary,
// the arc is the reading's elapsed time). Kept v1 bones: editions from the catalog (kit GlassSelect),
// verse text with the word/verse band from a C-12 sidecar bound to the playing clip, tap a word or a
// verse to seek, "Play this verse again", the untimed notice once per session (R-503..R-505, SB-6).
let untimedNoticeShown = false; // SB-6: once per session

export default function S08ScriptureReader() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const packId = params.get('pack') ?? DEFAULT_PACK;
  const unit = params.get('unit');
  const lang = packLanguage(packId);
  const online = useOnline();
  const scale = useTextScale();
  const { snap } = useGuide();
  const guide = snap.guide && snap.guide.packId === packId ? snap.guide : undefined;
  // The band follows the guide's own position (the reader never moves it, PRD § 8.1).
  const guideUnit = guide ? snap.state?.unitId : undefined;
  const resources = usePackFile<ResourcesPack>(packId, 'resources');
  const gu = guide && guideUnit ? unitAt(guide, indexOf(guide, guideUnit)) : undefined;
  const unitItems = gu ? partItems(gu, resources.status === 'ready' ? resources.data : null) : [];
  const scripture = usePackFile<ScripturePack>(packId, 'scripture');
  const narration = usePackFile<NarrationManifest>(packId, 'narration');
  const editions = useMemo(
    () => (scripture.status === 'ready' ? readerEditions(scripture.data) : []),
    [scripture],
  );
  const [edIdx, setEdIdx] = useState(0);
  const [anchorRef, setAnchorRef] = useState<string | null>(null);
  const ed = editions[edIdx];
  const packEd =
    scripture.status === 'ready'
      ? scripture.data.editions.find((e) => e.short === ed?.short)
      : undefined;
  const textSha = packEd?.textSha256;

  const clipId = ed ? scriptureClipId(ed.short) : '';
  const choice = selectNarration(
    'source-fallback', // L5 owns settings (C-10); default per R-501
    clipsFor(narration.status === 'ready' ? narration.data : null, clipId, textSha, CONTENT_BASE),
  );
  const clip = useClip(
    choice.clip?.url,
    `${clipId}@${choice.clip?.sha256 ?? ''}`,
    choice.clip?.durationSec,
  );

  const [sidecar, setSidecar] = useState<AlignmentSidecar | null>(null);
  useEffect(() => {
    setSidecar(null);
    if (!ed) return;
    let live = true;
    fetch(packUrl(packId, `alignment/${clipId}`))
      .then((r) => (r.ok ? (r.json() as Promise<AlignmentSidecar>) : null))
      .then((s) => live && setSidecar(s))
      .catch(() => live && setSidecar(null));
    return () => {
      live = false;
    };
  }, [packId, clipId, ed]);
  const aligned = usableAlignment(sidecar, choice.clip?.sha256);
  const mode = timingMode(aligned);
  const pos = aligned ? positionAt(aligned, clip.elapsed) : { verse: -1, word: -1 };

  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!choice.clip) return setNotice(null);
    if (mode === 'word') setNotice(t('s.scripture.notice-timed'));
    else if (mode === 'verse') setNotice(t('s.scripture.notice-verse'));
    else if (!untimedNoticeShown) setNotice(null);
  }, [mode, choice.clip]);

  const openSheet = () => {
    const state: ProvenanceSheetState = {
      domain: 'audio',
      slot: choice.clip
        ? { status: choice.mark === 'source' ? 'source' : 'generated' }
        : { status: 'absent' },
      scripture: true,
      edition: ed?.short,
      typeKey: 'scripture',
      language: languageName(lang),
      readsEnglish: !!ed?.fallback,
      sourceOnlySilent: choice.silent === 'source-only-silent',
    };
    nav(PROVENANCE_SHEET_PATH, { state });
  };

  const tapVerse = (vi: number, ref: string) => {
    setAnchorRef(ref);
    if (!choice.clip) return;
    if (aligned && mode !== 'none') {
      const i = aligned.verses.findIndex((v) => v.sourceId === ed!.verses[vi].sourceId);
      const s = i >= 0 ? seekToVerse(aligned, i) : null;
      if (s !== null) clip.playFrom(s);
    } else if (!untimedNoticeShown) {
      untimedNoticeShown = true;
      setNotice(t('s.scripture.notice-untimed'));
    }
  };

  // Spec 08: switching edition keeps the audio position by verse (seek only, no autoplay).
  const [pendingSwitch, setPendingSwitch] = useState<EditionSwitchSeek | null>(null);
  const { seek } = clip;
  useEffect(() => {
    const target = editionSwitchTarget(pendingSwitch, aligned, clipId);
    if (target === null) return;
    setPendingSwitch(null);
    seek(target);
  }, [pendingSwitch, aligned, clipId, seek]);

  const switchEdition = (i: number) => {
    const ref = anchorRef ?? ed?.verses[Math.max(0, pos.verse)]?.ref ?? null;
    const to = editions[i];
    setPendingSwitch(
      aligned && clip.elapsed > 0 && to && to.short !== ed?.short
        ? { from: aligned, t: clip.elapsed, toClipId: scriptureClipId(to.short) }
        : null,
    );
    setEdIdx(i);
    const vi = sameVerseIndex(to, ref);
    setAnchorRef(to.verses[vi]?.ref ?? null);
  };
  useEffect(() => {
    if (anchorRef) document.getElementById(`v-${anchorRef}`)?.scrollIntoView({ block: 'center' });
  }, [anchorRef, edIdx]);

  const primary = !choice.clip
    ? null
    : clip.phase === 'playing'
      ? t('s.scripture.primary-pause')
      : clip.phase === 'paused'
        ? t('s.scripture.primary-resume')
        : clip.phase === 'finished'
          ? t('s.scripture.primary-again')
          : t('s.scripture.primary-play');

  const title = scripture.status === 'ready' ? scripture.data.passage : t('s.common.loading');
  const toGuide = () =>
    nav(`/guide?pack=${encodeURIComponent(packId)}${unit ? `&unit=${unit}` : ''}`);
  const toView = (v: CardView) => {
    if (v === 'text') return;
    if (v === 'guide') return toGuide();
    nav(`/resources?pack=${encodeURIComponent(packId)}${unit ? `&unit=${unit}` : ''}`);
  };
  const glyph: GuideGlyph = clip.phase === 'playing' ? 'pause' : 'play';
  const thumb =
    primary && choice.clip ? (
      <GuideTransport
        part={scale > 1 ? 'primary' : 'all'}
        time={
          clip.duration
            ? t('s.guide.clip-length', {
                elapsed: formatClock(clip.elapsed),
                total: formatClock(clip.duration),
              })
            : null
        }
        primary={
          <GuidePrimary
            glyph={glyph}
            label={primary}
            row={scale > 1}
            arc={clip.duration ? { value: clip.elapsed / clip.duration } : undefined}
            state={clip.phase === 'playing' ? 'playing' : 'default'}
            onPress={clip.toggle}
          />
        }
      />
    ) : undefined;
  const voiceWords = !choice.clip
    ? !online
      ? t('s.scripture.no-audio-offline', { name: ed?.short ?? '' })
      : choice.silent === 'source-only-silent'
        ? t('s.scripture.primary-source-only')
        : t('s.common.mark.absent', { language: languageName(lang) })
    : choice.mark === 'source'
      ? t('s.common.mark.source')
      : t('s.common.mark.ai-voice');
  // Above 1× the views are a vertical list, first in this view (mock README § Large text).
  const views = (
    <CardViews active="text" count={unitItems.length || undefined} scale={scale} onView={toView} />
  );

  return (
    <ScreenFrame
      frame="guide"
      id="S08"
      title={title}
      titleHidden
      offline={!online}
      primaryLabel={null}
      thumb={thumb}
    >
      <div className="fia-guide fia-guide--text" data-edition={ed?.short}>
        {guide && guideUnit && <ProgressBand guide={guide} unitId={guideUnit} scale={scale} />}
        <GuideCard views={views}>
          {scripture.status === 'loading' && <p className="fia-caption">{t('s.common.loading')}</p>}
          {scripture.status === 'error' && (
            <div role="alert">
              <p>{t('s.scripture.error')}</p>
              <SecondaryAction label={t('s.common.try-again')} onPress={scripture.retry} />
            </div>
          )}
          {ed && (
            <>
              <div className="fia-guide-card__voice">
                <ProvenanceChip
                  provenance={choice.clip ? choice.mark : 'absent'}
                  words={voiceWords}
                  ariaLabel={t('s.guide.a11y.voice-chip', { mark: voiceWords })}
                  iconSize={iconSize(14, scale)}
                  onInfo={openSheet}
                />
              </div>
              <div className="fia-reader-tools">
                <GlassSelect
                  className="fia-reader-edition"
                  aria-label={t('s.scripture.edition-hint')}
                  value={ed.short}
                  options={editions.map((e) => e.short)}
                  onChange={(v) => switchEdition(editions.findIndex((e) => e.short === v))}
                />
                {aligned && pos.verse >= 0 && (
                  <GlassButton
                    variant="quiet"
                    size="md"
                    className="fia-btn fia-quiet"
                    data-role="replay-verse"
                    leading={<Icon name="update" size={iconSize(18, scale)} />}
                    onClick={() => clip.playFrom(seekToVerse(aligned, pos.verse) ?? 0)}
                  >
                    {t('s.scripture.replay-verse')}
                  </GlassButton>
                )}
              </div>
              <p className="fia-caption fia-reader-long">
                {t('s.scripture.edition-long', {
                  longName: ed.repo,
                  language: languageName(ed.language),
                })}
              </p>
              {ed.fallback && <AbsentBadge language={languageName(lang)} />}
              {ed.fallback && <p className="fia-caption">{t('s.scripture.english-fallback')}</p>}
              <div className="fia-card-body">
                <div className="fia-text fia-reader-text" dir="auto" lang={ed.language}>
                  {ed.verses.map((v, vi) => {
                    const ai = aligned?.verses.findIndex((x) => x.sourceId === v.sourceId) ?? -1;
                    const av = ai >= 0 ? aligned!.verses[ai] : null;
                    const verseActive = ai >= 0 && ai === pos.verse;
                    return (
                      <p
                        key={v.ref}
                        id={`v-${v.ref}`}
                        className="fia-text__verse"
                        data-active={verseActive && mode === 'verse' ? true : undefined}
                      >
                        <button
                          type="button"
                          className="fia-text__vnum"
                          aria-label={t('s.scripture.a11y.verse', { n: v.n })}
                          onClick={() => tapVerse(vi, v.ref)}
                        >
                          {v.n}
                        </button>
                        {av && mode === 'word' && av.text === v.text ? (
                          splitVerse(av).map((p, k) =>
                            p.word === null ? (
                              <span key={k}>{p.text}</span>
                            ) : (
                              <span
                                key={k}
                                className="fia-text__seg"
                                data-active={verseActive && pos.word === p.word ? true : undefined}
                                onClick={() => {
                                  const s = seekToWord(aligned!, ai, p.word!);
                                  if (s !== null) clip.playFrom(s);
                                }}
                              >
                                {p.text}
                              </span>
                            ),
                          )
                        ) : (
                          <span onClick={() => tapVerse(vi, v.ref)}>{v.text}</span>
                        )}{' '}
                      </p>
                    );
                  })}
                </div>
                {clip.phase === 'finished' && unit && (
                  <SecondaryAction label={t('s.scripture.back-to-guide')} onPress={toGuide} />
                )}
                {clip.error && <p role="alert">{t('s.scripture.error')}</p>}
                {notice && <ToastNotice kind="inline">{notice}</ToastNotice>}
              </div>
            </>
          )}
        </GuideCard>
      </div>
    </ScreenFrame>
  );
}
