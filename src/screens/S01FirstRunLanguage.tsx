import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LanguagePicker } from '../components';
import { FiaLogo } from '../components/FiaLogo';
import { GlassButton, GlassSurface, Icon } from '../components/glass';
import {
  deviceLanguage,
  pickerLanguages,
  readCounts,
  suggestedLanguages,
} from '../components/languageRows';
import { flowSession, useFlow } from '../flow/session';
import { hasCatalog, setUiLanguage, t, uiLanguage } from '../i18n';
import { languageByCode } from '../i18n/languages';
import {
  browserStore,
  DATA_PATHS,
  loadSettings,
  saveSettings,
  type CatalogManifest as CoverageManifest,
  type LanguageCounts,
} from '../settings';
import { ScreenFrame } from './ScreenFrame';
import './S01FirstRunLanguage.css';

// S01 First run · language (J-A1 step 1). F6-S01 glass skin on the nodded mock
// (cookbook design/alpha-v2-screens/01-first-run-language.html): Linear frame — the 44 px FIA lockup with
// "Alpha · prototype" as the hero (PRD § 8.4), no header bar and no Explore (nothing to explore yet), the
// kit LanguagePicker as the content, a quiet "Send feedback" above the thumb band (J-A5), and one primary,
// "Continue in {autonym}". Rows, autonyms and coverage come from the C-03 catalog (BL2), never from code.
// The pick sets the guide's language (flow session, C-09) and the app's (C-10 contentLanguage, which the
// header pill reads), then opens the library.

type Counts = Record<string, LanguageCounts | null>;
const countsCache = new Map<string, Promise<Counts>>();

/** The chips' per-language counts, read once per app load; a file slower than 5 s is left unread and its
 *  row shows only what the catalog itself tells (Scripture, Guide). A partial read is not cached. */
function languageCounts(codes: readonly string[]): Promise<Counts> {
  const key = codes.join(',');
  let p = countsCache.get(key);
  if (!p) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    p = Promise.all(
      codes.map(
        async (c) =>
          [c, await readCounts(DATA_PATHS.languageCounts(c), { signal: ctl.signal })] as const,
      ),
    ).then((pairs) => {
      clearTimeout(timer);
      if (pairs.some(([, v]) => !v)) countsCache.delete(key);
      return Object.fromEntries(pairs);
    });
    countsCache.set(key, p);
  }
  return p;
}

