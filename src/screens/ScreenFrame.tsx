import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreSheet, PrimaryButton, type UiState } from '../components';
import { FiaLogo } from '../components/FiaLogo';
import { AuroraField, GlassButton, GlassSurface, Icon } from '../components/glass';
import { t } from '../i18n';
import { useOnline } from '../offline/useOnline';
import { browserStore, loadSettings } from '../settings';
import { screenById, type ScreenId } from './registry';

// v2 shell (F4; PRD § 2, § 8.1): kit AuroraField ground · glass header on GlassSurface (FiaLogo ·
// language pill · Explore pill) · content · one primary in the thumb slot. NO bottom bar on any
// screen (RULING 2026-10-01 21:23 ET (a); nodded mocks design/alpha-v2-screens @2792f33): the v1
// dock is gone and Explore (on GlassSheet) is the one fallback. The registry's `dock` flag now
// means "guide/home/browse frame": it carries the language pill and Explore; other frames show the logo only.
export interface ScreenFrameProps {
  id: ScreenId;
  title?: string;
  primaryLabel?: string | null;
  primaryState?: UiState;
  onPrimary?: () => void;
  /** @deprecated v1 dock highlight, ignored. No screen on this branch passes it; the optional field stays
   *  only so branches stacked on F4 (F6-S14/S16/S17) still compile. Drop it once they land. */
  dockActive?: string;
  /** Overrides the browser's connectivity (R-702); default: `!navigator.onLine`, live. */
  offline?: boolean;
  children?: ReactNode;
}

// Header pill geometry from the nodded mock (_frame.js:224-229): 48 px tall, 10 × 16 padding.
const PILL = { minHeight: 48, padding: '10px 16px' };

function autonym(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function ScreenFrame({
  id,
  title,
  primaryLabel,
  primaryState,
  onPrimary,
  offline,
  children,
}: ScreenFrameProps) {
  const def = screenById(id);
  const go = useNavigate();
  const [explore, setExplore] = useState(false);
  const online = useOnline();
  const isOffline = offline ?? !online;
  const heading = title ?? (def.titleKey ? t(def.titleKey) : def.name);
  const label =
    primaryLabel === undefined ? (def.primaryKey ? t(def.primaryKey) : null) : primaryLabel;
  const hub = def.dock;
  // Read once per mount (each route mounts its own frame); useClip re-renders this on every
  // `timeupdate`, which used to re-parse localStorage each time (PR #22 deferred line).
  const [lang] = useState(() => autonym(loadSettings(browserStore()).settings.contentLanguage));
  return (
    <AuroraField
      className="fia-aurora"
      drift={false}
      style={{ height: 'auto', minHeight: '100dvh', overflow: 'clip' }}
    >
      <div className="fia-screen" data-screen={def.id} data-offline={isOffline || undefined}>
        <header className="fia-header-wrap">
          <GlassSurface level={3} blur="strong" radius="pill" shadow="card" className="fia-header">
            <div className="fia-header-grid">
              <FiaLogo />
              {isOffline && (
                // toast-notice.md `chip`: persistent while offline; text, never icon-only.
                <span
                  className="fia-notice fia-notice--offline-chip"
                  role="status"
                  data-role="offline-chip"
                >
                  <span aria-hidden="true">⊘ </span>
                  {t('s.common.offline-chip')}
                </span>
              )}
              {hub && (
                <GlassButton
                  variant="glass"
                  className="fia-pill fia-lang"
                  style={PILL}
                  leading={<Icon name="languages" size={18} />}
                  aria-label={t('s.common.language-pill', { language: lang })}
                  onClick={() => go('/?mode=use')}
                >
                  {lang}
                </GlassButton>
              )}
              {hub && (
                <GlassButton
                  variant="glass"
                  className="fia-pill fia-explore"
                  style={PILL}
                  leading={<Icon name="compass" size={18} />}
                  aria-haspopup="dialog"
                  onClick={() => setExplore(true)}
                >
                  {t('s.common.explore')}
                </GlassButton>
              )}
            </div>
          </GlassSurface>
        </header>
        <h1 className="fia-title fia-screen__title">{heading}</h1>
        <main className="fia-content">{children}</main>
        {label && (
          <div className="fia-primary-slot">
            <PrimaryButton
              label={label}
              state={primaryState}
              onPress={onPrimary}
              hint={t('s.common.a11y.primary-hint')}
            />
          </div>
        )}
        {hub && <MoreSheet open={explore} onClose={() => setExplore(false)} from={def.id} />}
      </div>
    </AuroraField>
  );
}
