import type { ReactNode } from 'react';
import { t } from '../i18n';
import { CatalogRow, GlassButton, Icon } from './glass';
import { stateAttrs, type StateProps } from './types';
import './PericopeCard.css';

// pericope-card.md on glass (F6-S02; PRD § 3 row 6): one passage as a kit resources/CatalogRow.
// The title is the reference, always (RULING 2026-10-02 ~13:16 ET). A subtitle (the optional AI
// summary, FS-M) shows only when the caller passes one: it is off by default and nothing here turns
// it on. One open (the row) and at most one info (a quiet kit GlassButton beside it, R-508): never a
// control inside the row's button.
export interface PericopeCardProps extends StateProps {
  /** The passage reference ("Mark 1:1–13"): the title. */
  reference: string;
  /** Optional subtitle under the reference; omitted = none shown (the default). */
  subtitle?: ReactNode;
  saved?: 'saved' | 'partial' | 'not-saved';
  savedCount?: { saved: number; total: number };
  /** Size line ("Text 0.4 MB"); the caller formats it truthfully (≈ for estimates). */
  size?: string;
  badges?: ReactNode;
  /** C-03 pack id, written as `data-pack-id` on the row. */
  packId?: string;
  first?: boolean;
  onOpen?: () => void;
  onInfo?: () => void;
}

export function PericopeCard({
  reference,
  subtitle,
  saved,
  savedCount,
  size,
  badges,
  packId,
  first,
  onOpen,
  onInfo,
  state = 'default',
  className,
}: PericopeCardProps) {
  const savedText =
    saved === 'saved'
      ? t('s.common.saved-badge')
      : saved === 'partial' && savedCount
        ? t('s.common.mark.partial', savedCount)
        : null;
  const meta = (
    <span className="fia-pericope__meta">
      {saved === 'not-saved' ? (
        <span className="fia-pericope__needs" data-role="needs-connection">
          {t('s.common.not-saved-badge')}
        </span>
      ) : (
        savedText && (
          <span className="fia-pericope__saved" data-saved={saved}>
            <Icon name="check" size={14} />
            {savedText}
          </span>
        )
      )}
      {badges}
      {size && <span className="fia-pericope__size">{size}</span>}
      {onOpen && <Icon name="chevronRight" size={16} />}
    </span>
  );
  return (
    <div className={['fia-pericope', className].filter(Boolean).join(' ')} {...stateAttrs(state)}>
      <CatalogRow
        className="fia-catalog"
        first={first}
        title={
          subtitle ? (
            <>
              <span className="fia-pericope__ref">{reference}</span>
              <span className="fia-pericope__sub">{subtitle}</span>
            </>
          ) : (
            reference
          )
        }
        meta={meta}
        onOpen={onOpen}
        data-pack-id={packId}
        aria-disabled={state === 'disabled' || state === 'loading' ? true : undefined}
      />
      {onInfo && (
        <GlassButton
          variant="quiet"
          size="sm"
          className="fia-pericope__info"
          leading={<Icon name="info" size={16} />}
          onClick={onInfo}
        >
          {t('s.common.info')}
        </GlassButton>
      )}
    </div>
  );
}
