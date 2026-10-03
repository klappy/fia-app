import type { ReactNode } from 'react';
import { GlassSurface } from '../components/glass';

// Group (mock Group, cookbook design/alpha-v2-screens/_frame.js:386-387): an overline and a kit
// GlassSurface well (level 3, soft blur, xl, no shadow; .fia-well in frame/frame.css, smoked in dark).
// Explore's groups and S14's settings groups compose it.
export interface GroupProps {
  title: string;
  /** A named region (section, aria-label = title; the overline is then decoration). */
  region?: boolean;
  className?: string;
  wellClassName?: string;
  children?: ReactNode;
}

export function Group({ title, region, className, wellClassName, children }: GroupProps) {
  const Tag = region ? 'section' : 'div';
  return (
    <Tag
      className={className ? `fia-group ${className}` : 'fia-group'}
      aria-label={region ? title : undefined}
    >
      <div className="fia-overline" aria-hidden={region || undefined}>
        {title}
      </div>
      <GlassSurface
        level={3}
        blur="soft"
        radius="xl"
        shadow="none"
        className={wellClassName ? `fia-well ${wellClassName}` : 'fia-well'}
      >
        {children}
      </GlassSurface>
    </Tag>
  );
}
