import { useState } from 'react';
import { t } from '../i18n';
import { stateAttrs, type StateProps } from './types';

// feedback-form.md — compose, attach context, received / queued (R-705; contract C-16).
export interface FeedbackContext {
  version: string;
  language: string;
  pericope?: string;
  unit?: string;
  theme: 'light' | 'dark';
  textStep: string;
}

export interface FeedbackFormProps extends StateProps {
  context: FeedbackContext;
  reasons?: string[];
  onSubmit?: (text: string, reason?: string) => void;
}

export function FeedbackForm({
  context,
  reasons = [],
  onSubmit,
  state = 'default',
  className,
}: FeedbackFormProps) {
  const [text, setText] = useState('');
  const [reason, setReason] = useState<string | undefined>();
  return (
    <form
      className={['fia-feedback', className].filter(Boolean).join(' ')}
      {...stateAttrs(state)}
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSubmit?.(text, reason);
      }}
    >
      {reasons.length > 0 && (
        <div className="fia-feedback__reasons" role="group">
          {reasons.map((r) => (
            <button
              key={r}
              type="button"
              className="fia-chip"
              aria-pressed={reason === r}
              onClick={() => setReason(r)}
            >
              {r}
            </button>
          ))}
        </div>
      )}
      <textarea
        aria-label={t('s.feedback.title')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        disabled={state === 'disabled'}
      />
      <p className="fia-caption">
        {context.version} · {context.language} · {context.pericope ?? '—'} · {context.theme} ·{' '}
        {context.textStep}
      </p>
    </form>
  );
}
