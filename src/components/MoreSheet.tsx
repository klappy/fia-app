import { useNavigate } from 'react-router-dom';
import { t } from '../i18n';
import { CatalogRow, GlassButton, GlassSurface, Icon, type KitIconName } from './glass';
import { Sheet } from './Sheet';
import type { StateProps } from './types';

// Explore sheet (PRD § 3 #3, § 8.1 (d)) on the kit's GlassSheet: the one secondary fallback, opened
// only from the header's Explore pill — never a bar. Groups *This passage* and *FIA*, footer, one action.
// BIDE (F5): the marks legend (§ 8.3) and "Back to part n" need the progress dots and flow position.
export interface MoreSheetProps extends StateProps {
  open: boolean;
  onClose: () => void;
  /** Screen the sheet was opened on (C-16 `screen`): Feedback opens with `?from=<id>`. */
  from?: string;
}

type Row = { icon: KitIconName; key: string; to: string };

const PASSAGE: Row[] = [
  { icon: 'compass', key: 's.common.explore.map', to: '/overview' },
  { icon: 'globe', key: 's.common.explore.resources', to: '/resources?all=1' },
  { icon: 'sparkle', key: 's.common.explore.voice', to: '/sheet/provenance' },
  { icon: 'check', key: 's.common.explore.saved', to: '/downloads' },
];
const FIA: Row[] = [
  { icon: 'bookmark', key: 's.common.explore.passages', to: '/pericopes' },
  { icon: 'chevronRight', key: 's.common.more.settings', to: '/settings' },
  { icon: 'chevronRight', key: 's.common.explore.feedback', to: '/feedback' },
  { icon: 'chevronRight', key: 's.common.explore.about', to: '/about' },
];

export function MoreSheet({ open, onClose, state, from }: MoreSheetProps) {
  const go = useNavigate();
  const group = (title: string, rows: Row[]) => (
    <div className="fia-group">
      <div className="fia-overline">{title}</div>
      <GlassSurface level={3} blur="soft" radius="xl" shadow="none" className="fia-well">
        <ul className="fia-more__list">
          {rows.map((r, i) => (
            <li key={r.key}>
              <CatalogRow
                className="fia-catalog fia-more__row"
                first={i === 0}
                onOpen={() => {
                  onClose();
                  go(
                    r.to === '/feedback' && from
                      ? `/feedback?from=${encodeURIComponent(from)}`
                      : r.to,
                  );
                }}
                title={
                  <span className="fia-row-label">
                    <Icon name={r.icon} size={18} />
                    {t(r.key)}
                  </span>
                }
                meta={<Icon name="chevronRight" size={16} />}
              />
            </li>
          ))}
        </ul>
      </GlassSurface>
    </div>
  );
  return (
    <Sheet
      title={t('s.common.explore')}
      open={open}
      onClose={onClose}
      state={state}
      tall
      brand
      closeButton={false}
      className="fia-more"
      actions={
        <GlassButton
          variant="dark"
          size="lg"
          full
          className="fia-explore-close"
          leading={<Icon name="x" size={18} />}
          onClick={onClose}
        >
          {t('s.common.close')}
        </GlassButton>
      }
    >
      {group(t('s.common.explore.this-passage'), PASSAGE)}
      {group('FIA', FIA)}
      <p className="fia-caption fia-explore__footer">{t('s.common.explore.footer')}</p>
    </Sheet>
  );
}
