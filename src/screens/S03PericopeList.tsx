import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookName, matches, pericopesFor } from '../flow/catalog';
import { isNotYet, readyFirst, useReadyPacks } from '../flow/ready';
import { flowSession, useFlow } from '../flow/session';
import { t } from '../i18n';
import { languageName } from '../media/lang';
import { browserStore, DATA_PATHS, fetchJson } from '../settings';
import {
  measuredMap,
  preferredTier,
  rowSize,
  saveRowState,
  useOffline,
  useOnline,
} from '../offline';
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
  const online = useOnline();
  useEffect(() => void session.loadCatalog(), [session]);
  const language = snap.language ?? 'eng';
  const rows = useMemo(
    () => (snap.manifest && snap.book ? pericopesFor(snap.manifest, language, snap.book) : []),
    [snap.manifest, language, snap.book],
  );
  const book = rows[0] ? bookName(rows[0].title) : (snap.book ?? '');
  // GAP-NOPACK: passages that open come first; the rest read "not yet in {language}" (ready.ts).
  const ready = useReadyPacks();
  const shown = readyFirst(
    rows.filter((r) => matches(q, r.title, r.pericope)),
    (r) => !isNotYet(ready, r.packId),
  );
  const off = useOffline();
  const [tier] = useState(() => preferredTier(browserStore()));
  // Which entries carry measured (pack-manifest) sizes; anything unmarked reads as an estimate.
  const [measured, setMeasured] = useState<{ lang?: string; map: Record<string, boolean> }>({
    map: {},
  });
  useEffect(() => {
    let live = true;
    fetchJson(DATA_PATHS.languageCounts(language))
      .then((doc) => live && setMeasured({ lang: language, map: measuredMap(doc) }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [language]);
  const measuredFor = (id: string) => (measured.lang === language ? measured.map[id] : undefined);
  return (
    <ScreenFrame id="S03" title={book} primaryLabel={null}>
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
        {shown.map((r) => {
          const st = saveRowState(r.packId, off.packs, off.saving);
          const notYet = isNotYet(ready, r.packId);
          // Saved rows show what was verified; others the catalog size at the best listed tier,
          // prefixed ≈ unless the catalog marks it measured (never an estimate shown as exact).
          const sz = rowSize(
            r.tierBytes,
            tier,
            measuredFor(r.packId),
            st.state === 'saved' ? st.pack : undefined,
          );
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
                  {notYet && (
                    <span className="fia-mark fia-mark--absent" data-role="not-yet">
                      ◌ {t('s.common.mark.absent', { language: languageName(language) })}
                    </span>
                  )}
                  {!online && st.state !== 'saved' && !notYet && (
                    // pericope-card.md offline: unsaved rows stay tappable; the fact is a badge.
                    <span className="fia-badge--needs-connection" data-role="needs-connection">
                      {t('s.common.not-saved-badge')}
                    </span>
                  )}
                </span>
                {sz && !notYet && (
                  <span className="fia-caption" data-testid="row-size">
                    {t('s.pericopes.size', {
                      tier: t(`s.passage.tier.${sz.tier}`),
                      mb: sz.exact ? sz.mb : `≈ ${sz.mb}`,
                    })}
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
