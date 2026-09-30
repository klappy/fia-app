import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, SecondaryAction } from '../components';
import { t } from '../i18n';
import {
  detectPlatform,
  freeBytes,
  isQuotaError,
  mb,
  offline,
  packRef,
  useInstall,
  useOffline,
  VersionBanner,
  type PackStatus,
} from '../offline';
import '../offline/offline.css';
import { ScreenFrame } from './ScreenFrame';

// S13 Downloads / Offline (R-308..R-311, R-702, R-703): every line here comes from the worker's
// STATUS (C-07): "Saved ✓" only after verification, partial as n of m with Resume, update with
// its size delta, Remove only after a confirm naming the consequence. Nothing is swept.
const tierName = (tier?: string) => t(`s.downloads.tier.${tier ?? 'text'}`);

function PackLine({ p }: { p: PackStatus }) {
  return (
    <span>
      {t('s.downloads.pack-line', {
        ref: packRef(p.packId ?? ''),
        tier: tierName(p.tier),
        size: mb(p.bytes),
      })}
    </span>
  );
}

function SavedCard({ p, onUpdate }: { p: PackStatus; onUpdate: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const ref = packRef(p.packId ?? '');
  return (
    <Card className="fia-dl__pack" state={p.corrupt ? 'error' : 'default'}>
      <div className="fia-dl__row">
        <PackLine p={p} />
        {!p.corrupt && <span aria-label={t('s.downloads.section-saved')}>✓</span>}
      </div>
      <span className="fia-caption">
        {t('s.downloads.revision', { rev: (p.revision ?? '').slice(0, 7) })}
      </span>
      {p.corrupt && (
        <div className="fia-dl__band" role="status">
          {t('s.downloads.evicted')}{' '}
          <SecondaryAction
            label={t('s.downloads.resave')}
            onPress={() => void offline.save(p.packId!, p.tier!, p.narration!)}
          />
        </div>
      )}
      {p.updateAvailable && (
        <SecondaryAction
          label={`${t('s.downloads.update-available', { delta: mb(p.updateBytes) })} ⟶`}
          onPress={onUpdate}
        />
      )}
      {confirm ? (
        <div className="fia-dl__band" role="alertdialog">
          <p>{t('s.downloads.remove-confirm', { ref, size: mb(p.bytes) })}</p>
          <div className="fia-dl__row">
            <SecondaryAction
              label={t('s.downloads.remove-yes')}
              onPress={() => void offline.remove(p.packId!).finally(() => setConfirm(false))}
            />
            <SecondaryAction
              label={t('s.downloads.remove-keep')}
              onPress={() => setConfirm(false)}
            />
          </div>
        </div>
      ) : (
        <SecondaryAction label={t('s.downloads.remove')} onPress={() => setConfirm(true)} />
      )}
    </Card>
  );
}

export default function S13DownloadsOffline() {
  const s = useOffline();
  const install = useInstall();
  const nav = useNavigate();
  const loc = useLocation();
  const from = new URLSearchParams(loc.search).get('from');
  const [justSaved, setJustSaved] = useState<string | null>(null);
  const [lastFailed, setLastFailed] = useState<PackStatus | null>(null);
  const started = useRef<number>(0);

  useEffect(() => {
    if (s.saving && !started.current) started.current = Date.now();
    if (!s.saving) started.current = 0;
  }, [s.saving]);

  const saved = s.packs.filter((p) => ['saved', 'update-available', 'corrupt'].includes(p.state));
  const partial = s.packs.filter((p) => p.state === 'partial' && p.packId !== s.saving);
  const ios = typeof navigator !== 'undefined' && detectPlatform(navigator) === 'ios';
  const free = freeBytes(s.storage);

  const run = async (p: Pick<PackStatus, 'packId' | 'tier' | 'narration'>) => {
    const done = await offline.save(p.packId!, p.tier ?? 'text', p.narration ?? 'source-fallback');
    if (!done) return;
    if (done.error) {
      setLastFailed(done);
      if (isQuotaError(done.error)) nav('/sheet/storage?variant=quota');
    } else {
      setLastFailed(null);
      setJustSaved(p.packId!);
    }
  };

  // Primary (rule 1): one next action.
  let primaryLabel = saved.length
    ? t('s.downloads.primary.save-another')
    : t('s.downloads.primary.save-passage');
  let onPrimary = () => nav('/passage');
  if (justSaved) {
    primaryLabel = t('s.downloads.primary.start-saved', { ref: packRef(justSaved) });
    onPrimary = () => nav('/guide');
  } else if (ios && !install.standalone && saved.some((p) => p.corrupt)) {
    const p = saved.find((x) => x.corrupt)!;
    primaryLabel = t('s.downloads.primary.resave', { ref: packRef(p.packId!), size: mb(p.bytes) });
    onPrimary = () => void run(p);
  }

  const pr = s.progress;
  const rate =
    pr && started.current ? pr.bytes / Math.max(1, (Date.now() - started.current) / 1000) : 0;
  const minLeft = pr && rate ? Math.max(1, Math.ceil((pr.total - pr.bytes) / rate / 60)) : 1;

  return (
    <ScreenFrame
      id="S13"
      dockActive="more"
      offline={!s.online}
      primaryLabel={primaryLabel}
      primaryState={!s.online && !justSaved ? 'disabled' : 'default'}
      onPrimary={onPrimary}
    >
      <VersionBanner />
      {s.storage.supported && (
        <div className="fia-dl__storage" data-testid="storage-line">
          <span>
            {t('s.downloads.storage', {
              used: `${mb(s.storage.usage)} MB`,
              free: `${mb(free)} MB`,
            })}
          </span>
          <details>
            <summary>
              {s.storage.persisted ? t('s.downloads.persisted') : t('s.downloads.not-persisted')}
            </summary>
            {!s.storage.persisted && (
              <span className="fia-caption">{t('s.downloads.persist-info')}</span>
            )}
            {pr && (
              <span className="fia-caption">
                {t('s.downloads.files-verified', {
                  n: pr.files,
                  m: pr.count ?? '?',
                  mb: mb(pr.bytes),
                })}
              </span>
            )}
          </details>
        </div>
      )}
      {ios && !install.standalone && (
        <Card className="fia-dl__band">
          <p>{t('s.downloads.ios-install-note')}</p>
          <SecondaryAction
            label={`${t('s.downloads.install-link')} ⟶`}
            onPress={() => nav('/install')}
          />
        </Card>
      )}
      {from && (
        <SecondaryAction
          label={`⟵ ${t('s.downloads.back-to-passage', { ref: packRef(from) })}`}
          onPress={() => nav(-1)}
        />
      )}
      {!s.online && !justSaved && (
        <p className="fia-caption">{t('s.downloads.needs-connection')}</p>
      )}

      {pr && (
        <section className="fia-dl__section" aria-live="polite">
          <h2 className="fia-dl__section-head">{t('s.downloads.section-downloading')}</h2>
          <Card className="fia-dl__pack">
            <span>{packRef(pr.packId)}</span>
            <span className="fia-caption" data-testid="status-words">
              {!s.online
                ? t('s.downloads.paused-waiting')
                : pr.total && pr.bytes >= pr.total
                  ? t('s.downloads.status-checking')
                  : t('s.downloads.status-saving', { min: minLeft })}
            </span>
            {s.online && pr.total > 0 && (
              <span className="fia-caption">{t('s.downloads.remaining', { min: minLeft })}</span>
            )}
            <div
              className="fia-dl__bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pr.total ? Math.round((pr.bytes / pr.total) * 100) : 0}
            >
              <span style={{ inlineSize: `${pr.total ? (pr.bytes / pr.total) * 100 : 0}%` }} />
            </div>
            <SecondaryAction label={t('s.downloads.pause')} onPress={() => offline.cancel()} />
          </Card>
        </section>
      )}

      {lastFailed && !isQuotaError(lastFailed.error) && lastFailed.error !== 'Save canceled.' && (
        <div className="fia-dl__band fia-dl__band--error" role="alert">
          {t('s.downloads.error-verify')}{' '}
          <SecondaryAction
            label={t('s.downloads.try-again')}
            onPress={() => void run(lastFailed)}
          />
        </div>
      )}

      {saved.length > 0 && (
        <section className="fia-dl__section">
          <h2 className="fia-dl__section-head">{t('s.downloads.section-saved')}</h2>
          {justSaved && <p>{t('s.downloads.status-saved')}</p>}
          {saved.map((p) => (
            <SavedCard
              key={p.packId}
              p={p}
              onUpdate={() =>
                nav(`/sheet/update?variant=content&pack=${encodeURIComponent(p.packId!)}`)
              }
            />
          ))}
        </section>
      )}

      {partial.length > 0 && (
        <section className="fia-dl__section">
          <h2 className="fia-dl__section-head">{t('s.downloads.section-partial')}</h2>
          {partial.map((p) => (
            <Card key={p.packId} className="fia-dl__pack fia-dl__band">
              <PackLine p={p} />
              <span>
                ◐{' '}
                {t('s.downloads.files-verified', {
                  n: p.savedFiles ?? 0,
                  m: p.files ?? 0,
                  mb: mb(p.bytes),
                })}
              </span>
              <SecondaryAction
                label={t('s.downloads.resume')}
                state={s.online && !s.saving ? 'default' : 'disabled'}
                onPress={() => void run(p)}
              />
            </Card>
          ))}
        </section>
      )}

      {!pr && !saved.length && !partial.length && (
        <p className="fia-dl__empty">{t('s.downloads.empty')}</p>
      )}
    </ScreenFrame>
  );
}
