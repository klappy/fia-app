import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookName, matches, pericopesFor } from '../flow/catalog';
import { flowSession, useFlow } from '../flow/session';
import { t } from '../i18n';
import { useOffline } from '../offline/useOffline';
import { savedPackIds, useOnline } from '../offline/useOnline';
import { ScreenFrame } from './ScreenFrame';

// S03 Pericope list (03-pericope-list.md): the book's pericopes from the C-03 catalog in
// canonical order; row tap → 04. Select-and-save mode belongs to the offline lane.
export default function S03PericopeList() {
  const nav = useNavigate();
  const session = flowSession();
  const snap = useFlow(session);
  const [q, setQ] = useState('');
  const online = useOnline();
  const { packs } = useOffline();
  const saved = useMemo(() => savedPackIds(packs), [packs]);
  useEffect(() => void session.loadCatalog(), [session]);
  const language = snap.language ?? 'eng';
  const rows = useMemo(
    () => (snap.manifest && snap.book ? pericopesFor(snap.manifest, language, snap.book) : []),
    [snap.manifest, language, snap.book],
  );
  const book = rows[0] ? bookName(rows[0].title) : (snap.book ?? '');
  const shown = rows.filter((r) => matches(q, r.title, r.pericope));
  return (
    <ScreenFrame id="S03" title={book} dockActive="guide" primaryLabel={null}>
      <input
        type="search"
        className="fia-search"
        placeholder={t('s.pericopes.search-placeholder', { book })}
        aria-label={t('s.pericopes.search-placeholder', { book })}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {!online && <p className="fia-caption">{t('s.pericopes.offline-hint')}</p>}
      {snap.catalogStatus === 'error' && (
        <div role="alert">
          <p>{t('s.pericopes.error', { book })}</p>
          <button
            type="button"
            className="fia-secondary"
            onClick={() => void session.loadCatalog(true)}
          >
            {t('s.common.try-again')}
          </button>
        </div>
      )}
      {snap.catalogStatus === 'loading' && <p aria-busy="true" data-state="loading" />}
      {snap.catalogStatus === 'ready' && shown.length === 0 && (
        <p>{t('s.pericopes.empty-search', { book })}</p>
      )}
      <ul className="fia-list">
        {shown.map((r) => (
          <li key={r.packId}>
            <button
              type="button"
              className="fia-row"
              data-pack-id={r.packId}
              onClick={() => {
                session.selectPack(r.packId);
                nav('/passage');
              }}
            >
              {r.title}
              {!online && !saved.has(r.packId) && (
                // pericope-card.md offline: unsaved rows stay tappable; the fact is a badge.
                <>
                  {' '}
                  <span className="fia-badge--needs-connection" data-role="needs-connection">
                    {t('s.common.not-saved-badge')}
                  </span>
                </>
              )}
            </button>
          </li>
        ))}
      </ul>
    </ScreenFrame>
  );
}
