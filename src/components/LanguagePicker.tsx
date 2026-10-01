import { useState } from 'react';
import { t } from '../i18n';
import { LANGUAGES, type Language } from '../i18n/languages';
import { stateAttrs, type StateProps } from './types';

// language-picker.md — 17 languages, autonym first, radio semantics, search on autonym/English/code.
export type PickerVariant = 'first-run' | 'sheet' | 'settings';

export interface LanguagePickerProps extends StateProps {
  variant?: PickerVariant;
  value?: string;
  onChange?: (code: string, row: Language) => void;
  languages?: readonly Language[];
}

export function LanguagePicker({
  variant = 'first-run',
  value,
  onChange,
  languages = LANGUAGES,
  state = 'default',
  className,
}: LanguagePickerProps) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const rows = needle
    ? languages.filter((l) =>
        [l.autonym, l.english, l.code].some((s) => s.toLowerCase().includes(needle)),
      )
    : languages;
  return (
    <div
      className={['fia-langs', `fia-langs--${variant}`, className].filter(Boolean).join(' ')}
      {...stateAttrs(state)}
    >
      <label className="fia-langs__search">
        <span>{t('s.common.search')}</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('s.lang.search-placeholder')}
          disabled={state === 'loading'}
        />
      </label>
      {state === 'loading' ? (
        <ul className="fia-langs__list" aria-busy>
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="fia-skeleton" />
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className="fia-langs__empty">
          {t('s.lang.empty-search', { q }, `No language matches "${q}".`)}
        </p>
      ) : (
        <ul className="fia-langs__list" role="radiogroup" aria-label={t('s.lang.title')}>
          {rows.map((l) => (
            <li key={l.code}>
              <label className="fia-langs__row" lang={l.bcp47}>
                <input
                  type="radio"
                  name="language"
                  value={l.code}
                  checked={value === l.code}
                  onChange={() => onChange?.(l.code, l)}
                />
                <span className="fia-langs__autonym" dir="auto">
                  {l.autonym}
                </span>
                <span className="fia-caption">{l.english}</span>
                {l.dir === 'rtl' && (
                  <span className="fia-chip" aria-label={t('s.lang.rtl-tag')}>
                    {t('s.lang.rtl-tag')}
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
