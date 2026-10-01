import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProvenanceMark, SecondaryAction, SettingsRow } from '../components';
import { SettingsToggle } from '../components/SettingsRow';
import { Outbox, appVersion } from '../feedback';
import { t } from '../i18n';
import {
  DATA_PATHS,
  browserStore,
  fetchJson,
  loadSettings,
  noticeTokens,
  parseRightsRecords,
  safeHref,
  saveSettings,
  type RightsRow,
} from '../settings';
import LICENSE from '../../LICENSE?raw';
import NOTICE from '../../NOTICE.md?raw';
import { ScreenFrame } from './ScreenFrame';
import './l5-shell.css';

// S15 About / Rights (design/alpha-screens/15-about-rights.md). Renders C-13 rights records and
// the repo LICENSE / NOTICE.md verbatim (R-312); every sentence of prose is a string key from the
// spec (Terry's copy) or a verbatim record field — nothing is written here. The M5 rights-note
// slot (`s.about.rights-note-slot`) is deliberately NOT rendered until Terry lands the note.
const FIA_SOURCES: Record<string, string> = {
  FIATranslationGuide: 's.about.source.guide',
  FIAImages: 's.about.source.images',
  FIAMaps: 's.about.source.maps',
  FIAKeyTerms: 's.about.source.terms',
  VideoBibleDictionary: 's.about.source.videos',
};

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

function SourceRow({
  id,
  title,
  subLine,
  mark,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  subLine?: string;
  mark?: React.ReactNode;
  open: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <li className="fia-card fia-rights__row" data-open={open || undefined}>
      <button
        type="button"
        className="fia-rights__head"
        aria-expanded={open}
        onClick={() => onToggle(id)}
      >
        <span className="fia-label">
          {mark} {title}
        </span>
        {subLine && (
          <span className="fia-caption" dir="auto">
            {subLine}
          </span>
        )}
        <span className="fia-visually-hidden">
          {t(open ? 's.about.collapse' : 's.about.expand')}
        </span>
        <span aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      {open && children}
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
  const [store] = useState(browserStore);
  const [settings, setSettings] = useState(() => loadSettings(store).settings);
  const [rows, setRows] = useState<RightsRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const counts = new Outbox(store).counts();
  const [version, build] = appVersion().split('+');

  const load = useCallback(() => {
    setFailed(false);
    setRows(null);
    fetchJson(DATA_PATHS.rights)
      .then((d) => setRows(parseRightsRecords(d).rows))
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));
  const fia = (rows ?? []).filter((r) => FIA_SOURCES[r.collection]);
  const scripture = (rows ?? []).filter((r) => !FIA_SOURCES[r.collection]);

  return (
    <ScreenFrame id="S15" dockActive="more">
      <section className="fia-about__brand">
        <p className="fia-mono">{t('s.about.version', { version, build })}</p>
      </section>

      <section aria-labelledby="s15-sources">
        <h2 id="s15-sources" className="fia-group-header">
          {t('s.about.sources')}
        </h2>
        {failed && <SecondaryAction label={t('s.common.try-again')} onPress={load} />}
        {!rows && !failed && (
          <p aria-busy="true" className="fia-caption">
            {t('s.common.loading')}
          </p>
        )}
        <ul className="fia-rights" role="list">
          {fia.map((r) => (
            <SourceRow
              key={r.id}
              id={r.id}
              title={t(FIA_SOURCES[r.collection])}
              subLine={t('s.about.holder-line', { holder: r.holder, licence: r.licence })}
              open={open === r.id}
              onToggle={toggle}
            >
              <RecordDetails row={r} />
            </SourceRow>
          ))}
          {scripture.length > 0 && (
            <SourceRow
              id="scripture"
              title={t('s.about.source.scripture', {
                editions: scripture.map((r) => r.collection).join(' · '),
              })}
              open={open === 'scripture'}
              onToggle={toggle}
            >
              {scripture.map((r) => (
                <section key={r.id}>
                  <h3 className="fia-label">{r.collection}</h3>
                  <p className="fia-caption">
                    {t('s.about.holder-line', { holder: r.holder, licence: r.licence })}
                  </p>
                  <RecordDetails row={r} />
                </section>
              ))}
            </SourceRow>
          )}
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
            subLine={t('s.about.holder-line', {
              holder: licenseHolder(LICENSE),
              licence: firstLine(LICENSE),
            })}
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
      </section>

      <section aria-labelledby="s15-data">
        <h2 id="s15-data" className="fia-group-header">
          {t('s.about.data')}
        </h2>
        <SettingsRow label={t('s.about.data.feedback')} control={null} />
        <SettingsRow
          label={t('s.about.data.counter')}
          consequence={settings.telemetryOptIn ? t('s.about.data.counter-note') : undefined}
          control={
            <SettingsToggle
              on={settings.telemetryOptIn}
              label={t('s.about.data.counter')}
              onChange={(v) => {
                const r = saveSettings(store, { ...settings, telemetryOptIn: v });
                if (r.ok) setSettings(r.settings);
              }}
            />
          }
        />
        <Link to="/feedback" className="fia-link-row">
          {t('s.about.feedback-row', { n: counts.sent, k: counts.waiting })} ⟶
        </Link>
      </section>

      <nav className="fia-links" aria-label={t('s.about.title')}>
        <Link to="/install">{t('s.about.install')}</Link>
        <Link to="/feedback">{t('s.about.send-feedback')}</Link>
      </nav>
    </ScreenFrame>
  );
}
