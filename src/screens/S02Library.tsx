import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components';
import { booksFor, entriesFor, matches } from '../flow/catalog';
import { booksWithReady, readyFirst, useReadyPacks } from '../flow/ready';
import { flowSession, useFlow } from '../flow/session';
import { t } from '../i18n';
import { languageName } from '../media/lang';
import { useOffline } from '../offline/useOffline';
import { savedPackIds, useOnline } from '../offline/useOnline';
import { ScreenFrame } from './ScreenFrame';

// S02 Library (02-library.md): books of the content language from the C-03 catalog, a resume
// card when a session exists (R-410). Offline (R-702): unsaved rows read needs-connection.
export default function S02Library() {
  const nav = useNavigate();
  const session = flowSession();
  const snap = useFlow(session);
  const [q, setQ] = useState('');
  const online = useOnline();
  const { packs } = useOffline();
  useEffect(() => {
    void session.loadCatalog();
    if (snap.packId) void session.loadGuide();
  }, [session, snap.packId]);

  const language = snap.language ?? 'eng';
  const books = useMemo(
    () => (snap.manifest ? booksFor(snap.manifest, language) : []),
    [snap.manifest, language],
  );
  // GAP-NOPACK: books with a passage that opens come first; a book with none reads
  // "not yet in {language}" in place of its count (ready.ts).
  const ready = useReadyPacks();
  const withReady = useMemo(
    () => (snap.manifest ? booksWithReady(entriesFor(snap.manifest, language), ready) : null),
    [snap.manifest, language, ready],
  );
  const notYet = (book: string) => !!withReady && !withReady.has(book);
  const shown = readyFirst(
    books.filter((b) => matches(q, b.name, b.book)),
    (b) => !notYet(b.book),
  );
  // R-702 / 02 § States "offline, saved books": a book with no saved passage reads
  // `not saved — needs connection` as a badge in place of its count; saved books are unchanged.
  const savedBooks = useMemo(() => {
    const ids = savedPackIds(packs);
    const out = new Set<string>();
    if (snap.manifest)
      for (const e of entriesFor(snap.manifest, language)) if (ids.has(e.packId)) out.add(e.book);
    return out;
  }, [packs, snap.manifest, language]);
  const resumeEntry =
    snap.manifest && snap.packId && snap.state && snap.state.visited.length > 1
      ? entriesFor(snap.manifest, language).find((e) => e.packId === snap.packId)
      : undefined;

  return (
    <ScreenFrame
      id="S02"
      title={snap.manifest?.languages.find((l) => l.code === language)?.autonym}
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
              aria-label={
                notYet(b.book)
                  ? `${b.name}, ${t('s.common.mark.absent', { language: languageName(language) })}`
                  : t('s.library.a11y.row', { book: b.name, n: b.count, saved: 0 })
              }
              onClick={() => {
                session.selectBook(b.book);
                nav('/pericopes');
              }}
            >
              <span>{b.name}</span>{' '}
              {notYet(b.book) ? (
                <span className="fia-mark fia-mark--absent" data-role="not-yet">
                  ◌ {t('s.common.mark.absent', { language: languageName(language) })}
                </span>
              ) : !online && !savedBooks.has(b.book) ? (
                <span className="fia-badge--needs-connection" data-role="needs-connection">
                  {t('s.library.row-not-saved')}
                </span>
              ) : (
                <span className="fia-caption">{t('s.library.guides-count', { n: b.count })}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </ScreenFrame>
  );
}
