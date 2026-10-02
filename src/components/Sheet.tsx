import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { t } from '../i18n';
import { FiaLogo } from './FiaLogo';
import { GlassButton, GlassSheet, Icon } from './glass';
import { PrimaryButton } from './PrimaryButton';
import { stateAttrs, type StateProps } from './types';

// sheet.md on the kit's GlassSheet (PRD § 3 #4): the five named sheets (20–24) and the Explore sheet.
// One primary in the kit's `actions` row. BEGET (kit gap, PRD § 3 #3 and § 8.1): GlassSheet @6aa9bc3
// has no scrim tap, Escape, focus trap or scroll body, and does not forward props to its dialog node,
// so this app wrapper adds them and names the kit's dialog (aria-modal, label, class) after mount.
export interface SheetProps extends StateProps {
  title: string;
  open?: boolean;
  onClose?: () => void;
  primaryLabel?: string;
  onPrimary?: () => void;
  /** Replaces the primary in the actions row (Explore: "Back to …"). */
  actions?: ReactNode;
  /** A short line under the title (kit `description`). */
  description?: string;
  /** Show the corner close (×); off when the actions row is the one way out (Explore). */
  closeButton?: boolean;
  /** Full-height sheet (Explore, settings pages): the body scrolls and the actions row sits at the
   *  sheet bottom, in the thumb slot (25-explore mock). */
  tall?: boolean;
  /** Lead the title row with the FIA logo (RULING 2026-10-01 (f); mock _frame.js:397 `fia-sheet-brand`). */
  brand?: boolean;
  children?: ReactNode;
}

export function Sheet({
  title,
  open = true,
  onClose,
  primaryLabel,
  onPrimary,
  actions,
  description,
  tall,
  brand,
  closeButton = true,
  children,
  state = 'default',
  className,
}: SheetProps) {
  const host = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const dialog = host.current?.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', title);
    dialog.className = ['fia-sheet', tall && 'fia-sheet--tall', className]
      .filter(Boolean)
      .join(' ');
    const attrs = stateAttrs(state, 'sheet') as Record<string, string | undefined>;
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined) dialog.setAttribute(k, v);
  });

  // The latest onClose, read at key time. The trap effect must not depend on onClose: callers pass
  // inline closures (ScreenFrame), and a parent re-render (useClip `timeupdate`) would otherwise
  // re-run it, snapping focus to the opener and back to the first row (PR #22 review finding 1).
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const root = host.current;
    const before = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex]',
        ) ?? [],
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current?.();
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const [first, last] = [f[0], f[f.length - 1]];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const row =
    actions ??
    (primaryLabel ? <PrimaryButton label={primaryLabel} onPress={onPrimary} /> : undefined);
  return (
    <div
      className="fia-sheet__scrim"
      role="presentation"
      ref={host}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <GlassSheet
        open
        title={
          brand ? (
            <div className="fia-sheet-brand">
              <FiaLogo />
              <span>{title}</span>
            </div>
          ) : (
            title
          )
        }
        description={description}
        height={tall ? 'calc(100% - 14px)' : 'auto'}
        actions={row ? <div className="fia-sheet__actions">{row}</div> : undefined}
      >
        {onClose && closeButton && (
          <GlassButton
            variant="quiet"
            size="sm"
            className="fia-sheet__close"
            onClick={onClose}
            aria-label={t('s.common.close')}
          >
            <Icon name="x" size={20} />
          </GlassButton>
        )}
        <div className="fia-sheet__body">{children}</div>
      </GlassSheet>
    </div>
  );
}
