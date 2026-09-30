import { useNavigate } from 'react-router-dom';
import { Sheet } from '../components';
import { t } from '../i18n';
import { screenById } from './registry';

// SH-4 — sheet stub hosted on its own route for the smoke; in the app it opens over the caller.
export default function SH4StorageWarning() {
  const nav = useNavigate();
  const def = screenById('SH-4');
  return (
    <Sheet
      title={t(def.titleKey!)}
      primaryLabel={t(def.primaryKey!)}
      onClose={() => nav(-1)}
      onPrimary={() => nav(-1)}
    >
      <p className="fia-caption">{def.name}</p>
    </Sheet>
  );
}
