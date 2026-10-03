import type { ComponentType, HTMLAttributes, ReactNode } from 'react';
import { DownloadTierPicker, type TierRow } from '../components';
import { GlassButton, GlassSurface, Icon, type KitIconName } from '../components/glass';
import { t } from '../i18n';
import { SyncBadge as KitSyncBadge } from '../vendor/glass/components/scripture/SyncBadge';
import type { SyncBadgeProps } from '../vendor/glass/components/scripture/SyncBadge';
import type { Tier } from './manifest';
import { freeBytes, isQuotaError, mb } from './storage';
import { TIERS } from './manifest';
import { saveMinutes } from './tiers';
import { downlink, type SaveController } from './useSaveRow';
import { useOffline } from './useOffline';
import './SaveRow.css';

// S04 "Save for offline" card in glass (F6-S04; nodded mock design/alpha-v2-screens/04-passage-card.html
// SaveCard, rev4 PoC floor b1–b5). Kit GlassSurface card · overline + kit SyncBadge · the tier picker on
// kit GlassSegmented · what the chosen tier saves · one quiet kit GlassButton action. Kept bones: sizes
// are the bytes a save downloads (pack C-02 manifest), the save is C-07 SAVE (OfflineClient.save), and
// "Saved" appears only from the worker's verified STATUS (R-309). A tier the pack does not publish
// shows "not yet" and cannot be chosen: today every pack publishes Text only (BUILD-ORDER BL3), so the
// card never claims the voice is saved.

// Typing only (as components/glass.ts): the kit .d.ts omit the `...rest` SyncBadge.jsx:3 forwards.
const SyncBadge = KitSyncBadge as unknown as ComponentType<
  SyncBadgeProps & HTMLAttributes<HTMLElement>
>;

export interface SaveRowProps {
  ctl: SaveController;
  /** save-intent: the primary saves, so this card offers the quiet Start instead (spec 04). */
  intent?: boolean;
  onStart?: () => void;
  /** S13 Saved on this phone: the remove confirm and the save's progress live there. */
  onSeeDownloads: () => void;
}

/** The mock's words: Text · Phone · Full (README § Open: v1's Original reads "Full"). */
const WORD: Record<Tier, string> = {
  text: 's.passage.tier.text',
  phone: 's.passage.tier.phone',
  medium: 's.passage.tier.medium',
  original: 's.passage.tier.full',
};
const NOTE: Record<Tier, string> = {
  text: 's.passage.tier.text-note',
  phone: 's.passage.tier.phone-note',
  medium: 's.passage.tier.medium-note',
  original: 's.passage.tier.full-note',
};
const tierWord = (x: Tier) => t(WORD[x]);
/** Cells: the mock's three; Medium only if a pack ever publishes it (none does). */
const shownTiers = (available: readonly Tier[]): Tier[] =>
  TIERS.filter((x) => x !== 'medium' || available.includes('medium'));
const size = (bytes: number) => t('s.passage.tier-size', { mb: mb(bytes) }).replace(' ', ' ');

function Quiet({
  icon,
  children,
  onClick,
  disabled,
  testId,
}: {
  icon: KitIconName;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <GlassButton
      type="button"
      variant="quiet"
      size="md"
      className="fia-savecard__quiet"
      leading={<Icon name={icon} size={18} />}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      data-testid={testId}
    >
      {children}
    </GlassButton>
  );
}

