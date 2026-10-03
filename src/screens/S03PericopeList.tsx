import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { CatalogRow, GlassButton, GlassSurface, Icon, type KitIconName } from '../components/glass';
import { bookName, entriesFor, matches, pericopesFor } from '../flow/catalog';
import { isNotYet, readyFirst, useReadyPacks } from '../flow/ready';
import { flowSession, useFlow } from '../flow/session';
import type { CatalogEntry } from '../flow/types';
import { t } from '../i18n';
import { languageName } from '../media/lang';
import { offline, saveRowState, useOffline, useOnline } from '../offline';
import { freeBytes } from '../offline/storage';
import { browserStore, DATA_PATHS, fetchJson, loadSettings } from '../settings';
import { GlassChip as KitGlassChip } from '../vendor/glass/components/glass/GlassChip';
import type { GlassChipProps } from '../vendor/glass/components/glass/GlassChip';
import { GlassSearch as KitGlassSearch } from '../vendor/glass/components/forms/GlassSearch';
import { SyncBadge as KitSyncBadge } from '../vendor/glass/components/scripture/SyncBadge';
import type { SyncBadgeProps } from '../vendor/glass/components/scripture/SyncBadge';
import {
  freeWords,
  keepRef,
  listFacts,
  metaWords,
  rowFacts,
  selectionBytes,
  sizeWords,
  type ListFacts,
  type RowFacts,
} from './pericopeList';
import { ScreenFrame } from './ScreenFrame';
import { useBig } from '../frame/scale';
import './S03PericopeList.css';

// S03 Pericope list in glass, F6-S03 (03-pericope-list.md; R-306–R-309, R-702). Nodded mock
// design/alpha-v2-screens/03-pericope-list.html (Browse frame): quiet "‹ Library", the book as the
// hero with the quiet Select toggle beside it, kit forms/GlassSearch, a count line, the passages as
// kit resources/CatalogRow rows on one glass/GlassSurface well, and one primary in the thumb slot.
//   browse (J-A1): a row opens its passage card (S04); a saved passage keeps its Saved chip.
//   select (J-A2; R-308): a row toggles. Its state is a kit glass/GlassChip (Saved · Selected · Add);
//   the GlassChip selected state is the multi-select (FE-2, BUILD-ORDER K4). The summary card (kit
//   SyncBadge "Text only", free space) and "Save 3 for offline" save the chosen at the Text tier.
// Kit parts that components/glass.ts does not export yet come straight from the kit paths; the casts
// are typing only (the kit's .d.ts omit the `...rest` the .jsx forward), as glass.ts does.
type Html = HTMLAttributes<HTMLElement> & Record<`data-${string}`, string | undefined>;
const GlassChip = KitGlassChip as unknown as ComponentType<GlassChipProps & Html>;
const SyncBadge = KitSyncBadge as unknown as ComponentType<SyncBadgeProps & Html>;
const GlassSearch = KitGlassSearch as unknown as ComponentType<
  Omit<InputHTMLAttributes<HTMLInputElement>, 'style' | 'height'> & {
    height?: number | 'auto';
    style?: CSSProperties;
  }
>;

/** Glyphs grow with large text, capped (mock iconSz). */
const iconSz = (n: number, big: boolean) => (big ? Math.round(n * 1.5) : n);

/** One state chip (kit GlassChip): an icon and a user word, never a glyph alone. */
function Chip({
  icon,
  on,
  big,
  quiet,
  testId,
  children,
}: {
  icon: KitIconName;
  on?: boolean;
  big: boolean;
  /** the row's checkbox state already says it: keep the word out of the row's name */
  quiet?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <GlassChip
      className={`s03-chip${on ? ' is-on' : ''}`}
      leading={<Icon name={icon} size={iconSz(14, big)} stroke={on ? 2.4 : undefined} />}
      aria-hidden={quiet || undefined}
      data-testid={testId}
    >
      {children}
    </GlassChip>
  );
}

