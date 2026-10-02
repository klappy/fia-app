import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProvenanceMark, SecondaryAction } from '../components';
import { FiaLogo } from '../components/FiaLogo';
import { CatalogRow, GlassSurface, GlassToggle, Icon } from '../components/glass';
import { browserKV, readCurrent } from '../flow/store';
import { t } from '../i18n';
import {
  DATA_PATHS,
  browserStore,
  fetchJson,
  loadSettings,
  noticeTokens,
  packLineParts,
  parsePackRights,
  parseRightsRecords,
  safeHref,
  saveSettings,
  type PackRightsLine,
  type RightsRow,
} from '../settings';
import LICENSE from '../../LICENSE?raw';
import NOTICE from '../../NOTICE.md?raw';
import { ScreenFrame } from './ScreenFrame';
import './l5-shell.css';

// S15 About / Rights (design/alpha-screens/15-about-rights.md), skinned in glass (F6-S15; nodded mock
// design/alpha-v2-screens/15-about.html @ cookbook; kit @6aa9bc3 via src/components/glass.ts only).
// Renders C-13 rights records and the repo LICENSE / NOTICE.md verbatim (R-312); every sentence of
// prose is a string key from the spec (Terry's copy) or a verbatim record field — nothing is written
// here. Each source row carries the holder and licence line from the current pack's `rights.json`
// (BL8), else the C-13 record's; a row with neither says so (`s.about.lines-missing`). The M5
// rights-note slot (`s.about.rights-note-slot`) is deliberately NOT rendered until Terry lands the note.
// Mock order: lockup card · This app (Install) · Sources and rights · Data we send · Send feedback.
// Kept from v1 (PoC is the floor): the verbatim notice under each source, the narration and
// translation notices, the app's LICENSE / NOTICE.md.
type Mark = 'plain' | 'scripture' | 'term' | 'media' | 'video';
const FIA_SOURCES: Record<string, { key: string; mark: Mark }> = {
  FIATranslationGuide: { key: 's.about.source.guide', mark: 'plain' },
  FIAKeyTerms: { key: 's.about.source.terms', mark: 'term' },
  FIAImages: { key: 's.about.source.images', mark: 'media' },
  FIAMaps: { key: 's.about.source.maps', mark: 'media' },
  VideoBibleDictionary: { key: 's.about.source.videos', mark: 'video' },
};
const FIA_ORDER = Object.keys(FIA_SOURCES);

function Notice({ html }: { html: string }) {
  return (
    <p dir="auto" className="fia-notice-prose">
      {noticeTokens(html).map((tok, i) => {
        if (tok.br) return <br key={i} />;
        let node: React.ReactNode = tok.text;
        if (tok.cite) node = <cite>{node}</cite>;
        if (tok.b) node = <b>{node}</b>;
        return <span key={i}>{node}</span>;
      })}
    </p>
  );
}

function RecordDetails({ row }: { row: RightsRow }) {
  return (
    <div className="fia-rights__details">
      {row.bothHolders && <p>{t('s.about.both-holders', row.bothHolders)}</p>}
      <ul dir="ltr">
        {row.holders.map((h) => (
          <li key={h}>{h}</li>
        ))}
        {row.discrepancies.map((d) => (
          <li key={d}>{d}</li>
        ))}
        <li>
          <code>{row.id}</code>
        </li>
        {row.url && (
          <li>{safeHref(row.url) ? <a href={safeHref(row.url)}>{row.url}</a> : row.url}</li>
        )}
        {row.licenseUrl && (
          <li>
            {safeHref(row.licenseUrl) ? (
              <a href={safeHref(row.licenseUrl)}>{row.licence}</a>
            ) : (
              `${row.licence} (${row.licenseUrl})`
            )}
          </li>
        )}
      </ul>
      {row.adaptationNotice && (
        <>
          <h4 className="fia-caption">{t('s.about.adaptation-notice')}</h4>
          <Notice html={row.adaptationNotice} />
        </>
      )}
      <h4 className="fia-caption">{t('s.about.licence-text')}</h4>
      <code dir="ltr" className="fia-rights__json">
        {row.licenseInfo}
      </code>
    </div>
  );
}

/** Legend mark of what a source feeds (mock (e)); app-drawn, the kit has no legend bead. */
function LegendMark({ kind }: { kind: Mark }) {
  return (
    <span
      className={`fia-about__mark fia-about__mark--${kind}`}
      data-kit-gap="legend-mark"
      aria-hidden
    />
  );
}

