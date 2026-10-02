import { inlineNodes } from './inlineNodes';
import { stateAttrs, type StateProps } from './types';

// text-block (PRD § 3 #9) — Scripture and guide text with alignment highlight (background band, never
// underline). v2: the guide unit is set at 17 px × text scale on the card (nodded mock `.fia-unit-text`),
// with the source's own emphasis kept: the pack's unit `html` carries <strong>/<em> (eng) or <b> (spa,
// tpi, hau, arb) and character references (`&quot;`); its decoded text equals the unit `text` the clip
// is bound to, up to whitespace. It is rebuilt as React nodes, never injected as HTML.
export interface TextSegment {
  id: string;
  text: string;
  /** the unit's source html (<strong>/<b>, <em>/<i> kept; other markup reads as its decoded text) */
  html?: string;
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
          {s.html ? inlineNodes(s.html) : s.text}{' '}
        </span>
      ))}
    </div>
  );
}
