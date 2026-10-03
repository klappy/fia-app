import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PericopeCard } from '../components';
import {
  BeadStrip,
  CatalogRow,
  GlassButton,
  GlassSearch,
  GlassSurface,
  Icon,
  StageRail,
  SyncBadge,
} from '../components/glass';
import { entriesFor, matches } from '../flow/catalog';
import { booksWithReady, readyFirst, useReadyPacks } from '../flow/ready';
import { flowSession, useFlow } from '../flow/session';
import { t } from '../i18n';
import { languageName } from '../media/lang';
import { useOffline } from '../offline/useOffline';
import { savedPackIds, useOnline } from '../offline/useOnline';
import {
  libraryBooks,
  openBook,
  passageMatches,
  resumeRecap,
  type LibraryBook,
  type RecapTail,
} from './libraryModel';
import { ScreenFrame } from './ScreenFrame';
import { KINDS } from '../frame/kinds';
import { keepRef } from '../frame/text';
import { useBig } from '../frame/scale';
import './S02Library.css';

// S02 Library (02-library.md; R-303, R-410, R-702, R-706) in glass, F6-S02. Nodded mock
// design/alpha-v2-screens/02-library.html (Home frame): hero "Library" and a count line, kit
// forms/GlassSearch, the books of the content language as kit resources/CatalogRow rows on a
// glass/GlassSurface well, then "Where you left off" (display only) recapping the guide band with
// the kit's progress/StageRail and BeadStrip, and one primary in the thumb slot. Passage titles are
// the reference, always; the optional AI subtitle is off by default and not drawn here (FS-1).

/** Counts read "1,497" (the strings are English today; the plural word is chosen by `n`). */
const num = (n: number) => n.toLocaleString('en');

function tailWords(tail: RecapTail): string {
  switch (tail.kind) {
    case 'talk-here':
      return t('s.library.tail.talk-here');
    case 'talk-after':
      return t('s.library.tail.talk-after', { n: tail.n });
    case 'guide-ends':
      return t('s.library.tail.guide-ends', { n: tail.n });
    case 'step-ends':
      return t('s.library.tail.step-ends', { n: tail.n });
  }
}

/** Per-book meta (mock BookMeta): saved count, voice line (PoC floor a1), passage count. */
function BookMeta({
  b,
  offline,
  notYet,
}: {
  b: LibraryBook;
  offline: boolean;
  /** GAP-NOPACK: the content language's name when no passage of this book opens in this build. */
  notYet?: string;
}) {
  return (
    <span className="s02-meta">
      {b.saved > 0 && (
        <span className="s02-saved">
          <Icon name="check" size={14} />
          {t('s.library.saved-count', { n: b.saved })}
        </span>
      )}
      {b.voice === 'ai' ? (
        <span className="s02-voice">
          <Icon name="sparkle" size={13} />
          {t('s.common.mark.ai-voice')}
        </span>
      ) : (
        <span className="s02-voice is-off">{t('s.library.voice-not-yet')}</span>
      )}
      {notYet ? (
        // GAP-NOPACK: a book with no passage that opens reads "not yet in {language}" in place of
        // its count (ready.ts).
        <span className="fia-mark fia-mark--absent" data-role="not-yet">
          ◌ {t('s.common.mark.absent', { language: notYet })}
        </span>
      ) : offline && b.saved === 0 ? (
        // R-702 / 02 § States "offline, saved books": the count gives way to a badge, never hidden.
        <span className="fia-badge--needs-connection s02-needs" data-role="needs-connection">
          {t('s.library.row-not-saved')}
        </span>
      ) : (
        <span className="s02-count">
          {t('s.library.passages-count', { n: b.count, count: num(b.count) })}
        </span>
      )}
      <Icon name="chevronRight" size={16} />
    </span>
  );
}

