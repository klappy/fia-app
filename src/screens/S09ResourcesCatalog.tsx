import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SecondaryAction } from '../components';
import { KitPrimary } from '../components/PrimaryButton';
import { CatalogRow, FilterChips, GlassButton, GlassSearch, Icon } from '../components/glass';
import { bandModel } from '../flow/ui/band';
import { CardViews, ProgressBand } from '../flow/ui/GuideChrome';
import {
  iconSize,
  keepRef,
  partItems,
  useTextScale,
  type CardView,
  type PartItem,
} from '../flow/ui/guideKit';
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
import { GuideCard } from '../frame/GuideCard';

// S09 Resources, v2 (spec 09 as wireframe; nodded mock cookbook design/alpha-v2-screens/09-resources.html;
// PRD § 4 S09 "the card's Resources view; S09b all resources is a layer"). Composed of S05's shared parts:
// the glass frame, the progress band at the guide's own position, the guide card with Guide · Text ·
// Resources (CardViews, Resources active). Inside the card (mock _frame.js:293-303 ResourcesView): the
// part's own resources under "In this part" as resources/CatalogRow rows (type · mark overline, title,
// caption) with a quiet (i) beside each → sheet 20, then one row "All resources for this passage" that
// opens S09b. No primary (rule 1; PRD § 4 S09).
// S09b (?all=1; mock 09b): the whole-passage catalog as a layer — forms/GlassSearch, forms/FilterChips
// (one type at a time, counts inside) and the same rows; its one exit is the primary back to the part.
const CHIPS: Chip[] = ['all', 'terms', 'images', 'maps', 'videos'];
const OPEN_PATH: Record<ResourceCard['type'], string> = {
  terms: '/term',
  images: '/viewer',
  maps: '/viewer',
  videos: '/video',
};
const typeWord = (type: ResourceCard['type']) => t(`s.resources.chip.${type}`, { n: '' }).trim();
const CARD_TYPE: Record<PartItem['kind'], ResourceCard['type']> = {
  term: 'terms',
  image: 'images',
  map: 'maps',
};

export default function S09ResourcesCatalog() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const packId = params.get('pack') ?? DEFAULT_PACK;
  const unit = params.get('unit');
  const all = params.get('all') === '1';
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
  // The part's own rows: the catalog card for each part item (same id, same type), in the part's order.
  const mine = items.flatMap((it) => {
    const c = cards.find((x) => x.id === it.id && x.type === CARD_TYPE[it.kind]);
    return c ? [{ c, title: it.label ?? c.title }] : [];
  });
  const partN = guide && guideUnit ? bandModel(guide, guideUnit).n : undefined;
  const unitQ = unit ?? guideUnit;
  const here = `?pack=${encodeURIComponent(packId)}${unitQ ? `&unit=${unitQ}` : ''}`;
  const qs = (id: string) =>
    `?pack=${encodeURIComponent(packId)}&id=${encodeURIComponent(id)}${unitQ ? `&unit=${unitQ}` : ''}&from=resources`;
  const toView = (v: CardView) => {
    if (v === 'resources') return;
    nav(v === 'guide' ? `/guide${here}` : `/scripture${here}`);
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
  const row = (c: ResourceCard, i: number, title = c.title) => {
    const mark = t(`s.common.mark.${c.mark}`, { language: languageName(lang) });
    return (
      <li key={`${c.type}-${c.id}`} className="fia-res__row" data-type={c.type}>
        <CatalogRow
          className="fia-catalog"
          first={i === 0}
          subject={`${typeWord(c.type)} · ${mark}`}
          title={title}
          meta={c.captionKey ? t(c.captionKey) : undefined}
          aria-disabled={!c.openable || undefined}
          aria-label={t('s.resources.a11y.card', { type: typeWord(c.type), title, mark })}
          onOpen={c.openable ? () => nav(`${OPEN_PATH[c.type]}${qs(c.id)}`) : undefined}
        />
        <GlassButton
          variant="quiet"
          size="md"
          className="fia-btn fia-quiet"
          aria-label={t('s.resources.a11y.info', { title })}
          onClick={() => info(c)}
        >
          <Icon name="info" size={iconSize(18, scale)} />
        </GlassButton>
      </li>
    );
  };
  const status = (
    <>
      {res.status === 'loading' && <p className="fia-caption">{t('s.common.loading')}</p>}
      {res.status === 'error' && (
        <div role="alert">
          <p>{t('s.resources.error')}</p>
          <SecondaryAction label={t('s.common.try-again')} onPress={res.retry} />
        </div>
      )}
    </>
  );
  const title = t('s.resources.title', { ref: keepRef(ref) });

  if (all)
    return (
      <ScreenFrame
        frame="guide"
        id="S09"
        title={title}
        offline={!online}
        primaryLabel={null}
        thumb={
          partN ? (
            <KitPrimary
              icon="chevronLeft"
              label={t('s.overview.v2.back', { n: partN })}
              onPress={() => nav(`/resources${here}`)}
            />
          ) : undefined
        }
      >
        <div className="fia-guide fia-guide--resources" data-layer="all">
          <GuideCard
            bodyClassName="fia-res"
            body={
              <>
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
                {status}
                {res.status === 'ready' && shown.length === 0 && (
                  <p className="fia-caption">{t('s.resources.empty-search')}</p>
                )}
                <ul className="fia-res__list">{shown.map((c, i) => row(c, i))}</ul>
              </>
            }
          />
        </div>
      </ScreenFrame>
    );

  // Above 1× the views are a vertical list, first in this view (mock README § Large text).
  const views = (
    <CardViews active="resources" count={mine.length || undefined} scale={scale} onView={toView} />
  );

  return (
    <ScreenFrame
      frame="guide"
      id="S09"
      title={title}
      titleHidden
      offline={!online}
      primaryLabel={null}
    >
      <div className="fia-guide fia-guide--resources">
        {guide && guideUnit && <ProgressBand guide={guide} unitId={guideUnit} scale={scale} />}
        <GuideCard
          views={views}
          bodyClassName="fia-res"
          body={
            <>
              <p className="fia-overline">{t('s.guide.in-this-part')}</p>
              {status}
              {res.status === 'ready' && mine.length === 0 && (
                <p className="fia-caption">{t('s.resources.empty-unit')}</p>
              )}
              <ul className="fia-res__list" data-group="part">
                {mine.map(({ c, title: tt }, i) => row(c, i, tt))}
              </ul>
              <CatalogRow
                className="fia-catalog fia-res__all"
                first
                title={
                  <span className="fia-row-label">
                    <Icon name="globe" size={iconSize(18, scale)} />
                    {t('s.common.explore.resources')}
                  </span>
                }
                meta={<Icon name="chevronRight" size={iconSize(16, scale)} />}
                onOpen={() => nav(`/resources${here}&all=1`)}
              />
            </>
          }
        />
      </div>
    </ScreenFrame>
  );
}
