import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LayerHead, MediaViewer } from '../components';
import { GlassButton, GlassSurface, Icon } from '../components/glass';
import { ProvenanceChip } from '../components/ProvenanceMark';
import { iconSize, useTextScale } from '../flow/ui/guideKit';
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
// F6-S12 glass (nodded mock design/alpha-v2-screens/12-video.html, Layer frame): the way back in
// the glass header (ScreenFrame `close`) while the primary plays; the video in the shared dark
// media well (always #0F131A); the kind line "Video Bible Dictionary · streams" led by the video
// bead and the title (LayerHead); the source mark as a ProvenanceChip (kit GlassChip → sheet 20).
// Composed from the kit and the shared layer; no screen CSS (RULING ~20:05 ET).
export default function S12VideoPlayer() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const scale = useTextScale();
  const packId = params.get('pack') ?? DEFAULT_PACK;
  const id = params.get('id') ?? '';
  const unit = params.get('unit');
  const fromResources = params.get('from') === 'resources';
  const lang = packLanguage(packId);
  const language = languageName(lang);
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
      language,
    };
    nav(PROVENANCE_SHEET_PATH, { state });
  };
  // One labelled way back: in the header while the primary plays; when the primary is the way
  // back (offline, ended), the header carries none (v1: the close row shows only while playable).
  const headerClose =
    vs !== 'ended' && playable ? { label: closeLabel, onPress: close } : undefined;
  return (
    <ScreenFrame
      id="S12"
      title={item?.title ?? t('s.common.loading')}
      titleHidden={!!item}
      close={headerClose}
      primaryLabel={primary}
      primaryState={vs === 'playing' ? 'playing' : 'default'}
      onPrimary={onPrimary}
    >
      {res.status === 'ready' && !item && (
        <MediaViewer kind="video" alt="" frameMessage={t('s.resources.error')} />
      )}
      {res.status === 'error' && (
        <GlassSurface level={2} blur="medium" radius="lg" shadow="rest" className="fia-layer-card">
          <div role="alert">
            <p>{t('s.resources.error')}</p>
            <GlassButton
              variant="glass"
              leading={<Icon name="update" size={iconSize(18, scale)} />}
              onClick={res.retry}
            >
              {t('s.common.try-again')}
            </GlassButton>
          </div>
        </GlassSurface>
      )}
      {item && (
        <>
          <MediaViewer
            kind="video"
            src={playable ? item.url : undefined}
            alt={t('s.video.a11y.video', { title: item.title, language })}
            frameMessage={
              !playable
                ? `⊘ ${t('s.video.needs-connection')}`
                : vs === 'error'
                  ? t('s.video.error')
                  : undefined
            }
            onVideoState={(s) => setVs(s)}
          />
          <LayerHead
            kind="video"
            kindLine={t('s.video.source-line')}
            title={item.title}
            scale={scale}
          />
          <div className="fia-chips">
            <ProvenanceChip
              provenance={titleMark}
              words={
                titleMark === 'absent'
                  ? t('s.video.mark-english', { language })
                  : t('s.video.mark-source', { language })
              }
              iconSize={iconSize(14, scale)}
              onInfo={sheet}
            />
          </div>
        </>
      )}
    </ScreenFrame>
  );
}
