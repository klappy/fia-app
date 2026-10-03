import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SecondaryAction } from '../components';
import {
  CatalogRow,
  FilterChips,
  GlassButton,
  GlassSearch,
  GlassSurface,
  Icon,
} from '../components/glass';
import { CardViews, ProgressBand } from '../flow/ui/GuideChrome';
import { iconSize, keepRef, partItems, useTextScale, type CardView } from '../flow/ui/guideKit';
import { indexOf, unitAt } from '../flow/model';
import { useGuide } from '../flow/ui/useGuide';
import { t } from '../i18n';
import { languageName } from '../media/lang';
import {
  buildCards,
  chipCounts,
  filterCards,
  type Chip,
  type ResourceCard,
  type ResourcesPack,
} from '../media/resources';
import { PROVENANCE_SHEET_PATH, type ProvenanceSheetState } from '../media/sheet';
import { DEFAULT_PACK, packLanguage, useOnline, usePackFile } from '../media/usePack';
import { ScreenFrame } from './ScreenFrame';

// S09 Resources, v2 (spec 09 as wireframe; nodded mock cookbook design/alpha-v2-screens/09-resources.html;
// PRD § 4 S09 "the card's Resources view"). Composed of S05's shared parts: the glass frame, the progress
// band at the guide's own position, the guide card with Guide · Text · Resources (CardViews, Resources
// active). Inside the card, the v1 catalog on kit parts the PRD names for S09: forms/GlassSearch,
// forms/FilterChips (one type at a time, counts inside), resources/CatalogRow rows (type · mark overline,
// title, caption) with a quiet (i) beside each → sheet 20. No primary (rule 1; PRD § 4 S09).
const CHIPS: Chip[] = ['all', 'terms', 'images', 'maps', 'videos'];
const OPEN_PATH: Record<ResourceCard['type'], string> = {
  terms: '/term',
  images: '/viewer',
  maps: '/viewer',
  videos: '/video',
};
const typeWord = (type: ResourceCard['type']) => t(`s.resources.chip.${type}`, { n: '' }).trim();

export default function S09ResourcesCatalog() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const packId = params.get('pack') ?? DEFAULT_PACK;
  const unit = params.get('unit');
  const lang = packLanguage(packId);
  const online = useOnline();
  const scale = useTextScale();
  const { snap } = useGuide();
  const guide = snap.guide && snap.guide.packId === packId ? snap.guide : undefined;
  const guideUnit = guide ? snap.state?.unitId : undefined;
  const res = usePackFile<ResourcesPack>(packId, 'resources');
  const [chip, setChip] = useState<Chip>('all');
  const [query, setQuery] = useState('');
  const cards = useMemo(
    () => (res.status === 'ready' ? buildCards(res.data, { offline: !online }) : []),
    [res, online],
  );
  const counts = chipCounts(cards);
  const shown = filterCards(cards, chip, query);
  const ref = guide?.title ?? packId.split('.')[1] ?? '';
  const gu = guide && guideUnit ? unitAt(guide, indexOf(guide, guideUnit)) : undefined;
  const items = gu ? partItems(gu, res.status === 'ready' ? res.data : null) : [];
  const unitQ = unit ?? guideUnit;
  const qs = (id: string) =>
    `?pack=${encodeURIComponent(packId)}&id=${encodeURIComponent(id)}${unitQ ? `&unit=${unitQ}` : ''}&from=resources`;
  const toView = (v: CardView) => {
    if (v === 'resources') return;
    const q = `?pack=${encodeURIComponent(packId)}${unitQ ? `&unit=${unitQ}` : ''}`;
    nav(v === 'guide' ? `/guide${q}` : `/scripture${q}`);
  };
  const info = (c: ResourceCard) => {
    const state: ProvenanceSheetState = {
      domain: 'text',
      slot:
        c.mark === 'source'
          ? { status: 'source' }
          : c.mark === 'absent'
            ? { status: 'absent' }
            : { status: 'generated' },
      englishShown: c.mark === 'absent',
      typeKey: c.type,
      language: languageName(lang),
    };
    nav(PROVENANCE_SHEET_PATH, { state });
  };
  // Above 1× the views are a vertical list, first in this view (mock README § Large text).
  const views = (
    <CardViews active="resources" count={items.length || undefined} scale={scale} onView={toView} />
  );

  return (
    <ScreenFrame
      id="S09"
      title={t('s.resources.title', { ref: keepRef(ref) })}
      titleHidden
      offline={!online}
      primaryLabel={null}
    >
      <div className="fia-guide fia-guide--resources">
        {guide && guideUnit && <ProgressBand guide={guide} unitId={guideUnit} scale={scale} />}
        <GlassSurface level={2} blur="strong" radius="2xl" shadow="card" className="fia-guide-card">
          <div className="fia-guide-card__inner">
            {views}
            <div className="fia-card-body fia-res">
              <GlassSearch
                placeholder={t('s.resources.search-placeholder')}
                aria-label={t('s.common.search')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                height="auto"
                style={{ minHeight: 48 }}
              />
              <FilterChips
                className="fia-res__chips"
                aria-label={t('s.resources.chip.all')}
                value={[chip]}
                onChange={(next) => setChip((next.find((c) => c !== chip) as Chip) ?? 'all')}
                options={CHIPS.filter((c) => c === 'all' || counts[c] > 0).map((c) => ({
                  value: c,
                  label:
                    c === 'all'
                      ? t('s.resources.chip.all')
                      : t(`s.resources.chip.${c}`, { n: counts[c] }),
                }))}
              />
              {res.status === 'loading' && <p className="fia-caption">{t('s.common.loading')}</p>}
              {res.status === 'error' && (
                <div role="alert">
                  <p>{t('s.resources.error')}</p>
                  <SecondaryAction label={t('s.common.try-again')} onPress={res.retry} />
                </div>
              )}
              {res.status === 'ready' && shown.length === 0 && (
                <p className="fia-caption">{t('s.resources.empty-search')}</p>
              )}
              <ul className="fia-res__list">
                {shown.map((c, i) => {
                  const mark = t(`s.common.mark.${c.mark}`, { language: languageName(lang) });
                  return (
                    <li key={`${c.type}-${c.id}`} className="fia-res__row" data-type={c.type}>
                      <CatalogRow
                        className="fia-catalog"
                        first={i === 0}
                        subject={`${typeWord(c.type)} · ${mark}`}
                        title={c.title}
                        meta={c.captionKey ? t(c.captionKey) : undefined}
                        aria-disabled={!c.openable || undefined}
                        aria-label={t('s.resources.a11y.card', {
                          type: typeWord(c.type),
                          title: c.title,
                          mark,
                        })}
                        onOpen={
                          c.openable ? () => nav(`${OPEN_PATH[c.type]}${qs(c.id)}`) : undefined
                        }
                      />
                      <GlassButton
                        variant="quiet"
                        size="md"
                        className="fia-btn fia-quiet"
                        aria-label={t('s.resources.a11y.info', { title: c.title })}
                        onClick={() => info(c)}
                      >
                        <Icon name="info" size={iconSize(18, scale)} />
                      </GlassButton>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </GlassSurface>
      </div>
    </ScreenFrame>
  );
}
