import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AbsentBadge, SecondaryAction } from '../components';
import { t } from '../i18n';
import {
  DATA_PATHS,
  browserStore,
  coverageFor,
  fetchJson,
  loadSettings,
  validateCatalog,
  type CatalogManifest,
  type CoverageRow,
  type LanguageCounts,
  type LanguageCoverage,
  type ProvenanceCount,
} from '../settings';
import { ScreenFrame } from './ScreenFrame';
import './l5-shell.css';

// S19 Coverage per language (design/alpha-screens/19-coverage.md; R-304, R-314). Reads the C-03
// catalog (validated) plus the pipeline's per-language counts; every number shown is from data,
// absent types are badged "not yet in {language}", nothing is invented. Per-type audio/description
// splits and the voice audition row (R-510) need fields C-03 does not carry yet — not rendered.
const ICON = { ai: '✦', src: '🎙', absent: '◌' };

function cellText(row: CoverageRow, language: string): React.ReactNode {
  switch (row.status) {
    case 'available':
      return row.key === 'scripture'
        ? t('s.coverage.cell.editions', { n: row.count ?? 0 })
        : t('s.coverage.cell.source', { n: row.count ?? 0 });
    case 'english-only':
      return t('s.coverage.cell.english-only', ICON);
    case 'listed':
      return t('s.common.mark.checking');
    case 'absent':
      return <AbsentBadge language={language} />;
  }
}

function Counts({ label, c, language }: { label: string; c: ProvenanceCount; language: string }) {
  const parts: string[] = [];
  if (c.source) parts.push(t('s.coverage.cell.source', { n: c.source }));
  if (c.generated) parts.push(t('s.coverage.cell.ai', { ...ICON, n: c.generated }));
  if (c.missing) parts.push(`${c.missing} · ${t('s.coverage.cell.absent', { ...ICON, language })}`);
  return (
    <p>
      {label}: {parts.length ? parts.join(' · ') : t('s.coverage.cell.none')}
    </p>
  );
}

export default function S19Coverage() {
  const [params] = useSearchParams();
  const [code] = useState(
    () => params.get('lang') ?? loadSettings(browserStore()).settings.contentLanguage,
  );
  const [cov, setCov] = useState<LanguageCoverage | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    setCov(null);
    Promise.all([
      fetchJson(DATA_PATHS.catalog),
      fetchJson(DATA_PATHS.languageCounts(code)).catch(() => null),
    ])
      .then(([manifest, lang]) => {
        if (!validateCatalog(manifest).ok) throw new Error('catalog fails C-03');
        const counts = (lang as { counts?: LanguageCounts } | null)?.counts;
        setCov(coverageFor(manifest as CatalogManifest, code, counts));
      })
      .catch(() => setFailed(true));
  }, [code]);
  useEffect(load, [load]);

  const language = cov?.language?.autonym ?? code;
  const dir = cov?.language?.direction ?? 'auto';

  return (
    <ScreenFrame id="S19" title={t('s.coverage.title', { language })} dockActive="more">
      <p className="fia-subtitle">{t('s.coverage.subtitle')}</p>
      {cov && (
        <p className="fia-caption">
          {t('s.coverage.as-of', { date: new Date(cov.builtAt).toLocaleDateString() })}
        </p>
      )}
      {failed && (
        <div role="alert">
          <p>{t('s.coverage.error')}</p>
          <SecondaryAction label={t('s.coverage.try-again')} onPress={load} />
        </div>
      )}
      {!cov && !failed && (
        <p aria-busy="true" className="fia-caption">
          {t('s.common.loading')}
        </p>
      )}
      {cov && (
        <ul className="fia-coverage-cards" role="list" dir={dir}>
          {cov.rows.map((row) => (
            <li key={row.key} className="fia-card" data-status={row.status}>
              <h3 className="fia-label">{t(`s.coverage.type.${row.key}`)}</h3>
              <p>
                {t('s.coverage.col.text')}: {cellText(row, language)}
              </p>
              {row.sourceAudio ? (
                <p>
                  {t('s.coverage.col.audio')}:{' '}
                  {t('s.coverage.cell.source-rec', { ...ICON, n: row.sourceAudio })}
                </p>
              ) : null}
              {row.key === 'scripture' && (
                <p className="fia-caption">{t('s.coverage.scripture-note')}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {cov && (
        <section className="fia-card" aria-label={t('s.coverage.legend')}>
          <Counts label={t('s.coverage.col.text')} c={cov.provenance.text} language={language} />
          <Counts label={t('s.coverage.col.audio')} c={cov.provenance.audio} language={language} />
          <Counts
            label={t('s.coverage.col.description')}
            c={cov.provenance.description}
            language={language}
          />
        </section>
      )}
      <section aria-labelledby="s19-legend">
        <h2 id="s19-legend" className="fia-group-header">
          {t('s.coverage.legend')}
        </h2>
        <ul role="list">
          <li>{t('s.coverage.legend.source')}</li>
          <li>{t('s.coverage.legend.rec', ICON)}</li>
          <li>{t('s.coverage.legend.ai', ICON)}</li>
          <li>{t('s.coverage.legend.absent', { ...ICON, language })}</li>
        </ul>
      </section>
      <Link to="/feedback?from=S19" className="fia-link-row">
        {t('s.coverage.report-gap')} ⟶
      </Link>
    </ScreenFrame>
  );
}
