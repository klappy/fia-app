import { t } from '../i18n';
import { FilterChips, GlassField, GlassSurface, Icon } from './glass';
import { stateAttrs, type StateProps } from './types';

// feedback-form.md — compose + attach context (R-705; contract C-16). Controlled: S16 owns the
// draft and builds/validates the C-16 payload (src/feedback/payload.ts).
// F6-S16 glass skin per the nodded mock design/alpha-v2-screens/16-feedback.html (cookbook): kit
// FilterChips (reasons), GlassSurface ("We will attach"), GlassField (contact), Icon — all via
// ./glass. App overrides live in src/tokens/alpha.css (hand-written block, `.fia-feedback`).
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
  /** Contact is not an email or phone C-16 accepts: error shown on the field itself. */
  contactInvalid?: boolean;
  /** The guide is paused behind this form (opened from the guide): shows "Paused while you write." */
  paused?: boolean;
  readOnly?: boolean;
}

export function FeedbackForm({
  text,
  contact,
  onText,
  onContact,
  contextLines,
  needText,
  contactInvalid,
  paused,
  readOnly,
  state = 'default',
  className,
}: FeedbackFormProps) {
  const word = (r: FeedbackReason) => t(`s.feedback.reason.${r}`);
  const draft = text.trim().toLowerCase();
  const pressed = FEEDBACK_REASONS.filter((r) => draft.startsWith(word(r).toLowerCase()));
  // M18 reason chips: C-16 1.1.0 has no `reason` field, so a chip writes its word into the text the
  // person can see and edit — nothing hidden is sent. Kit FilterChips reports the next selection;
  // the chip that changed is the one pressed.
  const pick = (next: string[]) => {
    if (readOnly) return;
    const r = (next.find((v) => !pressed.includes(v as FeedbackReason)) ??
      pressed.find((v) => !next.includes(v))) as FeedbackReason | undefined;
    if (!r) return;
    // Pressing a selected chip deselects it: strip its leading `word:` rather than adding it again.
    if (pressed.includes(r)) {
      const lead = text.trimStart();
      onText(lead.slice(word(r).length).replace(/^\s*:\s*/, ''));
      return;
    }
    onText(text.trim() ? `${word(r)}: ${text}` : `${word(r)}: `);
  };
  return (
    <div
      className={['fia-feedback', 'fia-feedback--glass', 'fia-kit-captions', className]
        .filter(Boolean)
        .join(' ')}
      {...stateAttrs(state)}
    >
      {paused && <p className="fia-caption fia-feedback__paused">{t('s.feedback.paused-note')}</p>}
      <label
        htmlFor="fia-feedback-text"
        className="fia-feedback__prompt fia-type-subtitle fia-fw-semibold fia-lh-125 fia-tone-title"
      >
        {t('s.feedback.prompt')}
      </label>
      {/* Selected chip: glass + check + semibold (alpha.css), not the kit's --surface-inverse, so
          the primary stays the only dark element (mock 16-feedback.html, FilterChips.jsx:5). */}
      <FilterChips
        className="fia-feedback__reasons fia-filter-kit"
        role="group"
        aria-label={t('s.feedback.prompt')}
        bleed={false}
        value={pressed}
        onChange={pick}
        options={FEEDBACK_REASONS.map((r) => ({
          value: r,
          label: pressed.includes(r) ? (
            <span className="fia-feedback__chip">
              <Icon name="check" size={14} stroke={2.2} />
              {word(r)}
            </span>
          ) : (
            word(r)
          ),
        }))}
      />
      {/* Kit gap → app-layer fallback (PRD § 3, Beget): kit forms/GlassField is a single-line
          <input> (GlassField.jsx:6), so a message would be cut off at large text. v1 asks for a
          growing text area (16-feedback.md Layout 'Textarea'); this one is drawn with GlassField's
          own tokens (alpha.css `.fia-glass-area`) until the kit has a multiline field. */}
      <textarea
        id="fia-feedback-text"
        className="fia-glass-area"
        dir="auto"
        value={text}
        placeholder={t('s.feedback.placeholder')}
        onChange={(e) => onText(e.target.value)}
        rows={3}
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
      <GlassSurface
        level={2}
        blur="strong"
        radius="xl"
        shadow="card"
        className="fia-feedback__context"
      >
        <div className="fia-feedback__inner">
          <h3 className="fia-overline fia-overline--form">
            {t('s.feedback.attach-header').replace(/:\s*$/, '')}
          </h3>
          {contextLines.map((l) => (
            <p
              key={l}
              className="fia-feedback__where fia-type-label fia-fw-semibold fia-tone-title"
            >
              {l}
            </p>
          ))}
        </div>
      </GlassSurface>
      <div className="fia-feedback__field fia-field-kit">
        <GlassField
          id="fia-feedback-contact"
          label={t('s.feedback.contact')}
          dir="auto"
          type="text"
          inputMode="email"
          autoComplete="email"
          value={contact}
          maxLength={200}
          readOnly={readOnly}
          aria-invalid={contactInvalid || undefined}
          aria-describedby={contactInvalid ? 'fia-feedback-contact-error' : undefined}
          onChange={(e) => onContact(e.target.value)}
        />
      </div>
      {contactInvalid && (
        <p id="fia-feedback-contact-error" role="alert" className="fia-caption">
          {t('s.feedback.contact-invalid')}
        </p>
      )}
      <p className="fia-caption">{t('s.feedback.anon-note')}</p>
    </div>
  );
}