export function SaveRow({ ctl, intent, onStart, onSeeDownloads }: SaveRowProps) {
  const s = useOffline();
  const { rowState, sizeMb } = ctl;
  const free = freeBytes(s.storage);
  const pack = rowState.pack;
  // After a save starts, the cells show the tier being or already saved (read-only); a different
  // tier is Remove, then Save (v1 kept). Only an unsaved passage takes a new choice.
  const held = rowState.state !== 'none';
  const value: Tier = held && pack?.tier ? pack.tier : ctl.tier;
  const rows: TierRow[] = shownTiers(ctl.available).map((x) => {
    const verified = rowState.state === 'saved' && pack?.tier === x ? pack.bytes : undefined;
    const b = verified ?? ctl.bytes[x];
    return {
      tier: x,
      label: tierWord(x),
      size: b !== undefined ? size(b) : t('s.passage.tier-not-yet'),
      note: t(NOTE[x]),
      disabled: !ctl.available.includes(x),
    };
  });
  const bytes = ctl.bytes[ctl.tier] ?? 0;
  const pr = s.progress;

  let badge: ReactNode = null;
  let action: ReactNode = null;
  if (rowState.state === 'saving') {
    badge = (
      <SyncBadge
        className="fia-savecard__badge"
        state="syncing"
        data-testid="saving-line"
        role="status"
        aria-live="polite"
        label={t('s.passage.saving-line', {
          saved: pr?.files ?? 0,
          total: pr?.count ?? '…',
          min: saveMinutes(Math.max(0, (pr?.total || bytes) - (pr?.bytes ?? 0)), downlink()),
        })}
      />
    );
    action = (
      <Quiet icon="list" onClick={onSeeDownloads}>
        {t('s.passage.see-downloads')}
      </Quiet>
    );
  } else if (rowState.state === 'saved' && pack) {
    const withVoice = !!pack.tier && pack.tier !== 'text';
    badge = (
      <SyncBadge
        className="fia-savecard__badge"
        state="ok"
        data-testid="save-badge"
        label={t(withVoice ? 's.passage.saved-badge.voice' : 's.passage.saved-badge.text')}
      />
    );
    action = (
      <div data-testid="saved-row">
        <Quiet icon="x" onClick={onSeeDownloads}>
          {t('s.passage.remove-from-phone')}
        </Quiet>
      </div>
    );
  } else if (rowState.state === 'partial' && pack) {
    badge = (
      <SyncBadge
        className="fia-savecard__badge"
        state="offline"
        data-testid="save-badge"
        label={t('s.common.mark.partial', { saved: pack.savedFiles ?? 0, total: pack.files ?? 0 })}
      />
    );
    action = (
      <Quiet
        icon="download"
        disabled={!s.online || !!s.saving}
        onClick={() => void ctl.save(pack.tier)}
      >
        {t('s.passage.resume-download')}
      </Quiet>
    );
  } else if (rowState.state === 'corrupt') {
    action = (
      <>
        <p className="fia-savecard__line" role="status">
          <Icon name="warning" size={18} />
          <span>{t('s.downloads.evicted')}</span>
        </p>
        <Quiet
          icon="update"
          disabled={!s.online || !!s.saving}
          onClick={() => void ctl.save(pack?.tier)}
        >
          {t('s.downloads.resave')}
        </Quiet>
      </>
    );
  } else if (!s.online) {
    action = (
      <p className="fia-savecard__line" data-testid="save-offline">
        <Icon name="cloudOff" size={18} />
        <span>{t('s.passage.save-row-offline')}</span>
      </p>
    );
  } else if (intent) {
    action = (
      <Quiet icon="play" onClick={onStart}>
        {t('s.passage.secondary-start')}
      </Quiet>
    );
  } else if (sizeMb) {
    action = (
      <Quiet
        icon="download"
        testId="save-button"
        disabled={!ctl.canSave}
        onClick={() => void ctl.save()}
      >
        {t('s.passage.save-row', { tier: tierWord(ctl.tier), mb: sizeMb })}
      </Quiet>
    );
  }

  return (
    <GlassSurface
      as="section"
      level={2}
      blur="strong"
      radius="xl"
      shadow="card"
      className="fia-savecard"
      aria-labelledby="fia-save-heading"
      data-testid="save-row"
      data-save-state={rowState.state}
    >
      <div className="fia-savecard__inner">
        <div className="fia-savecard__top">
          <h2 id="fia-save-heading" className="fia-savecard__heading">
            {t('s.passage.save-heading')}
          </h2>
          {badge}
        </div>
        <DownloadTierPicker
          tiers={rows}
          value={value}
          onChange={ctl.setTier}
          label={t('s.passage.how-much')}
          state={held || s.saving ? 'disabled' : 'default'}
        />
        {!held && ctl.tierFollows && (
          <p className="fia-savecard__caption" role="status">
            {t('s.passage.tier-follows')}
          </p>
        )}
        {!held && s.online && (free !== undefined || bytes > 0) && (
          <p className="fia-savecard__caption" data-testid="storage-estimate">
            {free !== undefined &&
              t('s.passage.free-space', { free: t('s.passage.tier-size', { mb: mb(free) }) })}
            {free !== undefined && ' · '}
            {t('s.passage.tier-time', { min: saveMinutes(bytes, downlink()) })}
          </p>
        )}
        {action && <div className="fia-savecard__action">{action}</div>}
        {ctl.failed && !isQuotaError(ctl.failed) && (
          <div className="fia-savecard__error" role="alert">
            <p className="fia-savecard__line">
              <Icon name="warning" size={18} />
              <span>{t('s.passage.error')}</span>
            </p>
            <Quiet icon="update" onClick={() => void ctl.save(pack?.tier)}>
              {t('s.common.try-again')}
            </Quiet>
          </div>
        )}
      </div>
    </GlassSurface>
  );
}
