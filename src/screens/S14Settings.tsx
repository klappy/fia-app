import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { PrimaryButton, SettingsRow, ToastNotice } from '../components';
import { FiaLogo } from '../components/FiaLogo';
import { SettingsToggle } from '../components/SettingsRow';
import {
  AuroraField,
  GlassSegmented,
  GlassSheet,
  GlassSurface,
  Icon,
  type KitIconName,
} from '../components/glass';
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
  type TextSize,
  type Theme,
} from '../settings';

// S14 Settings in glass (F6-S14; nodded mock cookbook design/alpha-v2-screens/14-settings.html, PRD § 4
// row S14, § 8.5): a full-height kit GlassSheet with the FIA logo leading the title, one primary
// ('Done') in the thumb slot, groups as kit GlassSurface wells: Text size · Theme · Voice · Language.
// Kept bones: every change persists to C-10 `fia.settings.v1` after validation (R-706); a failed save
// shows `save-failed` for 4 s and the app continues. Rows whose value has no C-10 field (auto-continue,
// read without voice, this phone's voice) are not rendered: they would not persist (BIDE, PR body).
// RULING 2026-10-01 21:23 ET: no bottom bar; language lives in the header pill only, so the Language
// group is a read-only pointer; Downloads / Feedback / About live in Explore, not here.

/** 100 / 150 / 200 / 310% (PRD § 8.5): the "A" is drawn at the label size that step gives (13 px × k). */
const SIZE_K: Record<TextSize, number> = { system: 1, large: 1.5, max: 2, huge: 3.1 };
const NARRATION: { mode: NarrationMode; key: string; icon: KitIconName[] }[] = [
  { mode: 'source-fallback', key: 's.settings.narration.fallback', icon: ['check', 'sparkle'] },
  { mode: 'source-only', key: 's.settings.narration.source-only', icon: ['check'] },
  { mode: 'generated-only', key: 's.settings.narration.ai-only', icon: ['sparkle'] },
];

