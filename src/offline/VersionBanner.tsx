import { t } from '../i18n';
import { offline } from './client';
import { useOffline } from './useOffline';

// R-704 quiet version banner (`s.common.version-banner`): a new app version waits for one tap.
// Hosts on 05 / 06 / 08 pass `hold` while a clip plays so nothing appears mid-clip; it shows at
// unit end and stays until reloaded. Never applies the update by itself.
export function VersionBanner({ hold = false }: { hold?: boolean }) {
  const { updateReady } = useOffline();
  if (!updateReady || hold) return null;
  return (
    <button
      type="button"
      className="fia-notice fia-notice--version"
      data-testid="version-banner"
      onClick={() => offline.applyUpdate()}
    >
      ⟳ {t('s.common.version-banner')}
    </button>
  );
}