export default function S03PericopeList() {
  const nav = useNavigate();
  const session = flowSession();
  const snap = useFlow(session);
  const [q, setQ] = useState('');
  const online = useOnline();
  const off = useOffline();
  const big = useBig();
  useEffect(() => {
    void session.loadCatalog();
    // the guide in progress (R-410): its walked parts count and the Continue primary
    if (snap.packId) void session.loadGuide();
  }, [session, snap.packId]);
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

  // Per-language catalog file: the parts estimate and whether the Text size is measured.
  const [facts, setFacts] = useState<{ lang?: string; map: Record<string, ListFacts> }>({
    map: {},
  });
  useEffect(() => {
    let live = true;
    fetchJson(DATA_PATHS.languageCounts(language))
      .then((doc) => live && setFacts({ lang: language, map: listFacts(doc) }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [language]);
  const factsOf = (r: CatalogEntry): RowFacts => {
    const st = saveRowState(r.packId, off.packs, off.saving);
    return rowFacts(
      r,
      facts.lang === language ? facts.map[r.packId] : undefined,
      snap.guide,
      st.state === 'saved' ? st.pack : undefined,
    );
  };

  // Select mode (J-A2, R-308): the chosen pack ids. A saved passage is not a choice, nor is one
  // this build has no pack for (GAP-NOPACK: it says "not yet", there is nothing to save).
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState<{ i: number; n: number } | null>(null);
  const [failed, setFailed] = useState(0);
  const isSaved = (id: string) => saveRowState(id, off.packs, off.saving).state === 'saved';
  const picked = rows.filter(
    (r) => chosen.has(r.packId) && !isSaved(r.packId) && !isNotYet(ready, r.packId),
  );
  const toggle = (id: string) =>
    setChosen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const saveChosen = async () => {
    if (saving || !picked.length) return;
    const ids = picked.map((r) => r.packId);
    const mode = loadSettings(browserStore()).settings.narrationMode;
    const left = new Set<string>();
    setFailed(0);
    for (let i = 0; i < ids.length; i++) {
      setSaving({ i: i + 1, n: ids.length });
      // C-07 SAVE, one at a time, at the Text tier (the summary's "Text only"). Nothing here
      // claims "saved": the rows read the worker's verified status (R-309).
      const done = await offline.save(ids[i], 'text', mode);
      if (!done || done.error) left.add(ids[i]);
    }
    setSaving(null);
    setChosen(left);
    setFailed(left.size);
    if (!left.size) setSelecting(false);
  };

  // Browse primary: the guide in progress continues, as on S02 (mock; PRD § 8.2).
  const resume =
    snap.manifest && snap.packId && snap.state && snap.state.visited.length > 1
      ? entriesFor(snap.manifest, language).find((e) => e.packId === snap.packId)
      : undefined;
  const sum = selectionBytes(picked.map(factsOf));
  const free = freeBytes(off.storage);

  const primaryLabel = selecting
    ? saving
      ? t('s.pericopes.primary-saving', { i: saving.i, n: saving.n })
      : picked.length
        ? t('s.pericopes.primary-save-offline', { n: picked.length })
        : t('s.pericopes.primary-save-none')
    : resume
      ? t('s.library.primary-continue', { ref: keepRef(resume.title) })
      : null;
  const primaryState = selecting
    ? saving
      ? 'loading'
      : !picked.length || !online
        ? 'disabled'
        : undefined
    : undefined;

  return (
    <ScreenFrame
      id="S03"
      titleHidden
      title={book}
      primaryLabel={primaryLabel}
      primaryState={primaryState}
      onPrimary={selecting ? () => void saveChosen() : () => nav('/guide')}
    >
      <div className="s03-back">
        <GlassButton
          variant="quiet"
          className="s03-quiet"
          leading={<Icon name="chevronLeft" size={iconSz(18, big)} />}
          onClick={() => nav('/library')}
        >
          {t('s.pericopes.back')}
        </GlassButton>
      </div>
      <div className="s03-head">
        {/* The frame's <h1> names the book for assistive tech; this is its visible hero (mock .s03-hero). */}
        <p className="fia-hero s03-hero" aria-hidden="true">
          {book}
        </p>
        <GlassButton
          variant="quiet"
          className="s03-quiet s03-toggle"
          leading={<Icon name={selecting ? 'x' : 'check'} size={iconSz(18, big)} />}
          aria-pressed={selecting}
          data-testid="select-toggle"
          onClick={() => {
            setSelecting((v) => !v);
            setFailed(0);
          }}
        >
          {selecting ? t('s.pericopes.select-done') : t('s.pericopes.select')}
        </GlassButton>
      </div>
      <div className="s03-search">
        <GlassSearch
          // At 200%+ the long placeholder would clip: the short word, as the mock does.
          placeholder={big ? t('s.common.search') : t('s.pericopes.search', { book })}
          aria-label={t('s.pericopes.search-label', { book })}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          height="auto"
          style={{ minHeight: big ? 56 : 48 }}
        />
      </div>
      {snap.catalogStatus === 'ready' && rows.length > 0 && (
        <p className="fia-caption s03-hint" data-testid="list-hint">
          {t(selecting ? 's.pericopes.hint.select' : 's.pericopes.hint.browse', {
            n: rows.length,
            count: rows.length.toLocaleString('en'),
          })}
        </p>
      )}
      {!online && <p className="fia-caption s03-hint">{t('s.pericopes.offline-hint')}</p>}
      {snap.catalogStatus === 'error' && (
        <div role="alert" className="s03-error">
          <p>{t('s.pericopes.error', { book })}</p>
          <GlassButton
            variant="quiet"
            className="s03-quiet"
            leading={<Icon name="update" size={iconSz(16, big)} />}
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
          className="s03-well s03-well--loading"
          aria-busy="true"
          data-state="loading"
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className="s03-skel" aria-hidden="true" />
          ))}
        </GlassSurface>
      )}
      {snap.catalogStatus === 'ready' && rows.length > 0 && shown.length === 0 && (
        <p className="s03-empty">{t('s.pericopes.empty-search', { book })}</p>
      )}
      {shown.length > 0 && (
        <GlassSurface level={2} blur="medium" radius="xl" shadow="rest" className="s03-well">
          <ul className="s03-list" data-mode={selecting ? 'select' : 'browse'}>
            {shown.map((r, i) => {
              const st = saveRowState(r.packId, off.packs, off.saving);
              const saved = st.state === 'saved';
              // GAP-NOPACK: a passage this build cannot open reads "not yet in {language}" in place
              // of its size (ready.ts).
              const notYet = isNotYet(ready, r.packId);
              const meta = metaWords(factsOf(r));
              const ref = keepRef(r.title);
              const size = notYet ? (
                <span className="fia-mark fia-mark--absent" data-role="not-yet">
                  ◌ {t('s.common.mark.absent', { language: languageName(language) })}
                </span>
              ) : meta ? (
                <span className="s03-size" data-testid="row-size">
                  {meta}
                </span>
              ) : null;
              const savedChip = (
                <Chip icon="check" big={big} testId="row-saved">
                  {t('s.pericopes.chip.saved')}
                </Chip>
              );
              if (!selecting)
                return (
                  <li key={r.packId}>
                    <CatalogRow
                      className="fia-catalog s03-row"
                      first={i === 0}
                      data-pack-id={r.packId}
                      title={
                        !online && !saved && !notYet ? (
                          // pericope-card.md offline: unsaved rows stay tappable; the fact is a
                          // chip in words under the reference (not drawn in the mock).
                          <span className="s03-title s03-title--stack">
                            <span className="s03-ref">{ref}</span>
                            <span className="s03-needs" data-role="needs-connection">
                              <Chip icon="cloudOff" big={big}>
                                {t('s.common.not-saved-badge')}
                              </Chip>
                            </span>
                          </span>
                        ) : (
                          ref
                        )
                      }
                      meta={
                        <span className="s03-meta">
                          {saved && savedChip}
                          {st.state === 'saving' && (
                            <Chip icon="download" big={big}>
                              {t('s.pericopes.chip.saving')}
                            </Chip>
                          )}
                          {st.state === 'partial' && st.pack && (
                            <Chip icon="download" big={big}>
                              {t('s.common.mark.partial', {
                                saved: st.pack.savedFiles ?? 0,
                                total: st.pack.files ?? 0,
                              })}
                            </Chip>
                          )}
                          <span className="s03-tail">
                            {size}
                            <Icon name="chevronRight" size={iconSz(16, big)} />
                          </span>
                        </span>
                      }
                      onOpen={() => {
                        session.selectPack(r.packId);
                        nav('/passage');
                      }}
                    />
                  </li>
                );
              // A saved passage and a not-yet one are not choices; the others are checkboxes (R-308).
              const choice = !saved && !notYet;
              const on = choice && chosen.has(r.packId);
              const locked = !choice || !!saving;
              return (
                <li key={r.packId}>
                  <CatalogRow
                    className={`fia-catalog s03-row${on ? ' is-on' : ''}`}
                    first={i === 0}
                    data-pack-id={r.packId}
                    role={choice ? 'checkbox' : undefined}
                    aria-checked={choice ? on : undefined}
                    aria-disabled={locked || undefined}
                    title={
                      <span className="s03-title">
                        {saved ? (
                          savedChip
                        ) : notYet ? null : on ? (
                          <Chip icon="check" on quiet big={big} testId="row-selected">
                            {t('s.pericopes.chip.selected')}
                          </Chip>
                        ) : (
                          <Chip icon="plus" quiet big={big} testId="row-add">
                            {t('s.pericopes.chip.add')}
                          </Chip>
                        )}
                        <span className="s03-ref">{ref}</span>
                      </span>
                    }
                    meta={size}
                    onOpen={locked ? undefined : () => toggle(r.packId)}
                  />
                </li>
              );
            })}
          </ul>
        </GlassSurface>
      )}
      {selecting && failed > 0 && (
        <p role="alert" className="s03-failed">
          {t('s.pericopes.save-failed', { n: failed })}
        </p>
      )}
      {selecting && picked.length > 0 && (
        <GlassSurface
          level={3}
          blur="strong"
          radius="xl"
          shadow="card"
          className="s03-summary"
          data-testid="select-summary"
        >
          <div className="s03-summary__body">
            <div className="s03-summary__top">
              <span className="s03-summary__title">
                {sum
                  ? t('s.pericopes.summary', { n: picked.length, size: sizeWords(sum) })
                  : t('s.pericopes.summary-count', { n: picked.length })}
              </span>
              <SyncBadge state="ok" label={t('s.pericopes.text-only')} className="s03-badge" />
            </div>
            {free !== undefined && (
              <p className="fia-caption s03-free">
                {t('s.pericopes.free', { size: freeWords(free) })}
              </p>
            )}
          </div>
        </GlassSurface>
      )}
    </ScreenFrame>
  );
}