// BEGET (kit gap, BUILD-ORDER K1): the kit Icon @6aa9bc3 has no phone glyph. Lucide 'smartphone'
// drawn in the kit Icon's style (24 grid, round stroke, no fill), as the mock does.
function PhoneGlyph({ size = 18, stroke = 1.7 }: { size?: number; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-kit-gap="smartphone"
      style={{ display: 'block', flex: 'none' }}
    >
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <path d="M12 18h.01" />
    </svg>
  );
}
// BEGET (kit gap): the kit's 'sun' (Icon.jsx) is the rays without the disc and reads as a loading
// spinner (mock README § Kit gaps 2; dl-v21-support-08). Lucide 'sun' with its r=4 disc.
function SunGlyph({ size = 18, stroke = 1.7 }: { size?: number; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-kit-gap="sun"
      style={{ display: 'block', flex: 'none' }}
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function autonym(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="s14-group" aria-label={title}>
      <div className="fia-overline" aria-hidden="true">
        {title}
      </div>
      <GlassSurface level={3} blur="soft" radius="xl" shadow="none" className="fia-well s14-card">
        {children}
      </GlassSurface>
    </section>
  );
}

/** Icon + word option label; the selected one turns semibold with a heavier stroke (mock `opt`). */
const opt = (icon: (stroke: number) => ReactNode, word: string, on: boolean) => (
  <span className="s14-opt">
    {icon(on ? 2.2 : 1.7)}
    {word}
  </span>
);

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

  // PRD § 8.5: above 1× the controls stack (vertical lists from Larger, 150%, so no choice runs past its
  // track at 360-390 px); at 200% and above the title also scrolls with the body.
  const big = SIZE_K[settings.textSize] >= 2;
  const stacked = SIZE_K[settings.textSize] >= 1.5;
  const seg = (extra = '') =>
    ['s14-seg', extra, stacked && 'is-vertical'].filter(Boolean).join(' ');
  const lang = autonym(settings.contentLanguage);
  const title = (
    <div className="s14-title">
      <FiaLogo />
      <h1 className="s14-title-word">{t('s.settings.title')}</h1>
    </div>
  );

  return (
    <AuroraField
      className="fia-aurora"
      drift={false}
      style={{ height: '100dvh', overflow: 'clip' }}
    >
      <div className="s14-page" data-screen="S14">
        <GlassSheet
          open
          className="fia-sheet s14-sheet"
          height={big ? '100%' : 'calc(100% - 14px)'}
          title={big ? undefined : title}
          actions={
            <div className="fia-sheet__actions">
              <div className="fia-primary-slot">
                <PrimaryButton
                  label={t('s.settings.primary.done')}
                  onPress={() => navigate(-1)}
                  hint={t('s.common.a11y.primary-hint')}
                />
              </div>
            </div>
          }
        >
          <div className="s14-body">
            {big && <div className="s14-title-scroll">{title}</div>}

            <Group title={t('s.settings.text-size')}>
              <GlassSegmented
                className={seg('s14-sizes')}
                aria-label={t('s.settings.text-size')}
                value={settings.textSize}
                onChange={(v) => update({ ...settings, textSize: v as TextSize })}
                options={TEXT_STEPS.map((s) => ({
                  value: s,
                  label: (
                    <span className="s14-size">
                      <span
                        className="s14-A"
                        aria-hidden="true"
                        style={{ fontSize: `${Math.round(13 * SIZE_K[s])}px` }}
                      >
                        A
                      </span>
                      <span>{t(`s.settings.text-size.${s}`)}</span>
                    </span>
                  ),
                }))}
              />
              <div className="s14-sep" />
              <SettingsRow
                icon={<Icon name="maximize" size={18} />}
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
            </Group>

            <Group title={t('s.settings.theme')}>
              <GlassSegmented
                className={seg()}
                aria-label={t('s.settings.theme')}
                value={settings.theme}
                onChange={(v) => update({ ...settings, theme: v as Theme })}
                options={[
                  {
                    value: 'system',
                    label: opt(
                      (sw) => <PhoneGlyph stroke={sw} />,
                      t('s.settings.theme.auto'),
                      settings.theme === 'system',
                    ),
                  },
                  {
                    value: 'light',
                    label: opt(
                      (sw) => <SunGlyph stroke={sw} />,
                      t('s.settings.theme.light'),
                      settings.theme === 'light',
                    ),
                  },
                  {
                    value: 'dark',
                    label: opt(
                      (sw) => <Icon name="moon" size={18} stroke={sw} />,
                      t('s.settings.theme.dark'),
                      settings.theme === 'dark',
                    ),
                  },
                ]}
              />
            </Group>

            <Group title={t('s.settings.narration')}>
              <GlassSegmented
                className={seg('s14-even')}
                aria-label={t('s.settings.narration')}
                value={settings.narrationMode}
                onChange={(v) => update({ ...settings, narrationMode: v as NarrationMode })}
                options={NARRATION.map((n) => ({
                  value: n.mode,
                  label: opt(
                    (sw) => (
                      <span className="s14-two">
                        {n.icon.map((i) => (
                          <Icon key={i} name={i} size={16} stroke={sw} />
                        ))}
                      </span>
                    ),
                    t(n.key),
                    settings.narrationMode === n.mode,
                  ),
                }))}
              />
              <div className="fia-caption s14-note">{t('s.settings.narration.note')}</div>
            </Group>

            <Group title={t('s.settings.language')}>
              <div className="s14-lang">
                <Icon name="languages" size={18} />
                <div className="s14-lang-text">
                  <div className="s14-lang-word" dir="auto">
                    {lang}
                  </div>
                  <div className="fia-caption s14-note">
                    {t('s.settings.language-note', { language: lang })}
                  </div>
                </div>
              </div>
            </Group>
          </div>
        </GlassSheet>
        {failed && (
          <ToastNotice kind="toast" tone="error" className="s14-toast">
            {t('s.settings.save-failed')}
          </ToastNotice>
        )}
      </div>
    </AuroraField>
  );
}
