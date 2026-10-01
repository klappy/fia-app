import type { ReactNode } from 'react';
import { t } from '../i18n';
import { Card } from './Card';
import type { StateProps } from './types';

// pericope-card.md — one passage, one open, one info (R-508: one affordance).
export interface PericopeCardProps extends StateProps {
  reference: string;
  summary?: string;
  saved?: 'saved' | 'partial' | 'not-saved';
  savedCount?: { saved: number; total: number };
  badges?: ReactNode;
  onOpen?: () => void;
  onInfo?: () => void;
}

export function PericopeCard({
  reference,
  summary,
  saved,
  savedCount,
  badges,
  onOpen,
  onInfo,
  state,
  className,
}: PericopeCardProps) {
  const savedText =
    saved === 'saved'
      ? t('s.common.saved-badge')
      : saved === 'partial' && savedCount
        ? t('s.common.mark.partial', savedCount)
        : saved === 'not-saved'
          ? t('s.common.not-saved-badge')
          : null;
  return (
    <Card
      title={reference}
      state={state}
      className={['fia-pericope', className].filter(Boolean).join(' ')}
      onPress={onOpen}
      badges={
        <>
          {savedText && <span className="fia-chip">{savedText}</span>}
          {badges}
        </>
      }
    >
      {summary && <p>{summary}</p>}
      {onInfo && (
        <span
          role="button"
          tabIndex={0}
          className="fia-secondary"
          onClick={(e) => {
            e.stopPropagation();
            onInfo();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onInfo();
            }
          }}
        >
          {t('s.common.info')}
        </span>
      )}
    </Card>
  );
}
