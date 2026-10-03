import { useNavigate, useSearchParams } from 'react-router-dom';
import { LayerHead, MediaViewer } from '../components';
import { GlassButton, Icon } from '../components/glass';
import { ProvenanceChip } from '../components/ProvenanceMark';
import { iconSize, useTextScale } from '../flow/ui/guideKit';
import { t } from '../i18n';
import { languageName } from '../media/lang';
import { markWords } from '../media/marks';
import { markFor } from '../media/provenance';
import { findMedia, type ResourcesPack } from '../media/resources';
import { PROVENANCE_SHEET_PATH, type ProvenanceSheetState } from '../media/sheet';
import { DEFAULT_PACK, packLanguage, useOnline, usePackFile } from '../media/usePack';
import { ScreenFrame } from './ScreenFrame';

// S11 — Image / map viewer (spec 11, R-507): immediate pinch-zoom + double-tap, one large close
// that returns to the exact unit, never a new tab. Describe (R-509) is a secondary control; the
// description is an AI slot not yet generated in L1, so the pill says so (Bide, marked).
// F6-S11 glass (nodded mock design/alpha-v2-screens/11-image-viewer.html, Layer frame): the image
// first in the shared dark media well (always #0F131A, both themes), then the ▲ kind line and the
// title (LayerHead), the marks as ProvenanceChips (kit GlassChip → sheet 20: "About this image",
// the map's English badge, the description's mark), Describe as a kit GlassButton, and the one
// primary — the way back. Composed from the kit and the shared layer; no screen CSS (RULING ~20:05 ET).
export default function S11ImageMapViewer() {
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
  const titleMark = markFor(item?.titleProvenance, 'text');
  const descMark = markFor(item?.description, 'description');
  const close = () =>
    fromResources || !unit
      ? nav(`/resources?pack=${encodeURIComponent(packId)}${unit ? `&unit=${unit}` : ''}`)
      : nav(`/guide?pack=${encodeURIComponent(packId)}&unit=${unit}`);
  const sheet = (domain: 'text' | 'description') => {
    const state: ProvenanceSheetState = {
      domain,
      slot: domain === 'text' ? item?.titleProvenance : item?.description,
      englishShown: domain === 'text' && titleMark === 'absent',
      typeKey: item?.kind === 'map' ? 'maps' : 'images',
      language,
    };
    nav(PROVENANCE_SHEET_PATH, { state });
  };
  const chipIcon = iconSize(14, scale);
  return (
    <ScreenFrame
      id="S11"
      title={item?.title ?? t('s.common.loading')}
      titleHidden={!!item}
      primaryLabel={
        fromResources || !unit
          ? t('s.viewer.primary-close-resources')
          : t('s.viewer.primary-close-unit', { n: unit })
      }
      onPrimary={close}
    >
      {res.status === 'error' || (res.status === 'ready' && !item) ? (
        <MediaViewer kind="image" alt="" frameMessage={t('s.viewer.error')} />
      ) : item ? (
        <MediaViewer
          kind="image"
          src={item.url}
          alt={t('s.viewer.a11y.image', { caption: item.title })}
        />
      ) : (
        <p className="fia-caption" aria-busy="true">
          {t('s.common.loading')}
        </p>
      )}
      {item && (
        <>
          <LayerHead
            kind={item.kind === 'map' ? 'map' : 'image'}
            kindLine={t(item.kind === 'map' ? 's.guide.kind.map' : 's.guide.kind.image')}
            title={item.title}
            scale={scale}
          />
          <div className="fia-chips">
            <ProvenanceChip
              provenance={titleMark}
              words={
                titleMark === 'absent'
                  ? item.kind === 'map'
                    ? t('s.viewer.badge-map-english', { language })
                    : markWords('absent', language)
                  : t('s.viewer.info')
              }
              iconSize={chipIcon}
              onInfo={() => sheet('text')}
            />
            <ProvenanceChip
              provenance={descMark}
              words={markWords(descMark, language)}
              iconSize={chipIcon}
              onInfo={() => sheet('description')}
            />
            <GlassButton
              variant="glass"
              className="fia-pill"
              leading={<Icon name="headphones" size={iconSize(18, scale)} />}
              disabled={descMark === 'absent'}
              aria-label={t('s.viewer.a11y.describe', {
                mark: markWords(descMark, language),
              })}
            >
              {t('s.viewer.describe')}
            </GlassButton>
          </div>
          {!online && <p className="fia-caption">{t('s.viewer.higher-quality')}</p>}
        </>
      )}
    </ScreenFrame>
  );
}
