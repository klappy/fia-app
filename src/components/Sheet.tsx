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
  /** A mark before the title words (S20's voice mark, S21's people glyph); decorative. */
  titleIcon?: ReactNode;
  /** A set height (S21 rises to just under the progress band, mock 21-sheet-discussion-stop.html);
   *  the body scrolls and the actions row stays at the sheet bottom, as `tall`. */
  height?: string;
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
  titleIcon,
  height,
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
    dialog.className = ['fia-sheet', (tall || height) && 'fia-sheet--tall', className]
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
      // Focus off the list (a click on a non-focusable part of the sheet leaves it on <body>, and the
      // browser's sequential-navigation start point is the clicked node): Tab would walk out behind
      // the aria-modal scrim, so wrap it back into the sheet (ticket 2026-10-02 sheet-scrim item 2).
      if (!f.includes(document.activeElement as HTMLElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && document.activeElement === first) {
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
        // Hit-test the dialog, not the scrim node: below 640 px the kit GlassSheet's full-height
        // wrapper (GlassSheet.jsx:3, height 100%) covers the scrim and takes the tap, so
        // `target === currentTarget` never matched there (ticket 2026-10-02 sheet-scrim item 1).
        if (!(e.target as Element).closest('[role="dialog"]')) onClose?.();
      }}
    >
      <GlassSheet
        open
        title={
          brand ? (
            <div
              className={
                onClose && closeButton
                  ? 'fia-sheet-brand fia-sheet-brand--close'
                  : 'fia-sheet-brand'
              }
            >
              <FiaLogo />
              <span>
                {titleIcon}
                {title}
              </span>
            </div>
          ) : (
            title
          )
        }
        description={description}
        height={height ?? (tall ? 'calc(100% - 14px)' : 'auto')}
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
