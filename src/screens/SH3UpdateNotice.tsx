import { useLocation, useNavigate } from 'react-router-dom';
import { SecondaryAction, Sheet } from '../components';
import { t } from '../i18n';
import { mb, offline, packRef, useOffline } from '../offline';
import '../offline/offline.css';

// SH-3 Update notice. Two variants on one frame:
// - content (R-310): size delta, Update / Keep; old files are removed by the worker only after
//   the new pack verifies; Keep is remembered per revision and the saved copy keeps working.
// - app (R-704): a waiting app version; Reload / Later; never applied without the tap.
export default function SH3UpdateNotice() {
  const nav = useNavigate();
  const q = new URLSearchParams(useLocation().search);
  const s = useOffline();
  const close = () => nav(-1);
  const packId = q.get('pack');
  const variant = q.get('variant') ?? (packId ? 'content' : 'app');

  if (variant === 'app') {
    return (
      <Sheet
        title={t('s.update.title.app')}
        primaryLabel={t('s.update.primary.reload')}
        onClose={close}
        onPrimary={() => offline.applyUpdate()}
      >
        <p>{t('s.update.app-body')}</p>
        <SecondaryAction label={t('s.update.later')} onPress={close} />
      </Sheet>
    );
  }

  const p = s.packs.find((x) => x.packId === packId);
  const delta = mb(p?.updateBytes);
  const keep = () => {
    if (p?.packId && p.liveRevision) offline.decline(p.packId, p.liveRevision);
    close();
  };
  const update = async () => {
    if (!p?.packId) return close();
    nav('/downloads', { replace: true });
    await offline.save(p.packId, p.tier ?? 'text', p.narration ?? 'source-fallback');
  };
  return (
    <Sheet
      title={t('s.update.title.content')}
      primaryLabel={
        s.online
          ? t('s.update.primary.update', { delta })
          : t('s.update.primary.update-offline', { delta })
      }
      onClose={keep}
      onPrimary={s.online ? () => void update() : undefined}
      state={s.online ? 'default' : 'offline'}
    >
      {p ? (
        <>
          <p>
            {t('s.update.pack', {
              ref: packRef(p.packId ?? ''),
              language: (p.packId ?? '').split('.')[0],
            })}
          </p>
          <p className="fia-caption">
            {t('s.update.revision', {
              old: (p.revision ?? '').slice(0, 7),
              new: (p.liveRevision ?? '').slice(0, 7),
            })}
          </p>
          <p>
            {t('s.update.download', { delta, tier: t(`s.downloads.tier.${p.tier ?? 'text'}`) })}
          </p>
        </>
      ) : null}
      <p className="fia-caption">{t('s.update.keeps-working')}</p>
      <SecondaryAction label={t('s.update.keep')} onPress={keep} />
    </Sheet>
  );
}
