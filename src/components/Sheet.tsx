import type { ReactNode } from 'react';
import { t } from '../i18n';
import { PrimaryButton } from './PrimaryButton';
import { stateAttrs, type StateProps } from './types';

// sheet.md — the five named sheets (20–24) and the More sheet host. Bottom slot hosts the same
// primary-button; close is a 56 px target (`tap_close_px`).
export interface SheetProps extends StateProps {
  title: string;
  open?: boolean;
  onClose?: () => void;
  primaryLabel?: string;
  onPrimary?: () => void;
  children?: ReactNode;
}

export function Sheet({
  title,
  open = true,
  onClose,
  primaryLabel,
  onPrimary,
  children,
  state = 'default',
  className,
}: SheetProps) {
  if (!open) return null;
  return (
    <div className="fia-sheet__scrim" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="fia-sheet-title"
        className={['fia-sheet', className].filter(Boolean).join(' ')}
        {...stateAttrs(state, 'sheet')}
      >
        <header className="fia-sheet__head">
          <h2 id="fia-sheet-title" className="fia-title">
            {title}
          </h2>
          <button
            type="button"
            className="fia-sheet__close"
            onClick={onClose}
            aria-label={t('s.common.close')}
          >
            ×
          </button>
        </header>
        <div className="fia-sheet__body">{children}</div>
        {primaryLabel && (
          <div className="fia-primary-slot fia-primary-slot--sheet">
            <PrimaryButton label={primaryLabel} onPress={onPrimary} />
          </div>
        )}
      </section>
    </div>
  );
}
