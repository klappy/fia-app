import type { ReactNode } from 'react';
import { stateAttrs, type StateProps } from './types';

// card.md — generic in-flow glass card; one tappable control at most; badges never hide.
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
  const Tag = onPress ? 'button' : 'section';
  return (
    <Tag
      className={['fia-card', className].filter(Boolean).join(' ')}
      onClick={onPress}
      type={onPress ? 'button' : undefined}
      {...stateAttrs(state)}
    >
      {title && <h3 className="fia-subtitle">{title}</h3>}
      {badges && <div className="fia-card__badges">{badges}</div>}
      {children}
    </Tag>
  );
}
