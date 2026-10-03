import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { QuietAction } from '../components';
import { GlassSurface, Icon, SyncBadge } from '../components/glass';
import { t } from '../i18n';
import {
  detectPlatform,
  freeBytes,
  isQuotaError,
  mb,
  offersUpdate,
  offline,
  packRef,
  useInstall,
  useOffline,
  VersionBanner,
  type PackStatus,
} from '../offline';
import '../offline/offline.css';
import { flowSession } from '../flow/session';
import { ScreenFrame } from './ScreenFrame';

// S13 Downloads / Offline (R-308..R-311, R-702, R-703): every line here comes from the worker's
// STATUS (C-07): "Saved ✓" only after verification, partial as n of m with Resume, update with
// its size delta, Remove only after a confirm naming the consequence. Nothing is swept.
// F6-S13 glass (nodded mock cookbook design/alpha-v2-screens/13-downloads.html; PRD § 4 row S13, § 8.1
// Layer): ScreenFrame layer header with the one labelled way back (`close`), group overlines
// (.fia-overline), pack cards on kit GlassSurface with the kit SyncBadge for "Saved ✓", quiet kit
// GlassButtons with kit Icons for the card actions, and the catalog row on a level-1 GlassSurface.
// v1 strings and behaviour are kept (design/alpha-screens/13-downloads-offline.md is the wireframe).
const tierName = (tier?: string) => t(`s.downloads.tier.${tier ?? 'text'}`);

/** A pack card: kit GlassSurface, as the mock's saved card (13-downloads.html:166). */
function PackCard({
  children,
  tone,
  testId,
}: {
  children: ReactNode;
  tone?: 'partial' | 'error';
  testId?: string;
}) {
  return (
    <GlassSurface
      level={2}
      blur="strong"
      radius="xl"
      shadow="card"
      className="fia-dl__pack"
      data-tone={tone}
      data-testid={testId}
    >
      {children}
    </GlassSurface>
  );
}

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

