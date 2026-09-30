import { NavLink } from 'react-router-dom';
import { t } from '../i18n';
import { stateAttrs, type StateProps } from './types';

// dock.md — four destinations, icon + text, labels always visible (R-604). Hidden on 01, 11, 12, 17.
export type DockCell = 'guide' | 'scripture' | 'resources' | 'more';

export interface DockProps extends StateProps {
  active?: DockCell;
  onMore?: () => void;
  /** offline `⊘` dot on Resources when streamed items exist */
  resourcesOfflineDot?: boolean;
}

const CELLS: { id: DockCell; icon: string; key: string; to: string }[] = [
  { id: 'guide', icon: '📖', key: 's.common.dock.guide', to: '/guide' },
  { id: 'scripture', icon: '📜', key: 's.common.dock.scripture', to: '/scripture' },
  { id: 'resources', icon: '🗂', key: 's.common.dock.resources', to: '/resources' },
  { id: 'more', icon: '⋯', key: 's.common.dock.more', to: '#more' },
];

export function Dock({
  active,
  onMore,
  resourcesOfflineDot,
  state = 'default',
  className,
}: DockProps) {
  return (
    <nav
      className={['fia-dock', className].filter(Boolean).join(' ')}
      aria-label="Sections"
      {...stateAttrs(state, 'dock')}
    >
      {CELLS.map((c) =>
        c.id === 'more' ? (
          <button
            key={c.id}
            type="button"
            className="fia-dock__cell"
            onClick={onMore}
            aria-haspopup="dialog"
            data-active={active === 'more' || undefined}
          >
            <span aria-hidden>{c.icon}</span>
            <span>{t(c.key)}</span>
          </button>
        ) : (
          <NavLink
            key={c.id}
            to={c.to}
            className="fia-dock__cell"
            data-active={active === c.id || undefined}
          >
            <span aria-hidden>{c.icon}</span>
            <span>
              {t(c.key)}
              {c.id === 'resources' && resourcesOfflineDot && (
                <span aria-label={t('s.common.offline-chip')}> ⊘</span>
              )}
            </span>
          </NavLink>
        ),
      )}
    </nav>
  );
}
