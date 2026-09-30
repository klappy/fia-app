import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AbsentBadge, AudioControls, SecondaryAction, ToastNotice } from '../components';
import { t } from '../i18n';
import { languageName } from '../media/lang';
import {
  positionAt,
  seekToVerse,
  seekToWord,
  splitVerse,
  timingMode,
  usableAlignment,
  type AlignmentSidecar,
} from '../media/alignment';
import { clipsFor, scriptureClipId, type NarrationManifest } from '../media/narration';
import { selectNarration } from '../media/provenance';
import {
  readerEditions,
  sameVerseIndex,
  splitEditions,
  type ScripturePack,
} from '../media/scripture';
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

// S08 — Scripture reader (spec 08): edition segments, verse text with word/verse band from a
// C-12 sidecar bound to the playing clip, tap-to-seek, transport with provenance (R-503..R-505).
let untimedNoticeShown = false; // SB-6: once per session

export default function S08ScriptureReader() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const packId = params.get('pack') ?? DEFAULT_PACK;
  const unit = params.get('unit');
  const lang = packLanguage(packId);
  const online = useOnline();
  const scripture = usePackFile<ScripturePack>(packId, 'scripture');
  const narration = usePackFile<NarrationManifest>(packId, 'narration');
  const editions = useMemo(
    () => (scripture.status === 'ready' ? readerEditions(scripture.data) : []),
    [scripture],
  );
  const [edIdx, setEdIdx] = useState(0);
  const [showMore, setShowMore] = useState(false);
  const [anchorRef, setAnchorRef] = useState<string | null>(null);
  const ed = editions[edIdx];
  const packEd =
    scripture.status === 'ready'
      ? scripture.data.editions.find((e) => e.short === ed?.short)
      : undefined;
  const textSha = (packEd as { textSha256?: string } | undefined)?.textSha256;

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

  const switchEdition = (i: number) => {
    const ref = anchorRef ?? ed?.verses[Math.max(0, pos.verse)]?.ref ?? null;
    setEdIdx(i);
    setShowMore(false);
    const to = editions[i];
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
  const { inline, more } = splitEditions(editions);

  return (
    <ScreenFrame
      id="S08"
      title={title}
      dockActive="scripture"
      offline={!online}
      primaryLabel={primary}
      primaryState={clip.phase === 'playing' ? 'playing' : 'default'}
      onPrimary={clip.toggle}
    >
      {unit && (
        <SecondaryAction
          label={`⟵ ${t('s.scripture.crumb', { n: unit })}`}
          onPress={() => nav(`/guide?pack=${encodeURIComponent(packId)}&unit=${unit}`)}
        />
      )}
      {scripture.status === 'loading' && <p className="fia-caption">{t('s.common.loading')}</p>}
      {scripture.status === 'error' && (
        <div role="alert">
          <p>{t('s.scripture.error')}</p>
          <SecondaryAction label={t('s.common.try-again')} onPress={scripture.retry} />
        </div>
      )}
      {ed && (
        <>
          <div className="fia-segments" role="tablist" aria-label={t('s.scripture.edition-hint')}>
            {inline.map((e, i) => (
              <button
                key={e.short}
                type="button"
                role="tab"
                aria-selected={i === edIdx}
                aria-label={t('s.scripture.a11y.edition', {
                  name: e.short,
                  language: languageName(e.language),
                })}
                onClick={() => switchEdition(i)}
              >
                {e.short}
              </button>
            ))}
            {more.length > 0 && (
              <button type="button" onClick={() => setShowMore((s) => !s)} aria-expanded={showMore}>
                ▾ {t('s.scripture.more-editions')}
              </button>
            )}
          </div>
          {showMore && (
            <ul className="fia-list">
              {more.map((e, j) => (
                <li key={e.short}>
                  <button type="button" onClick={() => switchEdition(inline.length + j)}>
                    {e.short} {inline.length + j === edIdx ? '✓' : ''}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="fia-caption">
            {t('s.scripture.edition-long', {
              longName: ed.repo,
              language: languageName(ed.language),
            })}
          </p>
          {ed.fallback && <AbsentBadge language={languageName(lang)} />}
          {ed.fallback && <p className="fia-caption">{t('s.scripture.english-fallback')}</p>}
          <div className="fia-text fia-text--scripture" dir="auto" lang={ed.language}>
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
                  </button>{' '}
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
                  )}
                </p>
              );
            })}
          </div>
          {clip.phase === 'finished' && unit && (
            <SecondaryAction
              label={t('s.scripture.back-to-guide')}
              onPress={() => nav(`/guide?pack=${encodeURIComponent(packId)}&unit=${unit}`)}
            />
          )}
          {choice.clip ? (
            <AudioControls
              provenance={choice.mark}
              language={languageName(ed.fallback ? 'eng' : lang)}
              elapsedSec={clip.elapsed}
              totalSec={clip.duration}
              onSeek={clip.seek}
              onMarkInfo={openSheet}
              state={clip.playing ? 'playing' : clip.error ? 'error' : 'default'}
              hint={mode === 'word' ? t('s.scripture.hint-timed') : undefined}
              leading={
                aligned && pos.verse >= 0
                  ? {
                      label: t('s.scripture.replay-verse'),
                      onPress: () => clip.playFrom(seekToVerse(aligned, pos.verse) ?? 0),
                    }
                  : undefined
              }
            />
          ) : (
            // Bide: L1 ships narration.json empty (AI Scripture narration is generated later,
            // marked); until a clip exists the audio is honestly absent — no disabled primary.
            <button type="button" className="fia-mark fia-mark--absent" onClick={openSheet}>
              ◌{' '}
              {!online
                ? t('s.scripture.no-audio-offline', { name: ed.short })
                : choice.silent === 'source-only-silent'
                  ? t('s.scripture.primary-source-only')
                  : t('s.common.mark.absent', { language: languageName(lang) })}
            </button>
          )}
          {clip.error && <p role="alert">{t('s.scripture.error')}</p>}
          {notice && <ToastNotice kind="inline">{notice}</ToastNotice>}
        </>
      )}
    </ScreenFrame>
  );
}
