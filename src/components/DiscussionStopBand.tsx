import { stateAttrs, type StateProps } from './types';

// discussion-stop-band.md — the stop state that waits for people (R-408, R-410); undo band 5 s.
export interface DiscussionStopBandProps extends StateProps {
  lead: string;
  body?: string;
  /** undo band after `We talked — continue` */
  undoLabel?: string;
  onUndo?: () => void;
}

export function DiscussionStopBand({
  lead,
  body,
  undoLabel,
  onUndo,
  state = 'default',
  className,
}: DiscussionStopBandProps) {
  return (
    <div
      className={['fia-stop-band', className].filter(Boolean).join(' ')}
      role="status"
      {...stateAttrs(state)}
    >
      <p className="fia-stop-band__lead">{lead}</p>
      {body && <p>{body}</p>}
      {undoLabel && (
        <button type="button" className="fia-secondary" onClick={onUndo}>
          {undoLabel}
        </button>
      )}
    </div>
  );
}