function SavedCard({
  p,
  offerUpdate,
  onUpdate,
}: {
  p: PackStatus;
  offerUpdate: boolean;
  onUpdate: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const ref = packRef(p.packId ?? '');
  return (
    <PackCard tone={p.corrupt ? 'error' : undefined}>
      <div className="fia-dl__row">
        <span className="fia-dl__title">
          <PackLine p={p} />
        </span>
        {!p.corrupt && (
          <SyncBadge
            className="fia-badge fia-dl__badge"
            state="ok"
            label={t('s.downloads.section-saved')}
          />
        )}
      </div>
      <span className="fia-caption">
        {t('s.downloads.revision', { rev: (p.revision ?? '').slice(0, 7) })}
      </span>
      {p.corrupt && (
        <div className="fia-dl__band" role="status">
          <p>{t('s.downloads.evicted')}</p>
          <QuietAction
            icon="download"
            label={t('s.downloads.resave')}
            onPress={() => void offline.save(p.packId!, p.tier!, p.narration!)}
          />
        </div>
      )}
      {offerUpdate && (
        <QuietAction
          icon="update"
          label={`${t('s.downloads.update-available', { delta: mb(p.updateBytes) })} ⟶`}
          onPress={onUpdate}
        />
      )}
      {confirm ? (
        <div className="fia-dl__confirm" role="alertdialog">
          <p>{t('s.downloads.remove-confirm', { ref, size: mb(p.bytes) })}</p>
          <div className="fia-dl__row">
            <QuietAction
              icon="x"
              label={t('s.downloads.remove-yes')}
              onPress={() => void offline.remove(p.packId!).finally(() => setConfirm(false))}
            />
            <QuietAction
              icon="check"
              label={t('s.downloads.remove-keep')}
              onPress={() => setConfirm(false)}
            />
          </div>
        </div>
      ) : (
        <QuietAction icon="x" label={t('s.downloads.remove')} onPress={() => setConfirm(true)} />
      )}
    </PackCard>
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
  // `Save a passage` / `Save another passage` land on 04 in save-intent (its primary saves) only
  // when the current passage is not saved yet — never on a card without Save (J-A2--P-01 rerun 3,
  // review rev17-1021). Otherwise the picker: the book's list (03), or the library (02).
  let onPrimary = () => {
    const cur = flowSession().get();
    const unsaved = !!cur.packId && !s.packs.some((p) => p.packId === cur.packId);
    nav(unsaved ? '/passage?save=1' : cur.book ? '/pericopes' : '/library');
  };
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
  // One labelled way back (PRD § 8.1 Layer; mock CloseHeader): to the passage it came from
  // (J-A2--P-01, v1 `back-to-passage`), else where the reader came from, else the library.
  const close = {
    label: from ? t('s.downloads.back-to-passage', { ref: packRef(from) }) : t('s.common.back'),
    onPress: () =>
      from || (globalThis.history?.state as { idx?: number } | null)?.idx
        ? nav(-1)
        : nav('/library'),
  };

  return (
    <ScreenFrame
      id="S13"
      offline={!s.online}
      primaryLabel={primaryLabel}
      primaryState={!s.online && !justSaved ? 'disabled' : 'default'}
      onPrimary={onPrimary}
      close={close}
    >
      <VersionBanner />
      {s.storage.supported && (
        <div className="fia-dl__storage" data-testid="storage-line">
          <span className="fia-caption fia-dl__line">
            <Icon name="check" size={14} />
            {t('s.downloads.storage', {
              used: `${mb(s.storage.usage)} MB`,
              free: `${mb(free)} MB`,
            })}
          </span>
          <details className="fia-dl__about">
            <summary>
              {s.storage.persisted ? t('s.downloads.persisted') : t('s.downloads.not-persisted')}
              <Icon name="chevronRight" size={16} />
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
        <GlassSurface level={1} radius="lg" shadow="none" className="fia-dl__band">
          <p>{t('s.downloads.ios-install-note')}</p>
          <QuietAction
            icon="download"
            label={`${t('s.downloads.install-link')} ⟶`}
            onPress={() => nav('/install')}
          />
        </GlassSurface>
      )}
      {!s.online && !justSaved && (
        <p className="fia-caption">{t('s.downloads.needs-connection')}</p>
      )}

      {pr && (
        <section className="fia-dl__section" aria-live="polite">
          <h2 className="fia-overline">{t('s.downloads.section-downloading')}</h2>
          <PackCard>
            <span className="fia-dl__title">{packRef(pr.packId)}</span>
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
            <QuietAction
              icon="pause"
              label={t('s.downloads.pause')}
              onPress={() => offline.cancel()}
            />
          </PackCard>
        </section>
      )}

      {lastFailed && !isQuotaError(lastFailed.error) && lastFailed.error !== 'Save canceled.' && (
        <div className="fia-dl__band fia-dl__band--error" role="alert">
          <p>{t('s.downloads.error-verify')}</p>
          <QuietAction
            icon="update"
            label={t('s.downloads.try-again')}
            onPress={() => void run(lastFailed)}
          />
        </div>
      )}

      {saved.length > 0 && (
        <section className="fia-dl__section">
          <h2 className="fia-overline">{t('s.downloads.section-saved')}</h2>
          {justSaved && <p>{t('s.downloads.status-saved')}</p>}
          {saved.map((p) => (
            <SavedCard
              key={p.packId}
              p={p}
              offerUpdate={offersUpdate(p, s.declined)}
              onUpdate={() =>
                nav(`/sheet/update?variant=content&pack=${encodeURIComponent(p.packId!)}`)
              }
            />
          ))}
        </section>
      )}

      {partial.length > 0 && (
        <section className="fia-dl__section">
          <h2 className="fia-overline">{t('s.downloads.section-partial')}</h2>
          {partial.map((p) => (
            <PackCard key={p.packId} tone="partial">
              <span className="fia-dl__title">
                <PackLine p={p} />
              </span>
              <span className="fia-dl__partial">
                ◐{' '}
                {t('s.downloads.files-verified', {
                  n: p.savedFiles ?? 0,
                  m: p.files ?? 0,
                  mb: mb(p.bytes),
                })}
              </span>
              <QuietAction
                icon="play"
                label={t('s.downloads.resume')}
                disabled={!s.online || !!s.saving}
                onPress={() => void run(p)}
              />
            </PackCard>
          ))}
        </section>
      )}

      {!pr && !saved.length && !partial.length && (
        <p className="fia-dl__empty">{t('s.downloads.empty')}</p>
      )}

      {/* M1 default: the catalog and the text of every language are always on the phone (v1 spec
          § Layout "Catalog row"; mock 13-downloads.html:177, a level-1 glass row). */}
      <GlassSurface
        level={1}
        radius="lg"
        shadow="none"
        className="fia-dl__catalog"
        data-testid="catalog-row"
      >
        <span>{t('s.downloads.catalog-cached')}</span>
      </GlassSurface>
    </ScreenFrame>
  );
}
