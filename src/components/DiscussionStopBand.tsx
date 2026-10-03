import { Bead, GlassButton, GlassSurface, Icon } from './glass';
import { stateAttrs, type StateProps } from './types';

// discussion-stop-band (PRD § 3 app-owned: band on kit GlassSurface level 3; sheet 21 on GlassSheet) —
// the stop state that waits for people (R-408, R-410); undo band 5 s. v2: the stop's own mark (the red
// talk bar, never colour alone) leads the words; secondary actions are quiet kit buttons, icon + label.
export interface DiscussionStopBandProps extends StateProps {
  lead: string;
  body?: string;
  /** reopen the question (sheet 21) */
  action?: { label: string; onPress: () => void };
  /** undo band after `We talked — continue` */
  undoLabel?: string;
  onUndo?: () => void;
}

export function DiscussionStopBand({
  lead,
  body,
  action,
  undoLabel,
  onUndo,
  state = 'default',
  className,
}: DiscussionStopBandProps) {
  return (
    <GlassSurface
      level={3}
      blur="soft"
      radius="xl"
      shadow="none"
      className={['fia-stop-band', className].filter(Boolean).join(' ')}
      role="status"
      {...stateAttrs(state)}
    >
      <div className="fia-stop-band__inner">
        <p className="fia-stop-band__lead">
          <Bead kind="stop" state="done" color="var(--fia-kind-stop)" />
          <span>{lead}</span>
        </p>
        {body && <p className="fia-stop-band__body">{body}</p>}
        {(action || undoLabel) && (
          <div className="fia-stop-band__actions">
            {action && (
              <GlassButton
                variant="quiet"
                size="md"
                className="fia-btn fia-quiet"
                leading={<Icon name="users" size={18} />}
                onClick={action.onPress}
              >
                {action.label}
              </GlassButton>
            )}
            {undoLabel && (
              <GlassButton
                variant="quiet"
                size="md"
                className="fia-btn fia-quiet"
                leading={<Icon name="update" size={18} />}
                onClick={onUndo}
              >
                {undoLabel}
              </GlassButton>
            )}
          </div>
        )}
      </div>
    </GlassSurface>
  );
}
