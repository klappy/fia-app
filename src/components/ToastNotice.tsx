import type { ReactNode } from 'react';
import { stateAttrs, type StateProps } from './types';

// toast-notice.md — offline chip, banners, toasts, inline notices. State is never motion-only.
export type NoticeKind = 'offline-chip' | 'banner' | 'toast' | 'inline';
export type NoticeTone = 'info' | 'error' | 'stop';

export interface ToastNoticeProps extends StateProps {
  kind: NoticeKind;
  tone?: NoticeTone;
  children: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export function ToastNotice({
  kind,
  tone = 'info',
  children,
  actionLabel,
  onAction,
  state = 'default',
  className,
}: ToastNoticeProps) {
  return (
    <div
      className={['fia-notice', `fia-notice--${kind}`, `fia-notice--${tone}`, className]
        .filter(Boolean)
        .join(' ')}
      role={tone === 'error' ? 'alert' : 'status'}
      {...stateAttrs(state)}
    >
      <span>{children}</span>
      {actionLabel && (
        <button type="button" className="fia-secondary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
