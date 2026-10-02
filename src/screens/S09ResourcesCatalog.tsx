import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ProvenanceMark, SecondaryAction } from '../components';
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

// S09 — Resources catalog (spec 09, R-508): chips with counts, search, one open + one info per card.
const CHIPS: Chip[] = ['all', 'terms', 'images', 'maps', 'videos'];
const OPEN_PATH: Record<ResourceCard['type'], string> = {
  terms: '/term',
  images: '/viewer',
  maps: '/viewer',
  videos: '/video',
};

export default function S09ResourcesCatalog() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const packId = params.get('pack') ?? DEFAULT_PACK;
  const unit = params.get('unit');
  const lang = packLanguage(packId);
  const online = useOnline();
  const res = usePackFile<ResourcesPack>(packId, 'resources');
  const [chip, setChip] = useState<Chip>('all');
  const [query, setQuery] = useState('');
  const cards = useMemo(
    () => (res.status === 'ready' ? buildCards(res.data, { offline: !online }) : []),
    [res, online],
  );
  const counts = chipCounts(cards);
  const shown = filterCards(cards, chip, query);
  const ref = packId.split('.')[1] ?? '';
  const qs = (id: string) =>
    `?pack=${encodeURIComponent(packId)}&id=${encodeURIComponent(id)}${unit ? `&unit=${unit}` : ''}&from=resources`;
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
  return (
    <ScreenFrame id="S09" title={t('s.resources.title', { ref })} offline={!online}>
      {unit && (
        <SecondaryAction
          label={`⟵ ${t('s.resources.back-to-unit', { n: unit })}`}
          onPress={() => nav(`/guide?pack=${encodeURIComponent(packId)}&unit=${unit}`)}
        />
      )}
      <input
        type="search"
        className="fia-search"
        placeholder={t('s.resources.search-placeholder')}
        aria-label={t('s.common.search')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="fia-chips" role="tablist">
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={chip === c}
            onClick={() => setChip(c)}
          >
            {c === 'all' ? t('s.resources.chip.all') : t(`s.resources.chip.${c}`, { n: counts[c] })}
          </button>
        ))}
      </div>
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
      <ul className="fia-list">
        {shown.map((c) => (
          <li key={`${c.type}-${c.id}`} className="fia-card fia-card--resource">
            <button
              type="button"
              className="fia-card__open"
              disabled={!c.openable}
              aria-label={t('s.resources.a11y.card', {
                type: t(`s.resources.chip.${c.type}`, { n: '' }).trim(),
                title: c.title,
                mark: t(`s.common.mark.${c.mark}`, { language: languageName(lang) }),
              })}
              onClick={() => nav(`${OPEN_PATH[c.type]}${qs(c.id)}`)}
            >
              <span className="fia-card__title">{c.title}</span>
            </button>
            <ProvenanceMark provenance={c.mark} language={languageName(lang)} />
            {c.captionKey && <span className="fia-caption">{t(c.captionKey)}</span>}
            <button
              type="button"
              className="fia-card__info"
              aria-label={t('s.resources.a11y.info', { title: c.title })}
              onClick={() => info(c)}
            >
              ⓘ
            </button>
          </li>
        ))}
      </ul>
    </ScreenFrame>
  );
}
