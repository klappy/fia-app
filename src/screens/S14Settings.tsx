import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SettingsRow, ToastNotice } from '../components';
import { SettingsToggle } from '../components/SettingsRow';
import { t } from '../i18n';
import {
  TEXT_STEPS,
  applyEasyMode,
  applyToDocument,
  browserStore,
  loadSettings,
  saveSettings,
  type NarrationMode,
  type Settings,
  type Theme,
} from '../settings';
import { ScreenFrame } from './ScreenFrame';
import './l5-shell.css';

// S14 Settings (design/alpha-screens/14-settings.md). Every change persists to C-10
// `fia.settings.v1` after validation (R-706); a failed save shows `save-failed` for 4 s and the
// app continues. Rows whose value has no C-10 field (auto-continue, play-next, content-language
// split) are not rendered here: they would not persist (see release/changes/l5-shell.md).
const NARRATION: { mode: NarrationMode; key: string }[] = [
  { mode: 'source-fallback', key: 's.settings.narration.fallback' },
  { mode: 'source-only', key: 's.settings.narration.source-only' },
  { mode: 'generated-only', key: 's.settings.narration.ai-only' },
];
const THEMES: { theme: Theme; key: string }[] = [
  { theme: 'light', key: 's.settings.theme.light' },
  { theme: 'dark', key: 's.settings.theme.dark' },
  { theme: 'system', key: 's.settings.theme.auto' },
];
const A_SIZE = ['1em', '1.25em', '1.5em'];

export default function S14Settings() {
  const navigate = useNavigate();
  const [store] = useState(browserStore);
  const [settings, setSettings] = useState<Settings>(() => loadSettings(store).settings);
  const [failed, setFailed] = useState(false);

  useEffect(() => applyToDocument(settings), [settings]);
  useEffect(() => {
    if (!failed) return;
    const id = setTimeout(() => setFailed(false), 4000);
    return () => clearTimeout(id);
  }, [failed]);

  const update = (next: Settings) => {
    const r = saveSettings(store, next);
    setSettings(r.ok ? r.settings : next);
    if (!r.ok) setFailed(true);
  };

  return (
    <ScreenFrame id="S14" dockActive="more" onPrimary={() => navigate(-1)}>
      <section aria-labelledby="s14-narration">
        <h2 id="s14-narration" className="fia-group-header">
          {t('s.settings.narration')}
        </h2>
        <div role="radiogroup" aria-labelledby="s14-narration">
          {NARRATION.map((n) => (
            <SettingsRow
              key={n.mode}
              label={t(n.key)}
              control={
                <input
                  type="radio"
                  name="narration"
                  aria-label={t(n.key)}
                  checked={settings.narrationMode === n.mode}
                  onChange={() => update({ ...settings, narrationMode: n.mode })}
                />
              }
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="s14-text">
        <h2 id="s14-text" className="fia-group-header">
          {t('s.settings.text-size')}
        </h2>
        <SettingsRow
          label={t('s.settings.text-size')}
          consequence={
            settings.textSize === 'system' ? t('s.settings.text-size-follows') : undefined
          }
          control={
            <div role="group" aria-label={t('s.settings.text-size')} className="fia-stepper">
              {TEXT_STEPS.map((size, i) => (
                <button
                  key={size}
                  type="button"
                  className="fia-stepper__a"
                  aria-pressed={settings.textSize === size}
                  aria-label={`${t('s.settings.text-size')} ${i + 1}`}
                  style={{ fontSize: A_SIZE[i] }}
                  onClick={() => update({ ...settings, textSize: size })}
                >
                  A
                </button>
              ))}
            </div>
          }
        />
        <SettingsRow
          label={t('s.settings.easy-mode')}
          consequence={t('s.settings.easy-mode-note')}
          control={
            <SettingsToggle
              on={settings.lowLiteracy}
              label={t('s.settings.easy-mode')}
              onChange={(v) => update(applyEasyMode(settings, v))}
            />
          }
        />
      </section>

      <section aria-labelledby="s14-theme">
        <h2 id="s14-theme" className="fia-group-header">
          {t('s.settings.theme')}
        </h2>
        <div role="radiogroup" aria-labelledby="s14-theme" className="fia-segmented">
          {THEMES.map((th) => (
            <button
              key={th.theme}
              type="button"
              role="radio"
              aria-checked={settings.theme === th.theme}
              onClick={() => update({ ...settings, theme: th.theme })}
            >
              {t(th.key)}
            </button>
          ))}
        </div>
      </section>

      <section aria-label={t('s.settings.language')}>
        <SettingsRow
          label={t('s.settings.language')}
          control={
            <Link to="/?mode=use" dir="auto">
              {settings.uiLanguage} ▾
            </Link>
          }
        />
        <SettingsRow
          label={t('s.settings.reduce-motion')}
          control={<span className="fia-caption">{t('s.settings.follows-phone')}</span>}
        />
      </section>

      <nav className="fia-links" aria-label={t('s.settings.title')}>
        <Link to="/downloads">{t('s.settings.links.downloads')}</Link>
        <Link to="/feedback">{t('s.settings.links.feedback')}</Link>
        <Link to="/about">{t('s.settings.links.about')}</Link>
      </nav>

      {failed && (
        <ToastNotice kind="toast" tone="error">
          {t('s.settings.save-failed')}
        </ToastNotice>
      )}
    </ScreenFrame>
  );
}
