import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components';
import { booksFor, entriesFor, matches } from '../flow/catalog';
import { flowSession, useFlow } from '../flow/session';
import { t } from '../i18n';
import { ScreenFrame } from './ScreenFrame';

// S02 Library (02-library.md): books of the content language from the C-03 catalog, a resume
// card when a session exists (R-410). Saving and offline states belong to the offline lane.
export default function S02Library() {
  const nav = useNavigate();
  const session = flowSession();
  const snap = useFlow(session);
  const [q, setQ] = useState('');
  useEffect(() => {
    void session.loadCatalog();
    if (snap.packId) void session.loadGuide();
  }, [session, snap.packId]);

  const language = snap.language ?? 'eng';
  const books = useMemo(
    () => (snap.manifest ? booksFor(snap.manifest, language) : []),
    [snap.manifest, language],
  );
  const shown = books.filter((b) => matches(q, b.name, b.book));
  const resumeEntry =
    snap.manifest && snap.packId && snap.state && snap.state.visited.length > 1
      ? entriesFor(snap.manifest, language).find((e) => e.packId === snap.packId)
      : undefined;

  return (
    <ScreenFrame
      id="S02"
      title={snap.manifest?.languages.find((l) => l.code === language)?.autonym}
      dockActive="guide"
      primaryLabel={
        resumeEntry ? t('s.library.primary-continue', { ref: resumeEntry.title }) : null
      }
      onPrimary={() => nav('/guide')}
    >
      <input
        type="search"
        className="fia-search"
        placeholder={t('s.library.search-placeholder')}
        aria-label={t('s.library.search-placeholder')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {resumeEntry && snap.guide && snap.state && (
        <Card title={t('s.library.resume-title')} onPress={() => nav('/guide')}>
          <p>{resumeEntry.title}</p>
        </Card>
      )}
      {snap.catalogStatus === 'error' && (
        <div role="alert">
          <p>{t('s.library.error')}</p>
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
        <p>{t('s.library.empty-search', { example: 'Mark 1' })}</p>
      )}
      <ul className="fia-list">
        {shown.map((b) => (
          <li key={b.book}>
            <button
              type="button"
              className="fia-row"
              data-book={b.book}
              aria-label={t('s.library.a11y.row', { book: b.name, n: b.count, saved: 0 })}
              onClick={() => {
                session.selectBook(b.book);
                nav('/pericopes');
              }}
            >
              <span>{b.name}</span>{' '}
              <span className="fia-caption">{t('s.library.guides-count', { n: b.count })}</span>
            </button>
          </li>
        ))}
      </ul>
    </ScreenFrame>
  );
}
