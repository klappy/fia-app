import { useState, type ReactNode } from 'react';
import { Dock, MoreSheet, PrimaryButton, type DockCell, type UiState } from '../components';
import { t } from '../i18n';
import { screenById, type ScreenId } from './registry';

// Layout constants (design/alpha-screens/README.md): header · content (scrolls) · primary slot
// (rule 1, thumb zone, h 56 / 72 at +2, sticky above the dock with safe-area inset) · dock (rule 4).
export interface ScreenFrameProps {
  id: ScreenId;
  title?: string;
  primaryLabel?: string | null;
  primaryState?: UiState;
  onPrimary?: () => void;
  dockActive?: DockCell;
  offline?: boolean;
  children?: ReactNode;
}

export function ScreenFrame({
  id,
  title,
  primaryLabel,
  primaryState,
  onPrimary,
  dockActive,
  offline,
  children,
}: ScreenFrameProps) {
  const def = screenById(id);
  const [more, setMore] = useState(false);
  const heading = title ?? (def.titleKey ? t(def.titleKey) : def.name);
  const label =
    primaryLabel === undefined ? (def.primaryKey ? t(def.primaryKey) : null) : primaryLabel;
  return (
    <div className="fia-screen" data-screen={def.id} data-dock={def.dock || undefined}>
      <header className="fia-header">
        <h1 className="fia-title">{heading}</h1>
      </header>
      {offline && (
        <span className="fia-notice fia-notice--offline-chip">{t('s.common.offline-chip')}</span>
      )}
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
      {def.dock && <Dock active={dockActive} onMore={() => setMore(true)} />}
      {def.dock && <MoreSheet open={more} onClose={() => setMore(false)} />}
    </div>
  );
}