/** Lucide message-square in the kit Icon's style (24 grid, stroke 1.7); the kit has no `message`. */
function MessageGlyph() {
  return (
    <svg
      data-kit-gap="message"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/** A labelled group: overline + kit glass card; the inner div sits above the kit refraction layer. */
function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="fia-about__group" aria-labelledby={id}>
      <h2 id={id} className="fia-overline fia-about__overline">
        {title}
      </h2>
      <GlassSurface level={2} blur="medium" radius="xl" shadow="rest" className="fia-about__card">
        <div className="fia-about__inner">{children}</div>
      </GlassSurface>
    </section>
  );
}

function SourceRow({
  id,
  title,
  lines,
  mark,
  first,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  lines?: string[];
  mark?: ReactNode;
  first?: boolean;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <li className="fia-about__source" data-open={open || undefined}>
      <CatalogRow
        className="fia-about__row"
        first={first}
        onOpen={() => onToggle(id)}
        aria-expanded={open}
        aria-label={t('s.about.source.open', { title })}
        title={
          <span className="fia-about__src">
            {mark}
            <span className="fia-about__src-text">
              <span>{title}</span>
              {lines?.map((l) => (
                <span key={l} className="fia-caption fia-about__line" dir="auto">
                  {l}
                </span>
              ))}
            </span>
          </span>
        }
        meta={
          <span className="fia-about__chev" data-open={open || undefined}>
            <Icon name="chevronRight" size={16} />
          </span>
        }
      />
      {open && <div className="fia-about__detail">{children}</div>}
    </li>
  );
}

const firstLine = (s: string) =>
  s
    .split('\n')
    .find((l) => l.trim())
    ?.trim() ?? '';
const licenseHolder = (s: string) => /Copyright \(c\) \d{4}\s+(.+)/i.exec(s)?.[1]?.trim() ?? '';

