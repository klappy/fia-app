import { stateAttrs, type StateProps } from './types';

// text-block.md — Scripture and guide text with alignment highlight (background band, never underline).
export interface TextSegment {
  id: string;
  text: string;
  /** seconds; used for highlight-from-elapsed and tap-to-seek */
  start?: number;
}

export interface TextBlockProps extends StateProps {
  kind: 'guide' | 'scripture';
  segments: TextSegment[];
  activeId?: string;
  lang?: string;
  dir?: 'ltr' | 'rtl' | 'auto';
  onSeek?: (segment: TextSegment) => void;
}

export function TextBlock({
  kind,
  segments,
  activeId,
  lang,
  dir = 'auto',
  onSeek,
  state = 'default',
  className,
}: TextBlockProps) {
  return (
    <div
      className={['fia-text', `fia-text--${kind}`, className].filter(Boolean).join(' ')}
      lang={lang}
      dir={dir}
      {...stateAttrs(state)}
    >
      {segments.map((s) => (
        <span
          key={s.id}
          className="fia-text__seg"
          data-active={s.id === activeId || undefined}
          onClick={onSeek && s.start !== undefined ? () => onSeek(s) : undefined}
          role={onSeek ? 'button' : undefined}
        >
          {s.text}{' '}
        </span>
      ))}
    </div>
  );
}
