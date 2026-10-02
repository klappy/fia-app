import type { ReactNode } from 'react';
import { GlassSurface } from './glass';
import { stateAttrs, type StateProps } from './types';

// card.md on the kit's GlassSurface (PRD § 3): in-flow glass card, level 2, blur medium;
// one tappable control at most; badges never hide.
export interface CardProps extends StateProps {
  title?: string;
  badges?: ReactNode;
  onPress?: () => void;
  children?: ReactNode;
}

export function Card({
  title,
  badges,
  onPress,
  children,
  state = 'default',
  className,
}: CardProps) {
  return (
    <GlassSurface
      as={onPress ? 'button' : 'section'}
      level={2}
      blur="medium"
      radius="xl"
      className={['fia-card', className].filter(Boolean).join(' ')}
      onClick={onPress}
      type={onPress ? 'button' : undefined}
      {...stateAttrs(state)}
    >
      <div className="fia-card__inner">
        {title && <h3 className="fia-subtitle">{title}</h3>}
        {badges && <div className="fia-card__badges">{badges}</div>}
        {children}
      </div>
    </GlassSurface>
  );
}