export default function S15AboutRights() {
  const go = useNavigate();
  const [store] = useState(browserStore);
  const [settings, setSettings] = useState(() => loadSettings(store).settings);
  const [rows, setRows] = useState<RightsRow[] | null>(null);
  const [lines, setLines] = useState<PackRightsLine[]>([]);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    setRows(null);
    fetchJson(DATA_PATHS.rights)
      .then((d) => setRows(parseRightsRecords(d).rows))
      .catch(() => setFailed(true));
    const packId = readCurrent(browserKV()).packId;
    if (packId)
      fetchJson(DATA_PATHS.packRights(packId))
        .then((d) => setLines(parsePackRights(d)))
        .catch(() => setLines([]));
  }, []);
  useEffect(load, [load]);

  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));
  const records = rows ?? [];
  // With a current pack, its own sources name the editions on screen; else every C-13 edition (v1).
  const packEditions = lines.filter((l) => !FIA_SOURCES[l.collection]).map((l) => l.collection);
  const scripture = records.filter(
    (r) =>
      !FIA_SOURCES[r.collection] && (!packEditions.length || packEditions.includes(r.collection)),
  );
  const editions = packEditions.length ? packEditions : scripture.map((r) => r.collection);

  // Holder · licence for one collection: the pack line (BL8), else the C-13 record, else none.
  const lineFor = (collection: string): string | null => {
    const p = packLineParts(lines.find((l) => l.collection === collection));
    if (p) return t('s.about.holder-line', p);
    const r = records.find((x) => x.collection === collection);
    return r?.holder && r.licence
      ? t('s.about.holder-line', { holder: r.holder, licence: r.licence })
      : null;
  };
  const fiaLines = FIA_ORDER.map((c) => lineFor(c));
  const scriptureLines = editions.map((c) => lineFor(c));
  const loaded = rows !== null || lines.length > 0;
  const missing = loaded && [...fiaLines, ...scriptureLines].some((l) => l === null);
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];

  const detail = (collection: string) => {
    const r = records.find((x) => x.collection === collection);
    if (r) return <RecordDetails row={r} />;
    if (failed) return <SecondaryAction label={t('s.common.try-again')} onPress={load} />;
    return (
      <p aria-busy="true" className="fia-caption">
        {t('s.common.loading')}
      </p>
    );
  };

  const fiaRow = (c: string, i: number) => (
    <SourceRow
      key={c}
      id={c}
      first={i === 0}
      title={t(FIA_SOURCES[c].key)}
      lines={uniq([fiaLines[i]])}
      mark={<LegendMark kind={FIA_SOURCES[c].mark} />}
      open={open === c}
      onToggle={toggle}
    >
      {detail(c)}
    </SourceRow>
  );

  return (
    <ScreenFrame id="S15" primaryLabel={null}>
      <div className="fia-about">
        <GlassSurface
          level={2}
          blur="strong"
          radius="2xl"
          shadow="card"
          className="fia-about__hero"
        >
          <div className="fia-about__id">
            <span className="fia-about__logo">
              <FiaLogo size={44} />
            </span>
            <p className="fia-about__qualifier">{t('s.about.qualifier')}</p>
          </div>
        </GlassSurface>

        <Group id="s15-app" title={t('s.about.this-app')}>
          <CatalogRow
            className="fia-about__row"
            first
            onOpen={() => go('/install?from=about')}
            title={
              <span className="fia-row-label fia-about__install">
                <Icon name="arrowUpRight" size={18} />
                {t('s.about.install')}
              </span>
            }
            meta={<Icon name="chevronRight" size={16} />}
          />
        </Group>

        <Group id="s15-sources" title={t('s.about.sources')}>
          <ul className="fia-about__list" role="list">
            {fiaRow(FIA_ORDER[0], 0)}
            {editions.length > 0 && (
              <SourceRow
                id="scripture"
                title={t('s.about.source.scripture', { editions: editions.join(', ') })}
                lines={uniq(scriptureLines).length === 1 ? uniq(scriptureLines) : undefined}
                mark={<LegendMark kind="scripture" />}
                open={open === 'scripture'}
                onToggle={toggle}
              >
                {scripture.length
                  ? scripture.map((r) => (
                      <section key={r.id}>
                        <h3 className="fia-label">{r.collection}</h3>
                        {lineFor(r.collection) && (
                          <p className="fia-caption" dir="auto">
                            {lineFor(r.collection)}
                          </p>
                        )}
                        <RecordDetails row={r} />
                      </section>
                    ))
                  : detail('')}
              </SourceRow>
            )}
            {FIA_ORDER.slice(1).map((c, i) => fiaRow(c, i + 1))}
            <SourceRow
              id="narration"
              title={t('s.about.source.narration')}
              mark={<ProvenanceMark provenance="ai-voice" />}
              open={open === 'narration'}
              onToggle={toggle}
            >
              <p>{t('s.about.narration-notice')}</p>
            </SourceRow>
            <SourceRow
              id="translations"
              title={t('s.about.source.translations')}
              mark={<ProvenanceMark provenance="ai-translation" />}
              open={open === 'translations'}
              onToggle={toggle}
            >
              <p>{t('s.about.translation-notice')}</p>
            </SourceRow>
            <SourceRow
              id="app-code"
              title={t('s.about.source.app-code')}
              lines={[
                t('s.about.holder-line', {
                  holder: licenseHolder(LICENSE),
                  licence: firstLine(LICENSE),
                }),
              ]}
              open={open === 'app-code'}
              onToggle={toggle}
            >
              <pre dir="ltr" className="fia-rights__verbatim">
                {LICENSE}
              </pre>
              <pre dir="ltr" className="fia-rights__verbatim">
                {NOTICE}
              </pre>
            </SourceRow>
          </ul>
        </Group>
        <p className="fia-caption fia-about__note">
          {missing && <>{t('s.about.lines-missing')} </>}
          {t('s.about.tap-notice')}
        </p>

        <Group id="s15-data" title={t('s.about.data')}>
          <div className="fia-about__toggle">
            <div className="fia-about__toggle-text">
              <div className="fia-about__toggle-label">{t('s.about.data.count')}</div>
              <div className="fia-caption">{t('s.about.data.count-note')}</div>
            </div>
            <div className="fia-about__toggle-ctl">
              <span className="fia-about__state" aria-hidden>
                {t(settings.telemetryOptIn ? 's.settings.on' : 's.settings.off')}
              </span>
              <GlassToggle
                checked={settings.telemetryOptIn}
                aria-label={t('s.about.data.count')}
                style={{ padding: 0 }}
                onChange={(v) => {
                  const r = saveSettings(store, { ...settings, telemetryOptIn: v });
                  if (r.ok) setSettings(r.settings);
                }}
              />
            </div>
          </div>
        </Group>

        <div className="fia-about__links">
          <button type="button" className="fia-about__quiet" onClick={() => go('/feedback')}>
            <span className="fia-row-label">
              <MessageGlyph />
              {t('s.about.send-feedback')}
            </span>
          </button>
        </div>
      </div>
    </ScreenFrame>
  );
}
