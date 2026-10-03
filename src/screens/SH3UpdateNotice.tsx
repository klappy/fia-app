import { useLocation, useNavigate } from 'react-router-dom';
import { QuietAction, Sheet } from '../components';
import { GlassSurface } from '../components/glass';
import { KitPrimary } from '../components/PrimaryButton';
import { t } from '../i18n';
import { mb, offline, packRef, useOffline } from '../offline';
import '../offline/offline.css';

// SH-3 Update notice. Two variants on one frame:
// - content (R-310): size delta, Update / Keep; old files are removed by the worker only after
//   the new pack verifies; Keep is remembered per revision and the saved copy keeps working.
// - app (R-704): a waiting app version; Reload / Later; never applied without the tap.
// F6-S22 glass (nodded mock cookbook design/alpha-v2-screens/22-sheet-update-notice.html; v1 spec
// design/alpha-screens/22-sheet-update-notice.md as the wireframe): the shared Sheet (kit GlassSheet,
// FIA lockup before the title), the pack line under the title (kit description), the facts on one
// level-1 GlassSurface well, `Keep` / `Later` as a QuietAction, and the dark KitPrimary with the
// download glyph (disabled offline, `update-offline`). v1 strings and behaviour unchanged.
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
        brand
        title={t('s.update.title.app')}
        onClose={close}
        actions={
          <KitPrimary
            label={t('s.update.primary.reload')}
            icon="update"
            onPress={() => offline.applyUpdate()}
          />
        }
      >
        <p>{t('s.update.app-body')}</p>
        <QuietAction icon="x" label={t('s.update.later')} onPress={close} />
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
      brand
      title={t('s.update.title.content')}
      description={
        p
          ? t('s.update.pack', {
              ref: packRef(p.packId ?? ''),
              language: (p.packId ?? '').split('.')[0],
            })
          : undefined
      }
      onClose={keep}
      state={s.online ? 'default' : 'offline'}
      actions={
        <KitPrimary
          label={
            s.online
              ? t('s.update.primary.update', { delta })
              : t('s.update.primary.update-offline', { delta })
          }
          icon="download"
          disabled={!s.online}
          onPress={() => void update()}
        />
      }
    >
      {p ? (
        <GlassSurface
          level={1}
          radius="lg"
          shadow="none"
          className="fia-dl__facts"
          data-testid="update-facts"
        >
          <p className="fia-caption">
            {t('s.update.revision', {
              old: (p.revision ?? '').slice(0, 7),
              new: (p.liveRevision ?? '').slice(0, 7),
            })}
          </p>
          <p>
            {t('s.update.download', { delta, tier: t(`s.downloads.tier.${p.tier ?? 'text'}`) })}
          </p>
        </GlassSurface>
      ) : null}
      <p className="fia-caption fia-dl__reassure">{t('s.update.keeps-working')}</p>
      <QuietAction icon="check" label={t('s.update.keep')} onPress={keep} />
    </Sheet>
  );
}
