import { FiaLogo } from '../components/FiaLogo';
import { GlassButton, GlassSurface, Icon } from '../components/glass';
import { t } from '../i18n';

// Header (mock Header + LangPill + ExploreButton + CloseHeader, cookbook design/alpha-v2-screens/_frame.js:223-250):
// FiaLogo · the offline chip · language pill · Explore on a hub frame, or FiaLogo · one labelled way back
// on a layer frame. Lifted out of ScreenFrame so a screen composes it, never redraws it. The big-text
// grid (_frame.css:89-92) is the follow-up; today's geometry is unchanged.

// Header pill geometry from the nodded mock (_frame.js:224-229): 48 px tall, 10 × 16 padding.
const PILL = { minHeight: 48, padding: '10px 16px' };

/** Language pill (mock LangPill): the content language's autonym; opens the language picker. */
export function LangPill({ lang, onPress }: { lang: string; onPress: () => void }) {
  return (
    <GlassButton
      variant="glass"
      className="fia-pill fia-lang"
      style={PILL}
      leading={<Icon name="languages" size={18} />}
      aria-label={t('s.common.language-pill', { language: lang })}
      onClick={onPress}
    >
      {lang}
    </GlassButton>
  );
}

/** Explore (mock ExploreButton): the one secondary entry; opens the Explore sheet. */
export function ExploreButton({ onPress }: { onPress: () => void }) {
  return (
    <GlassButton
      variant="glass"
      className="fia-pill fia-explore"
      style={PILL}
      leading={<Icon name="compass" size={18} />}
      aria-haspopup="dialog"
      onClick={onPress}
    >
      {t('s.common.explore')}
    </GlassButton>
  );
}

export interface HeaderProps {
  /** Offline: the persistent text chip (toast-notice.md `chip`). */
  offline: boolean;
  /** Hub frame (guide, home, browse): the language pill and Explore. */
  hub?: { lang: string; onLang: () => void; onExplore: () => void };
  /** Layer frame (mock CloseHeader): the one labelled way back. Ignored on a hub frame. */
  close?: { label: string; onPress: () => void };
}

export function Header({ offline, hub, close }: HeaderProps) {
  return (
    <header className="fia-header-wrap">
      <GlassSurface level={3} blur="strong" radius="pill" shadow="card" className="fia-header">
        <div className="fia-header-grid">
          <FiaLogo />
          {offline && (
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
          {close && !hub && (
            <GlassButton
              variant="quiet"
              className="fia-pill fia-close-back"
              style={PILL}
              leading={<Icon name="chevronLeft" size={18} />}
              onClick={close.onPress}
            >
              {close.label}
            </GlassButton>
          )}
          {hub && <LangPill lang={hub.lang} onPress={hub.onLang} />}
          {hub && <ExploreButton onPress={hub.onExplore} />}
        </div>
      </GlassSurface>
    </header>
  );
}
