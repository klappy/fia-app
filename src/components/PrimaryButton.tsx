import type { ReactNode } from 'react';
import { CountdownRing, DotRing, GlassButton, Icon, type KitIconName } from './glass';
import { stateAttrs, type StateProps } from './types';
import './actions.css';

// primary-button.md — the one action at the thumb slot. Position and width never change;
// only fill, icon and label change between states. One per screen (`data-role="primary"`).
export interface PrimaryButtonProps extends StateProps {
  label: string;
  icon?: ReactNode;
  onPress?: () => void;
  /** `s.common.a11y.primary-hint` */
  hint?: string;
  /** auto-continue countdown ring, 0..1 */
  countdown?: number;
}

export function PrimaryButton({
  label,
  icon,
  onPress,
  hint,
  state = 'default',
  className,
}: PrimaryButtonProps) {
  return (
    <button
      type="button"
      className={['fia-primary', className].filter(Boolean).join(' ')}
      {...stateAttrs(state, 'primary')}
      onClick={state === 'disabled' || state === 'loading' ? undefined : onPress}
      aria-describedby={hint ? 'fia-primary-hint' : undefined}
    >
      <span className="fia-primary__icon" aria-hidden>
        {icon ?? '▶'}
      </span>
      <span className="fia-primary__label">{label}</span>
      {hint && (
        <span id="fia-primary-hint" hidden>
          {hint}
        </span>
      )}
    </button>
  );
}

// ── v2 primaries (PRD § 3 primary-button, § 8.2; nodded mocks design/alpha-v2-screens) ─────────────

/** What a tap on the guide primary does: its glyph (play · pause · next · check). */
export type GuideGlyph = 'play' | 'pause' | 'next' | 'check';

export interface GuidePrimaryProps {
  glyph: GuideGlyph;
  /** the verb, inside the same `<button>` ("Play part 4", "Next part in 2 s") */
  label: string;
  /** second line ("tap to wait"); the line is always laid out so the disc never moves */
  sub?: string;
  /** accessible name when it says more than the label (the countdown) */
  ariaLabel?: string;
  /** the arc: elapsed playback (controlled 0..1) or a countdown draining over `seconds` */
  arc?: { value: number; seconds?: number };
  /** above 1× text: disc leading, label beside it (the sticky thumb zone stays small) */
  row?: boolean;
  state?: StateProps['state'];
  onPress?: () => void;
}

const GLYPH: Record<GuideGlyph, KitIconName> = {
  play: 'play',
  pause: 'pause',
  next: 'chevronRight',
  check: 'check',
};

/**
 * GuidePrimary (PRD § 8.2): one `<button>` holding kit glass/DotRing, a 72 px disc in the dark
 * tokens (the only --surface-inverse fill on the screen), the kit progress/CountdownRing arc and a
 * verb label. Same slot and shape in every state; the app owns the states and the labels.
 */
export function GuidePrimary({
  glyph,
  label,
  sub,
  ariaLabel,
  arc,
  row,
  state = 'default',
  onPress,
}: GuidePrimaryProps) {
  const ring = (
    <DotRing
      size={row ? 100 : 120}
      rings={5}
      dots={24}
      color="var(--fia-dotring)"
      aria-hidden
      className="fia-gp-ring"
    >
      <CountdownRing
        size={96}
        thickness={3}
        value={arc?.value ?? 0}
        duration={arc?.seconds}
        running={arc?.seconds != null}
        className="fia-gp-arc"
        data-arc={arc ? (arc.seconds != null ? 'countdown' : 'elapsed') : 'none'}
      >
        <span className="fia-gp-disc" data-glyph={glyph}>
          <Icon name={GLYPH[glyph]} size={glyph === 'next' ? 34 : 30} stroke={2.4} />
        </span>
      </CountdownRing>
    </DotRing>
  );
  return (
    <button
      type="button"
      className={['fia-gp', row && 'is-row'].filter(Boolean).join(' ')}
      data-fia-primary=""
      {...stateAttrs(state, 'primary')}
      aria-label={ariaLabel ?? label}
      onClick={onPress}
    >
      {ring}
      {row ? (
        <span className="fia-gp-text">
          <span className="fia-gp-label">{label}</span>
          {sub && <span className="fia-gp-sub">{sub}</span>}
        </span>
      ) : (
        <>
          <span className="fia-gp-label">{label}</span>
          <span className="fia-gp-sub" aria-hidden={!sub}>
            {sub ?? '\u00a0'}
          </span>
        </>
      )}
    </button>
  );
}

export interface KitPrimaryProps {
  label: string;
  /** leading kit glyph (icon + label, PRD § 5 rule 7) */
  icon?: KitIconName;
  onPress?: () => void;
  /** Shown but not actionable (offline: "Update (3 MB) — needs connection", 22 spec States). */
  disabled?: boolean;
}

/** The primary everywhere else (PRD § 8.2): kit GlassButton dark, full, lg, at least 56 px. */
export function KitPrimary({ label, icon, onPress, disabled }: KitPrimaryProps) {
  return (
    <GlassButton
      variant="dark"
      size="lg"
      full
      className="fia-btn fia-kit-primary"
      data-role="primary"
      data-fia-primary=""
      leading={icon ? <Icon name={icon} size={18} /> : undefined}
      disabled={disabled}
      data-state={disabled ? 'disabled' : undefined}
      onClick={disabled ? undefined : onPress}
    >
      {label}
    </GlassButton>
  );
}
