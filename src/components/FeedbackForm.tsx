import { t } from '../i18n';
import { stateAttrs, type StateProps } from './types';

// feedback-form.md — compose + attach context (R-705; contract C-16). Controlled: S16 owns the
// draft and builds/validates the C-16 payload (src/feedback/payload.ts).
export const FEEDBACK_REASONS = ['confusing', 'wrong', 'broken', 'other'] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export interface FeedbackFormProps extends StateProps {
  text: string;
  contact: string;
  onText: (v: string) => void;
  onContact: (v: string) => void;
  /** Human context line(s) for the "We will attach" card (already formatted). */
  contextLines: string[];
  needText?: boolean;
  readOnly?: boolean;
}

export function FeedbackForm({
  text,
  contact,
  onText,
  onContact,
  contextLines,
  needText,
  readOnly,
  state = 'default',
  className,
}: FeedbackFormProps) {
  return (
    <div className={['fia-feedback', className].filter(Boolean).join(' ')} {...stateAttrs(state)}>
      <label htmlFor="fia-feedback-text" className="fia-label">
        {t('s.feedback.prompt')}
      </label>
      {/* M18 reason chips: C-16 1.1.0 has no `reason` field, so a chip writes its word into the
          text the person can see and edit — nothing hidden is sent. */}
      <div className="fia-feedback__reasons" role="group" aria-label={t('s.feedback.prompt')}>
        {FEEDBACK_REASONS.map((r) => {
          const word = t(`s.feedback.reason.${r}`);
          return (
            <button
              key={r}
              type="button"
              className="fia-chip"
              disabled={readOnly}
              aria-pressed={text.trim().toLowerCase().startsWith(word.toLowerCase())}
              onClick={() => onText(text.trim() ? `${word}: ${text}` : `${word}: `)}
            >
              {word}
            </button>
          );
        })}
      </div>
      <textarea
        id="fia-feedback-text"
        dir="auto"
        value={text}
        placeholder={t('s.feedback.placeholder')}
        onChange={(e) => onText(e.target.value)}
        rows={6}
        maxLength={4000}
        readOnly={readOnly}
        aria-invalid={needText || undefined}
        aria-describedby={needText ? 'fia-feedback-need' : undefined}
      />
      {needText && (
        <p id="fia-feedback-need" role="alert" className="fia-caption">
          {t('s.feedback.need-text')}
        </p>
      )}
      <section className="fia-card fia-feedback__context">
        <h3 className="fia-caption">{t('s.feedback.attach-header')}</h3>
        {contextLines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </section>
      <label htmlFor="fia-feedback-contact" className="fia-label">
        {t('s.feedback.contact')}
      </label>
      <input
        id="fia-feedback-contact"
        dir="auto"
        type="text"
        inputMode="email"
        autoComplete="email"
        value={contact}
        maxLength={200}
        readOnly={readOnly}
        onChange={(e) => onContact(e.target.value)}
      />
      <p className="fia-caption">{t('s.feedback.anon-note')}</p>
    </div>
  );
}
