import { Link } from 'react-router-dom';
import { t } from '../i18n';
import { Sheet } from './Sheet';
import type { StateProps } from './types';

// more-sheet.md — layer 2, the single sheet: Language · Passage · Downloads · Settings · Feedback · About.
export interface MoreSheetProps extends StateProps {
  open: boolean;
  onClose: () => void;
}

const ROWS: { key: string; to: string }[] = [
  { key: 's.common.more.language', to: '/?mode=use' },
  { key: 's.common.more.passage', to: '/pericopes' },
  { key: 's.common.more.downloads', to: '/downloads' },
  { key: 's.common.more.settings', to: '/settings' },
  { key: 's.common.more.feedback', to: '/feedback' },
  { key: 's.common.more.about', to: '/about' },
];

export function MoreSheet({ open, onClose, state }: MoreSheetProps) {
  return (
    <Sheet
      title={t('s.common.dock.more')}
      open={open}
      onClose={onClose}
      state={state}
      className="fia-more"
    >
      <ul className="fia-more__list">
        {ROWS.map((r) => (
          <li key={r.key}>
            <Link to={r.to} onClick={onClose} className="fia-more__row">
              {t(r.key)}
            </Link>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
