import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookName, matches, pericopesFor } from '../flow/catalog';
import { flowSession, useFlow } from '../flow/session';
import { t } from '../i18n';
import { browserStore } from '../settings';
import { mb, preferredTier, saveRowState, tierMb, useOffline } from '../offline';
import '../offline/offline.css';
import { ScreenFrame } from './ScreenFrame';

// S03 Pericope list (03-pericope-list.md): the book's pericopes from the C-03 catalog in
// canonical order; row tap → 04. Each row carries its size at the Settings tier (R-307, default
// Phone) and its verified saved / partial mark (R-309). Select-and-save mode is a later slice (R-308).
export default function S03PericopeList() {
  const nav = useNavigate();
  const session = flowSession();
  const snap = useFlow(session);
  const [q, setQ] = useState('');
  useEffect(() => void session.loadCatalog(), [session]);
  const language = snap.language ?? 'eng';
  const rows = useMemo(
    () => (snap.manifest && snap.book ? pericopesFor(snap.manifest, language, snap.book) : []),
    [snap.manifest, language, snap.book],
  );
  const book = rows[0] ? bookName(rows[0].title) : (snap.book ?? '');
  const shown = rows.filter((r) => matches(q, r.title, r.pericope));
  const off = useOffline();
  const [tier] = useState(() => preferredTier(browserStore()));
  const tierName = t(`s.passage.tier.${tier}`);
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
        {shown.map((r) => {
          const st = saveRowState(r.packId, off.packs, off.saving);
          // Saved rows show what was verified (tier + bytes); others the catalog projection.
          const savedPack = st.state === 'saved' ? st.pack : undefined;
          const size = savedPack ? mb(savedPack.bytes) : tierMb(r.tierBytes, tier);
          const sizeTier = savedPack ? t(`s.passage.tier.${savedPack.tier ?? 'text'}`) : tierName;
          return (
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
                <span className="fia-row__line">
                  <span>{r.title}</span>
                  {st.state === 'saved' && (
                    <span className="fia-mark fia-mark--source" data-testid="row-saved">
                      ✓ {t('s.pericopes.saved')}
                    </span>
                  )}
                  {st.state === 'partial' && st.pack && (
                    <span className="fia-mark">
                      ◐{' '}
                      {t('s.common.mark.partial', {
                        saved: st.pack.savedFiles ?? 0,
                        total: st.pack.files ?? 0,
                      })}
                    </span>
                  )}
                </span>
                {size && (
                  <span className="fia-caption" data-testid="row-size">
                    {t('s.pericopes.size', { tier: sizeTier, mb: size })}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </ScreenFrame>
  );
}
