import { DownloadTierPicker, SecondaryAction, type TierRow } from '../components';
import { t } from '../i18n';
import type { Tier } from './manifest';
import { freeBytes, isQuotaError, mb } from './storage';
import { TIERS } from './manifest';
import { saveMinutes } from './tiers';
import { downlink, type SaveController } from './useSaveRow';
import { useOffline } from './useOffline';

// S04 "Save for offline" row (04-passage-card.md § Layout, States): tier picker with the bytes a
// save downloads (pack C-02 manifest; unpublished tiers shown as not available yet), free space + time estimate, and the one outlined `Save {tier} ({mb} MB)` button wired to
// the C-07 SAVE message (OfflineClient.save). The download starts here and its ring stays here
// (Q04-b recut); "Saved" appears only from the worker's verified STATUS (R-309).

export interface SaveRowProps {
  ctl: SaveController;
  /** save-intent: the primary saves, so this row offers the quiet Start instead (spec 04). */
  intent?: boolean;
  onStart?: () => void;
  onSeeDownloads: () => void;
}

export function SaveRow({ ctl, intent, onStart, onSeeDownloads }: SaveRowProps) {
  const s = useOffline();
  const { rowState, tier, sizeMb } = ctl;
  const free = freeBytes(s.storage);
  const tierName = (x: Tier) => t(`s.passage.tier.${x}`);
  // No s.passage key for an unpublished tier yet: `s.lang.cov.absent` ("not yet") until spec 04 adds one.
  const rows: TierRow[] = TIERS.map((x) => {
    const b = ctl.bytes[x];
    return {
      tier: x,
      label: tierName(x),
      size: b !== undefined ? t('s.passage.tier-size', { mb: mb(b) }) : t('s.lang.cov.absent'),
      help: t(`s.passage.tier.${x}-help`),
      recommended:
        x === 'phone' && ctl.available.includes(x) ? t('s.passage.tier-recommended') : undefined,
      disabled: !ctl.available.includes(x),
    };
  });
  const bytes = ctl.bytes[tier] ?? 0;
  const pr = s.progress;

  let action;
  if (rowState.state === 'saving') {
    action = (
      <div className="fia-save__saving" role="status" aria-live="polite">
        <span className="fia-save__ring" aria-hidden />
        <span data-testid="saving-line">
          {t('s.passage.saving-line', {
            saved: pr?.files ?? 0,
            total: pr?.count ?? '…',
            min: saveMinutes(Math.max(0, (pr?.total || bytes) - (pr?.bytes ?? 0)), downlink()),
          })}
        </span>
        <SecondaryAction label={`${t('s.passage.see-downloads')} ⟶`} onPress={onSeeDownloads} />
      </div>
    );
  } else if (rowState.state === 'saved' && rowState.pack) {
    const p = rowState.pack;
    action = (
      <div className="fia-save__saved" data-testid="saved-row">
        <span>
          ✓{' '}
          {t('s.passage.saved-row', {
            tier: tierName(p.tier ?? 'text'),
            mb: mb(p.bytes),
          })}
        </span>
        <SecondaryAction label={t('s.passage.remove')} onPress={onSeeDownloads} />
      </div>
    );
  } else if (!s.online) {
    action = <p className="fia-caption">{t('s.passage.save-row-offline')}</p>;
  } else if (rowState.state === 'partial' && rowState.pack) {
    const p = rowState.pack;
    action = (
      <div className="fia-save__saved">
        <span>
          ◐ {t('s.common.mark.partial', { saved: p.savedFiles ?? 0, total: p.files ?? 0 })}
        </span>
        <SecondaryAction
          label={t('s.passage.resume-download')}
          state={s.online && !s.saving ? 'default' : 'disabled'}
          onPress={() => void ctl.save(p.tier)}
        />
      </div>
    );
  } else if (rowState.state === 'corrupt') {
    const p = rowState.pack;
    action = (
      <div className="fia-save__saved" role="status">
        <span>⚠ {t('s.downloads.evicted')}</span>
        <SecondaryAction
          label={t('s.downloads.resave')}
          state={s.online && !s.saving ? 'default' : 'disabled'}
          onPress={() => void ctl.save(p?.tier)}
        />
      </div>
    );
  } else if (intent) {
    action = <SecondaryAction label={`▶ ${t('s.passage.secondary-start')}`} onPress={onStart} />;
  } else if (sizeMb) {
    action = (
      <button
        type="button"
        className="fia-save__button"
        data-testid="save-button"
        disabled={!ctl.canSave}
        onClick={() => void ctl.save()}
      >
        ⤓ {t('s.passage.save-row', { tier: tierName(tier), mb: sizeMb })}
      </button>
    );
  }

  // A partial save resumes at the tier it started at: no picker until it completes or is removed.
  const showPicker = rowState.state === 'none';
  return (
    <section className="fia-save" aria-labelledby="fia-save-heading" data-testid="save-row">
      <h2 id="fia-save-heading" className="fia-save__heading">
        {t('s.passage.save-heading')}
      </h2>
      {showPicker && (
        <DownloadTierPicker
          tiers={rows}
          value={tier}
          onChange={ctl.setTier}
          label={t('s.passage.save-heading')}
          state={s.saving ? 'disabled' : 'default'}
        />
      )}
      {showPicker && ctl.tierFollows && (
        <p className="fia-caption">{t('s.passage.tier-follows')}</p>
      )}
      {showPicker && (
        <p className="fia-caption" data-testid="storage-estimate">
          {free !== undefined &&
            t('s.passage.free-space', { free: t('s.passage.tier-size', { mb: mb(free) }) })}
          {free !== undefined && s.online && ' · '}
          {s.online && t('s.passage.tier-time', { min: saveMinutes(bytes, downlink()) })}
        </p>
      )}
      {action}
      {ctl.failed && !isQuotaError(ctl.failed) && (
        <div className="fia-dl__band fia-dl__band--error" role="alert">
          {t('s.passage.error')}{' '}
          <SecondaryAction
            label={t('s.common.try-again')}
            onPress={() => void ctl.save(rowState.pack?.tier)}
          />
        </div>
      )}
    </section>
  );
}
