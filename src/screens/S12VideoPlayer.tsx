import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MediaViewer, ProvenanceMark, SecondaryAction } from '../components';
import { t } from '../i18n';
import { languageName } from '../media/lang';
import { markFor } from '../media/provenance';
import {
  findMedia,
  videoPrimaryAction,
  videoState,
  type ResourcesPack,
  type VideoUiState,
} from '../media/resources';
import { PROVENANCE_SHEET_PATH, type ProvenanceSheetState } from '../media/sheet';
import { DEFAULT_PACK, packLanguage, useOnline, usePackFile } from '../media/usePack';
import { ScreenFrame } from './ScreenFrame';

// S12 — Video player (spec 12, R-506): in-app, streamed (never packaged), never autoplays;
// offline shows "Needs connection" honestly; close returns to the same unit.
export default function S12VideoPlayer() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const packId = params.get('pack') ?? DEFAULT_PACK;
  const id = params.get('id') ?? '';
  const unit = params.get('unit');
  const fromResources = params.get('from') === 'resources';
  const lang = packLanguage(packId);
  const online = useOnline();
  const res = usePackFile<ResourcesPack>(packId, 'resources');
  const item = res.status === 'ready' ? findMedia(res.data, id) : undefined;
  const [vs, setVs] = useState<VideoUiState>('idle');
  const playable = item ? videoState(item, online) === 'playable' : false;
  const close = () =>
    fromResources || !unit
      ? nav(`/resources?pack=${encodeURIComponent(packId)}${unit ? `&unit=${unit}` : ''}`)
      : nav(`/guide?pack=${encodeURIComponent(packId)}&unit=${unit}`);
  const closeLabel =
    fromResources || !unit
      ? t('s.video.close-back-resources')
      : t('s.video.close-back', { n: unit });
  const titleMark = markFor(item?.titleProvenance, 'text');
  const video = () => document.querySelector<HTMLVideoElement>('.fia-viewer--video video');
  const primary =
    !playable || vs === 'ended'
      ? closeLabel
      : vs === 'error'
        ? t('s.video.primary-try-again')
        : vs === 'playing'
          ? t('s.video.primary-pause')
          : t('s.video.primary-play');
  const onPrimary = () => {
    const act = videoPrimaryAction(playable, vs);
    if (act === 'close') return close();
    // On error the frame message replaces <video>: going idle mounts it again (fresh load).
    if (act === 'retry') return setVs('idle');
    const v = video();
    if (!v) return;
    if (v.paused) void v.play().catch(() => setVs('error'));
    else v.pause();
  };
  const sheet = () => {
    const state: ProvenanceSheetState = {
      domain: 'text',
      slot: item?.titleProvenance,
      englishShown: titleMark === 'absent',
      typeKey: 'videos',
      language: languageName(lang),
    };
    nav(PROVENANCE_SHEET_PATH, { state });
  };
  return (
    <ScreenFrame
      id="S12"
      title={item?.title ?? t('s.common.loading')}
      primaryLabel={primary}
      primaryState={vs === 'playing' ? 'playing' : 'default'}
      onPrimary={onPrimary}
    >
      {vs !== 'ended' && playable && <SecondaryAction label={closeLabel} onPress={close} />}
      {res.status === 'ready' && !item && (
        <MediaViewer kind="video" alt="" frameMessage={t('s.resources.error')} />
      )}
      {res.status === 'error' && (
        <div role="alert">
          <p>{t('s.resources.error')}</p>
          <SecondaryAction label={t('s.common.try-again')} onPress={res.retry} />
        </div>
      )}
      {item && (
        <>
          <p className="fia-caption">{t('s.video.source-line')}</p>
          <ProvenanceMark provenance={titleMark} language={languageName(lang)} onInfo={sheet} />
          {titleMark === 'absent' && (
            <p className="fia-mark fia-mark--absent">
              ◌ {t('s.video.mark-english', { language: languageName(lang) })}
            </p>
          )}
          <MediaViewer
            kind="video"
            src={playable ? item.url : undefined}
            alt={t('s.video.a11y.video', { title: item.title, language: languageName(lang) })}
            frameMessage={
              !playable
                ? `⊘ ${t('s.video.needs-connection')}`
                : vs === 'error'
                  ? t('s.video.error')
                  : undefined
            }
            onVideoState={(s) => setVs(s)}
          />
        </>
      )}
    </ScreenFrame>
  );
}