export default function S02Library() {
  const nav = useNavigate();
  const session = flowSession();
  const snap = useFlow(session);
  const [q, setQ] = useState('');
  const big = useBig();
  const online = useOnline();
  const { packs } = useOffline();
  useEffect(() => {
    void session.loadCatalog();
    if (snap.packId) void session.loadGuide();
  }, [session, snap.packId]);

  const language = snap.language ?? 'eng';
  const savedIds = useMemo(() => savedPackIds(packs), [packs]);
  const books = useMemo(
    () => (snap.manifest ? libraryBooks(snap.manifest, language, savedIds) : []),
    [snap.manifest, language, savedIds],
  );
  const passages = useMemo(
    () => (snap.manifest ? passageMatches(snap.manifest, language, q) : []),
    [snap.manifest, language, q],
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
  const total = books.reduce((n, b) => n + b.count, 0);
  const autonym = snap.manifest?.languages.find((l) => l.code === language)?.autonym ?? language;
  const resumeEntry =
    snap.manifest && snap.packId && snap.state && snap.state.visited.length > 1
      ? entriesFor(snap.manifest, language).find((e) => e.packId === snap.packId)
      : undefined;
  const recap =
    resumeEntry && snap.guide?.packId === resumeEntry.packId && snap.state
      ? resumeRecap(snap.guide, snap.state.unitId)
      : undefined;
  const first = resumeEntry ? undefined : openBook(books, snap.book);
  const openRow = (book: string) => {
    session.selectBook(book);
    nav('/pericopes');
  };

  return (
    <ScreenFrame
      id="S02"
      title={t('s.library.title')}
      titleHero
      primaryLabel={
        resumeEntry
          ? t('s.library.primary-continue', { ref: keepRef(resumeEntry.title) })
          : first
            ? t('s.library.primary-open', { book: first.name })
            : null
      }
      onPrimary={() => (resumeEntry ? nav('/guide') : first && openRow(first.book))}
    >
      {snap.catalogStatus === 'ready' && (
        <p className="fia-caption s02-sub">
          {t('s.library.summary', {
            language: autonym,
            b: books.length,
            books: num(books.length),
            n: total,
            count: num(total),
          })}
        </p>
      )}
      <div className="s02-search">
        <GlassSearch
          // At 200%+ the long placeholder would clip in the field: the short word, as the mock does.
          placeholder={big ? t('s.common.search') : t('s.library.search-placeholder')}
          aria-label={t('s.library.search-placeholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          height="auto"
          style={{ minHeight: 48 }}
        />
      </div>
      {snap.catalogStatus === 'error' && (
        <div role="alert" className="s02-error">
          <p>{t('s.library.error')}</p>
          <GlassButton
            variant="quiet"
            leading={<Icon name="update" size={16} />}
            onClick={() => void session.loadCatalog(true)}
          >
            {t('s.common.try-again')}
          </GlassButton>
        </div>
      )}
      {snap.catalogStatus === 'loading' && (
        <GlassSurface
          level={2}
          blur="medium"
          radius="xl"
          shadow="rest"
          className="s02-well s02-well--loading"
          aria-busy="true"
          data-state="loading"
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="s02-skel" aria-hidden="true" />
          ))}
        </GlassSurface>
      )}
      {snap.catalogStatus === 'ready' && shown.length === 0 && passages.length === 0 && (
        <p className="s02-empty">{t('s.library.empty-search', { example: 'Mark 1' })}</p>
      )}
      {shown.length > 0 && (
        <GlassSurface
          level={2}
          blur="medium"
          radius="xl"
          shadow="rest"
          className={`s02-well s02-books${recap ? ' s02-books--bounded' : ''}`}
        >
          <ul className="s02-list">
            {shown.map((b, i) => (
              <li key={b.book}>
                <CatalogRow
                  className="fia-catalog s02-book"
                  first={i === 0}
                  title={b.name}
                  meta={
                    <BookMeta
                      b={b}
                      offline={!online}
                      notYet={notYet(b.book) ? languageName(language) : undefined}
                    />
                  }
                  data-book={b.book}
                  onOpen={() => openRow(b.book)}
                />
              </li>
            ))}
          </ul>
        </GlassSurface>
      )}
      {passages.length > 0 && (
        <section className="s02-passages" aria-label={t('s.library.passages-heading')}>
          <h2 className="fia-overline">{t('s.library.passages-heading')}</h2>
          <GlassSurface level={2} blur="medium" radius="xl" shadow="rest" className="s02-well">
            <ul className="s02-list">
              {passages.map((e, i) => (
                <li key={e.packId}>
                  <PericopeCard
                    reference={keepRef(e.title)}
                    packId={e.packId}
                    first={i === 0}
                    saved={savedIds.has(e.packId) ? 'saved' : !online ? 'not-saved' : undefined}
                    onOpen={() => {
                      session.selectBook(e.book);
                      session.selectPack(e.packId);
                      nav('/passage');
                    }}
                  />
                </li>
              ))}
            </ul>
          </GlassSurface>
        </section>
      )}
      {resumeEntry && recap && (
        <GlassSurface
          level={2}
          blur="strong"
          radius="xl"
          shadow="card"
          className="s02-resume"
          data-role="resume"
        >
          <div className="s02-resume__body">
            <div className="s02-resume__top">
              <span className="fia-overline s02-overline">{t('s.library.resume-overline')}</span>
              {savedIds.has(resumeEntry.packId) && (
                <SyncBadge
                  state="ok"
                  label={t('s.common.explore.saved')}
                  className="fia-badge s02-badge"
                />
              )}
            </div>
            <p className="s02-resume__title">
              {t('s.library.resume-heading', {
                ref: keepRef(resumeEntry.title),
                stage: recap.stepTitle,
              })}
            </p>
            <div className="s02-recap">
              <span className="fia-overline s02-overline">
                {t('s.library.resume-where', {
                  n: recap.stepIndex + 1,
                  total: recap.steps.length,
                  part: recap.n,
                  m: recap.m,
                })}
              </span>
              <StageRail
                stages={recap.steps}
                current={recap.stepIndex}
                progress={recap.progress}
                label={t('s.library.resume-steps', {
                  n: recap.stepIndex + 1,
                  total: recap.steps.length,
                  stage: recap.stepTitle,
                })}
              />
              <BeadStrip
                items={recap.beads}
                before={recap.before}
                after={recap.after}
                kinds={KINDS}
                label={t('s.library.resume-beads', {
                  n: recap.n,
                  m: recap.m,
                  tail: tailWords(recap.tail),
                })}
              />
            </div>
            <p className="fia-caption s02-next">
              {t('s.library.resume-next', { tail: tailWords(recap.tail) })}
            </p>
          </div>
        </GlassSurface>
      )}
    </ScreenFrame>
  );
}