export default function S01FirstRunLanguage() {
  const nav = useNavigate();
  // The header pill opens S01 in use mode (`/?mode=use`, ScreenFrame): it changes the content only.
  const [params] = useSearchParams();
  const useMode = params.get('mode') === 'use';
  const session = flowSession();
  const snap = useFlow(session);
  const [pick, setPick] = useState<string | undefined>();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [huge] = useState(() => loadSettings(browserStore()).settings.textSize === 'huge');
  // FS-2: with C-10 `subtitleMode` on, the disclosure also names passage summaries (TERRY-READING (4)).
  const [summaries] = useState(
    () => loadSettings(browserStore()).settings.subtitleMode === 'generated',
  );

  useEffect(() => {
    void session.loadCatalog();
  }, [session]);
  const manifest = snap.manifest;
  const codes = useMemo(() => manifest?.languages.map((l) => l.code) ?? [], [manifest]);
  useEffect(() => {
    if (codes.length === 0) return;
    let live = true;
    void languageCounts(codes).then((c) => live && setCounts(c));
    return () => {
      live = false;
    };
  }, [codes]);

  // The session's manifest is the same C-03 document S19 reads (validated against C-03 on load);
  // settings/coverage.ts types its resourceTypes as the C-03 enum.
  const languages = useMemo(
    () => (manifest && counts ? pickerLanguages(manifest as CoverageManifest, counts) : []),
    [manifest, counts],
  );
  const device = useMemo(() => deviceLanguage(codes), [codes]);
  const recent = snap.language && codes.includes(snap.language) ? snap.language : undefined;
  const chosen = pick ?? recent ?? device ?? (codes.includes('eng') ? 'eng' : codes[0]);
  const row = languages.find((l) => l.code === chosen);
  const failed = snap.catalogStatus === 'error';
  // Use mode (01-first-run-language.md:64): the pick changes the content only, so the first-run lede
  // ("one pick sets the guide and the app") is not shown; a pick other than the menus' language reads
  // `primary-use-content` with `content-only-note` on the line above it, else `primary-use` (later visit).
  const ui = uiLanguage();
  const contentOnly = useMode && row !== undefined && row.code !== ui;
  const uiName = languageByCode(ui)?.autonym ?? ui;

  const choose = (code: string) => {
    session.setLanguage(code);
    const store = browserStore();
    const saved = loadSettings(store).settings;
    // A failed save leaves the pill on the old language; the guide's language (above) is already set.
    if (useMode) {
      // Use mode: the UI language never flips silently (01-first-run-language.md:64, J-A7--P-01).
      saveSettings(store, { ...saved, contentLanguage: code });
      nav('/library');
      return;
    }
    // First run, SB-3 (1): one pick sets the guide and the app (`s.lang.lede`). The menus follow the
    // pick when it has a UI catalog (eng, spa); any other pick keeps English menus, the honest fallback.
    const ui = hasCatalog(code) ? code : 'eng';
    saveSettings(store, { ...saved, contentLanguage: code, uiLanguage: ui });
    void setUiLanguage(ui)
      .catch(() => undefined)
      .finally(() => nav('/library'));
  };

  return (
    <ScreenFrame
      id="S01"
      titleHidden
      primaryLabel={
        row
          ? t(
              contentOnly
                ? 's.lang.primary-use-content'
                : useMode
                  ? 's.lang.primary-use'
                  : 's.lang.primary-pick',
              { language: row.autonym },
            )
          : failed
            ? t('s.lang.primary-retry')
            : t('s.lang.primary-idle')
      }
      primaryState={row || failed ? 'default' : 'loading'}
      onPrimary={() => {
        if (row) choose(row.code);
        else if (failed) void session.loadCatalog(true);
      }}
    >
      <div className="s01-hero">
        <FiaLogo size={44} qualifier />
      </div>
      {/* The frame's h1 carries the same words for screen readers; this is the mock's display title. */}
      <p className="s01-h1 fia-display" aria-hidden="true">
        {t('s.lang.title')}
      </p>
      {useMode ? (
        languages.length > 0 && (
          <p className="fia-caption-v2 s01-lede">
            {t('s.lang.lede-count', { n: languages.length })}
          </p>
        )
      ) : (
        <p className="fia-caption-v2 s01-lede">
          {t('s.lang.lede')}
          {languages.length > 0 && ` ${t('s.lang.lede-count', { n: languages.length })}`}
        </p>
      )}
      {languages.length > 0 ? (
        <div className="s01-wrap">
          <LanguagePicker
            className="s01-picker"
            languages={languages}
            value={chosen}
            onChange={setPick}
            suggested={suggestedLanguages(codes, recent, device)}
            title={t('s.lang.picker-title')}
            placeholder={huge ? t('s.common.search') : t('s.lang.search-languages')}
          />
        </div>
      ) : (
        // Unmocked states, drawn on the kit card: the catalog is loading, or it could not be read
        // (first run with no connection); the primary turns into "Try again".
        <GlassSurface level={2} blur="strong" radius="2xl" shadow="card" className="s01-state">
          <div
            className="s01-state__inner"
            role={failed ? 'alert' : 'status'}
            aria-busy={!failed || undefined}
            data-state={failed ? 'error' : 'loading'}
          >
            <p className="s01-state__title fia-face-card-title fia-tone-title">
              {t('s.lang.picker-title')}
            </p>
            <p className="s01-state__body fia-face-body fia-tone-body">
              {failed ? t('s.lang.error') : `${t('s.common.loading')}…`}
            </p>
          </div>
        </GlassSurface>
      )}
      <p className="s01-note fia-type-caption fia-fw-medium fia-tone-body">
        {t(summaries ? 's.lang.disclosure-summaries' : 's.lang.disclosure')}
      </p>
      <div className="s01-feedback">
        <GlassButton
          variant="quiet"
          size="md"
          className="s01-feedback__btn"
          leading={<Icon name="message" size={18} />}
          onClick={() => nav('/feedback?from=S01')}
        >
          {t('s.common.explore.feedback')}
        </GlassButton>
      </div>
      {contentOnly && (
        <p
          className="s01-note fia-type-caption fia-fw-medium fia-tone-body"
          data-testid="s01-content-only-note"
        >
          {t('s.lang.content-only-note', { uiLanguage: uiName })}
        </p>
      )}
    </ScreenFrame>
  );
}
