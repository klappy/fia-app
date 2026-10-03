import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SecondaryAction, Sheet } from '../components';
import { t } from '../i18n';
import { freeBytes, largestPacks, mb, offline, packRef, useOffline } from '../offline';
import '../offline/offline.css';

// SH-4 Storage warning (R-311, R-703): variants space / persist / quota. Lists the largest saved
// packs with an explicit Remove + confirm; it never deletes anything by itself.
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

  const primary =
    variant === 'persist'
      ? { label: t('s.storage.primary.install'), go: () => nav('/install') }
      : !packs.length
        ? { label: t('s.storage.primary.choose-text'), go: () => nav('/passage?tier=text') }
        : { label: t('s.storage.primary.manage'), go: () => nav('/downloads') };

  return (
    <Sheet
      brand
      title={t(`s.storage.title.${variant}`)}
      primaryLabel={primary.label}
      onClose={close}
      onPrimary={primary.go}
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
        <SecondaryAction label={t('s.storage.continue-anyway')} onPress={close} />
      ) : packs.length ? (
        <>
          <p className="fia-caption">{t('s.storage.largest')}</p>
          {packs.map((p) => {
            const ref = packRef(p.packId ?? '');
            const size = mb(p.bytes);
            return (
              <div key={p.packId} className="fia-dl__row">
                <span>
                  {t('s.storage.pack-line', {
                    ref,
                    tier: t(`s.downloads.tier.${p.tier ?? 'text'}`),
                    size,
                  })}
                </span>
                {confirm === p.packId ? (
                  <div className="fia-dl__band" role="alertdialog">
                    <p>{t('s.storage.remove-confirm', { ref, size })}</p>
                    <SecondaryAction
                      label={t('s.storage.remove-yes')}
                      onPress={() =>
                        void offline.remove(p.packId!).then(() => {
                          setConfirm(null);
                          setFreed(size);
                        })
                      }
                    />
                    <SecondaryAction
                      label={t('s.storage.remove-keep')}
                      onPress={() => setConfirm(null)}
                    />
                  </div>
                ) : (
                  <SecondaryAction
                    label={t('s.storage.remove')}
                    onPress={() => setConfirm(p.packId!)}
                  />
                )}
              </div>
            );
          })}
        </>
      ) : (
        <p>{t('s.storage.empty')}</p>
      )}
      <p className="fia-caption">{t('s.storage.nothing-auto')}</p>
    </Sheet>
  );
}
