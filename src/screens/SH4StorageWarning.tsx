import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { QuietAction, Sheet } from '../components';
import { GlassSurface, type KitIconName } from '../components/glass';
import { KitPrimary } from '../components/PrimaryButton';
import { t } from '../i18n';
import { freeBytes, largestPacks, mb, offline, packRef, useOffline } from '../offline';
import '../offline/offline.css';

// SH-4 Storage warning (R-311, R-703): variants space / persist / quota. Lists the largest saved
// packs with an explicit Remove + confirm; it never deletes anything by itself.
// F6-S23 glass (nodded mock cookbook design/alpha-v2-screens/23-sheet-storage-warning.html; v1 spec
// design/alpha-screens/23-sheet-storage-warning.md as the wireframe): the shared Sheet (kit GlassSheet,
// FIA lockup before the title), the largest packs as rows on one level-1 GlassSurface well, each with
// a QuietAction Remove that asks first, and the dark KitPrimary with a glyph. v1 strings unchanged.
type Variant = 'space' | 'persist' | 'quota';

export default function SH4StorageWarning() {
  const nav = useNavigate();
  const q = new URLSearchParams(useLocation().search);
  const variant = (
    ['space', 'persist', 'quota'].includes(q.get('variant') ?? '') ? q.get('variant') : 'space'
  ) as Variant;
  const needed = Number(q.get('needed') ?? 0);
  const s = useOffline();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [freed, setFreed] = useState<string | null>(null);
  const packs = largestPacks(s.packs);
  const close = () => nav(-1);

  const primary: { label: string; icon: KitIconName; go: () => void } =
    variant === 'persist'
      ? { label: t('s.storage.primary.install'), icon: 'download', go: () => nav('/install') }
      : !packs.length
        ? {
            label: t('s.storage.primary.choose-text'),
            icon: 'book',
            go: () => nav('/passage?tier=text'),
          }
        : { label: t('s.storage.primary.manage'), icon: 'book', go: () => nav('/downloads') };

  return (
    <Sheet
      brand
      title={t(`s.storage.title.${variant}`)}
      titleIcon={<span aria-hidden="true">⚠ </span>}
      onClose={close}
      className="fia-sheet--storage"
      actions={<KitPrimary label={primary.label} icon={primary.icon} onPress={primary.go} />}
    >
      <p>
        {t(`s.storage.body.${variant}`, {
          needed: mb(needed),
          free: mb(freeBytes(s.storage)),
        })}
      </p>
      {freed && (
        <p role="status" className="fia-caption">
          {t('s.storage.freed', { size: freed })}
        </p>
      )}
      {variant === 'persist' ? (
        <QuietAction icon="x" label={t('s.storage.continue-anyway')} onPress={close} />
      ) : packs.length ? (
        <>
          <h3 className="fia-overline">{t('s.storage.largest')}</h3>
          <GlassSurface
            level={1}
            radius="lg"
            shadow="none"
            className="fia-dl__facts"
            data-testid="largest-packs"
          >
            {packs.map((p) => {
              const ref = packRef(p.packId ?? '');
              const size = mb(p.bytes);
              return (
                <div key={p.packId} className="fia-dl__row">
                  <span className="fia-dl__title">
                    {t('s.storage.pack-line', {
                      ref,
                      tier: t(`s.downloads.tier.${p.tier ?? 'text'}`),
                      size,
                    })}
                  </span>
                  {confirm === p.packId ? (
                    <div className="fia-dl__confirm" role="alertdialog">
                      <p>{t('s.storage.remove-confirm', { ref, size })}</p>
                      <div className="fia-dl__row">
                        <QuietAction
                          icon="delete"
                          label={t('s.storage.remove-yes')}
                          onPress={() =>
                            void offline.remove(p.packId!).then(() => {
                              setConfirm(null);
                              setFreed(size);
                            })
                          }
                        />
                        <QuietAction
                          icon="check"
                          label={t('s.storage.remove-keep')}
                          onPress={() => setConfirm(null)}
                        />
                      </div>
                    </div>
                  ) : (
                    <QuietAction
                      icon="delete"
                      label={t('s.storage.remove')}
                      onPress={() => setConfirm(p.packId!)}
                    />
                  )}
                </div>
              );
            })}
          </GlassSurface>
        </>
      ) : (
        <p>{t('s.storage.empty')}</p>
      )}
      <p className="fia-caption fia-dl__reassure">{t('s.storage.nothing-auto')}</p>
    </Sheet>
  );
}
