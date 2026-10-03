import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type HTMLAttributes,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GlassButton, GlassSurface, Icon } from '../components/glass';
import { t } from '../i18n';
import {
  DATA_PATHS,
  browserStore,
  coverageFor,
  fetchJson,
  loadSettings,
  validateCatalog,
  type CatalogManifest,
} from '../settings';
import { GlassChip as KitGlassChip } from '../vendor/glass/components/glass/GlassChip';
import type { GlassChipProps } from '../vendor/glass/components/glass/GlassChip';
import { Bead as KitBead } from '../vendor/glass/components/progress/StageRail';
import type { BeadProps } from '../vendor/glass/components/progress/StageRail';
import {
  coverageCards,
  marksUsed,
  voiceState,
  type Cell,
  type CellMark,
  type LanguageFile,
  type TypeCard,
} from './coverageCards';
import { ScreenFrame } from './ScreenFrame';
import './S19Coverage.css';
import { kindColor } from '../frame/kinds';
import { iconSz, useTextScale } from '../frame/scale';

// S19 Coverage in glass, F6-S19 (19-coverage.md; R-304, R-314). Nodded mock
// design/alpha-v2-screens/19-coverage.html (Layer frame, no primary): the title says what the page
// answers, "What Español has", with one labelled way back; the key for the marks before the cards
// that use them; six kit GlassSurface type cards, each led by the guide's kind bead (kit Bead) with a
// Text and an Audio cell as kit GlassChip marks (check = on FIA in this language, sparkle = AI voice,
// dash = not yet; "none" where the kind has no audio); then the voice card. Every chip comes from the
// pipeline catalog (coverageCards.ts); a slot the data has not filled reads "not yet".
// Kit parts that components/glass.ts does not export on this base come straight from the kit paths;
// the casts are typing only (the kit's .d.ts omit the `...rest` the .jsx forward), as glass.ts does.
type Html = HTMLAttributes<HTMLElement> & Record<`data-${string}`, string | undefined>;
const GlassChip = KitGlassChip as unknown as ComponentType<GlassChipProps & Html>;
const Bead = KitBead as unknown as ComponentType<BeadProps & Html>;

/** KIT GAP (K1): Icon has no minus. Lucide 'minus' in the kit Icon's style: the [—] not-yet mark. */
function MinusGlyph({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-kit-gap="minus"
      style={{ display: 'block', flex: 'none' }}
    >
      <path d="M5 12h14" />
    </svg>
  );
}

function MarkGlyph({ mark, size }: { mark: Exclude<CellMark, 'none'>; size: number }) {
  if (mark === 'absent') return <MinusGlyph size={size} />;
  return <Icon name={mark === 'ai' ? 'sparkle' : 'check'} size={size} />;
}

function Mark({ cell, glyph }: { cell: Cell; glyph: number }) {
  if (cell.mark === 'none')
    return (
      <span className="s19-none" data-mark="none">
        {cell.words}
      </span>
    );
  return (
    <GlassChip
      className="fia-badge s19-chip"
      data-mark={cell.mark}
      leading={<MarkGlyph mark={cell.mark} size={glyph} />}
    >
      {cell.words}
    </GlassChip>
  );
}

function Card({ card, scale }: { card: TypeCard; scale: number }) {
  const glyph = iconSz(14, scale);
  return (
    <li data-type={card.key}>
      <GlassSurface level={2} blur="medium" radius="lg" shadow="rest" className="s19-card">
        <h2 className="s19-type">
          <span className="s19-bead">
            <Bead
              kind={card.kind}
              state="done"
              size={10 * Math.min(scale, 2.4)}
              color={kindColor(card.kind)}
            />
          </span>
          {t(`s.coverage.type.${card.key}`)}
        </h2>
        <div className="s19-cells">
          <span className="s19-cell" data-col="text">
            <span className="s19-label">{t('s.coverage.col.text')}</span>
            <Mark cell={card.text} glyph={glyph} />
          </span>
          <span className="s19-cell" data-col="audio">
            <span className="s19-label">{t('s.coverage.col.audio')}</span>
            <Mark cell={card.audio} glyph={glyph} />
          </span>
        </div>
      </GlassSurface>
    </li>
  );
}

/** Before the catalog answers: the language's own name from the platform, else its code. */
function fallbackName(code: string): string {
  try {
    const n = new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
    return n.charAt(0).toLocaleUpperCase(code) + n.slice(1);
  } catch {
    return code;
  }
}

