import { useNavigate, useSearchParams } from 'react-router-dom';
import { MediaViewer, ProvenanceMark } from '../components';
import { t } from '../i18n';
import { languageName } from '../media/lang';
import { markFor } from '../media/provenance';
import { findMedia, type ResourcesPack } from '../media/resources';
import { PROVENANCE_SHEET_PATH, type ProvenanceSheetState } from '../media/sheet';
import { DEFAULT_PACK, packLanguage, useOnline, usePackFile } from '../media/usePack';
import { ScreenFrame } from './ScreenFrame';

// S11 — Image / map viewer (spec 11, R-507): immediate pinch-zoom + double-tap, one large close
// that returns to the exact unit, never a new tab. Describe (R-509) is a secondary control; the
// description is an AI slot not yet generated in L1, so the pill says so (Bide, marked).
export default function S11ImageMapViewer() {
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
      language: languageName(lang),
    };
    nav(PROVENANCE_SHEET_PATH, { state });
  };
  return (
    <ScreenFrame
      id="S11"
      title={item?.title ?? t('s.common.loading')}
      primaryLabel={
        fromResources || !unit
          ? t('s.viewer.primary-close-resources')
          : t('s.viewer.primary-close-unit', { n: unit })
      }
      onPrimary={close}
    >
      {item && item.kind === 'map' && titleMark === 'absent' && (
        <p className="fia-mark fia-mark--absent">
          ◌ {t('s.viewer.badge-map-english', { language: languageName(lang) })}
        </p>
      )}
      {res.status === 'error' || (res.status === 'ready' && !item) ? (
        <MediaViewer kind="image" alt="" frameMessage={t('s.viewer.error')} />
      ) : item ? (
        <MediaViewer
          kind="image"
          src={item.url}
          alt={t('s.viewer.a11y.image', { caption: item.title })}
          caption={item.title}
          provenance={titleMark}
          onMarkInfo={() => sheet('text')}
        />
      ) : (
        <p className="fia-caption">{t('s.common.loading')}</p>
      )}
      {item && (
        <div className="fia-viewer__describe">
          <ProvenanceMark
            provenance={descMark}
            language={languageName(lang)}
            onInfo={() => sheet('description')}
          />
          <button
            type="button"
            className="fia-secondary"
            disabled={descMark === 'absent'}
            aria-label={t('s.viewer.a11y.describe', {
              mark: t(`s.common.mark.${descMark}`, { language: languageName(lang) }),
            })}
          >
            ▶ {t('s.viewer.describe')}
          </button>
          {!online && <span className="fia-caption">{t('s.viewer.higher-quality')}</span>}
        </div>
      )}
    </ScreenFrame>
  );
}
