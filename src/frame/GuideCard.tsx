import type { ReactNode } from 'react';
import { GlassSurface } from '../components/glass';

// GuideCard (mock GuideCard, cookbook design/alpha-v2-screens/_frame.js:304-319): the primary card of the
// guide frame. Kit GlassSurface (level 2, strong blur, 2xl, card shadow) · the view switcher · the voice
// slot · the scrolling body (.fia-card-body). S05, S06, S08 and S09 compose it instead of assembling it by
// hand; its CSS is the guide family's (flow/ui/guide.css .fia-guide-card*, .fia-card-body).
export interface GuideCardProps {
  /** The view switcher (CardViews). */
  views?: ReactNode;
  /** At 200%+ in the Guide view the switcher goes below the text (_frame.js:304-305). */
  viewsLast?: boolean;
  /** The voice chip's slot (ProvenanceChip, or S06's voice-off row). */
  voice?: ReactNode;
  voiceClassName?: string;
  /** The body, inside .fia-card-body. */
  body?: ReactNode;
  bodyClassName?: string;
  /** Anything between the voice slot and the body (S08's edition tools). */
  children?: ReactNode;
}

const cx = (base: string, extra?: string) => (extra ? `${base} ${extra}` : base);

export function GuideCard({
  views,
  viewsLast,
  voice,
  voiceClassName,
  body,
  bodyClassName,
  children,
}: GuideCardProps) {
  return (
    <GlassSurface level={2} blur="strong" radius="2xl" shadow="card" className="fia-guide-card">
      <div className="fia-guide-card__inner">
        {!viewsLast && views}
        {voice != null && (
          <div className={cx('fia-guide-card__voice', voiceClassName)}>{voice}</div>
        )}
        {children}
        {body != null && <div className={cx('fia-card-body', bodyClassName)}>{body}</div>}
        {viewsLast && views}
      </div>
    </GlassSurface>
  );
}