interface Loaded {
  manifest: CatalogManifest;
  file: LanguageFile;
}

export default function S19Coverage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [code] = useState(
    () => params.get('lang') ?? loadSettings(browserStore()).settings.contentLanguage,
  );
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const scale = useTextScale();

  const load = useCallback(() => {
    setFailed(false);
    setData(null);
    Promise.all([fetchJson(DATA_PATHS.catalog), fetchJson(DATA_PATHS.languageCounts(code))])
      .then(([manifest, file]) => {
        if (!validateCatalog(manifest).ok) throw new Error('catalog fails C-03');
        // Every chip is a count from the per-language file: without it, the load failed.
        if (!(file as LanguageFile | null)?.counts) throw new Error('no per-language counts');
        setData({ manifest: manifest as CatalogManifest, file: file as LanguageFile });
      })
      .catch(() => setFailed(true));
  }, [code]);
  useEffect(load, [load]);

  const view = useMemo(() => {
    if (!data) return null;
    const cov = coverageFor(data.manifest, code, data.file.counts);
    const cards = coverageCards(cov, data.file);
    return { cov, cards, marks: marksUsed(cards), voice: voiceState(cards) };
  }, [data, code]);

  const language = view?.cov.language?.autonym ?? data?.file.autonym ?? fallbackName(code);
  const title = t('s.coverage.has', { language });
  // One labelled way back (PRD § 8.1 Layer): where the reader came from, else the library.
  const back = () =>
    (globalThis.history?.state as { idx?: number } | null)?.idx ? nav(-1) : nav('/library');

  return (
    <ScreenFrame id="S19" title={title} titleHidden primaryLabel={null}>
      <div className="s19-head">
        {/* The frame's <h1> names the page for assistive tech; this is its visible line (mock header). */}
        <p className="s19-hero" aria-hidden="true">
          {title}
        </p>
        <GlassButton
          variant="quiet"
          className="s19-back"
          leading={<Icon name="chevronLeft" size={iconSz(18, scale)} />}
          onClick={back}
        >
          {t('s.common.back')}
        </GlassButton>
      </div>
      <p className="s19-sub">{t('s.coverage.subtitle')}</p>

      {failed && (
        <GlassSurface
          level={2}
          blur="medium"
          radius="lg"
          shadow="rest"
          className="s19-card s19-failed"
        >
          <div role="alert" className="s19-error">
            <p className="s19-row">{t('s.coverage.error')}</p>
            <GlassButton
              variant="glass"
              className="s19-retry"
              leading={<Icon name="update" size={iconSz(18, scale)} />}
              onClick={load}
            >
              {t('s.coverage.try-again')}
            </GlassButton>
          </div>
        </GlassSurface>
      )}
      {!view && !failed && (
        <p aria-busy="true" className="fia-caption s19-loading">
          {t('s.common.loading')}
        </p>
      )}
      {view && (
        <>
          {/* The key first, so the marks are read before the cards that use them (pl-v21-support-13). */}
          <div className="s19-keys" role="list" aria-label={t('s.coverage.key.label')}>
            {view.marks.map((m) => (
              <span key={m} className="s19-key" role="listitem" data-mark={m}>
                <MarkGlyph mark={m} size={iconSz(14, scale)} />
                {m === 'on'
                  ? t('s.coverage.key.on', { language })
                  : m === 'ai'
                    ? t('s.common.mark.ai-voice')
                    : t('s.coverage.not-yet')}
              </span>
            ))}
          </div>
          <ul className="s19-cards" role="list">
            {view.cards.map((c) => (
              <Card key={c.key} card={c} scale={scale} />
            ))}
          </ul>
          <GlassSurface
            level={1}
            blur="soft"
            radius="lg"
            shadow="none"
            className="s19-voice"
            data-voice={view.voice}
          >
            <p className="s19-row">
              <Icon name="headphones" size={iconSz(16, scale)} />
              {view.voice === 'ai'
                ? t('s.coverage.voice', { language })
                : view.voice === 'recorded'
                  ? t('s.coverage.voice-recorded', { language })
                  : t('s.coverage.voice-not-yet', { language })}
            </p>
            <p className="fia-caption s19-note">{t('s.coverage.scripture-note')}</p>
          </GlassSurface>
        </>
      )}
    </ScreenFrame>
  );
}
