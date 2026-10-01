import { useRef, useState, type PointerEvent } from 'react';
import { ProvenanceMark } from './ProvenanceMark';
import { stateAttrs, type Provenance, type StateProps } from './types';

// media-viewer.md — image/map lightbox (immediate pinch-zoom + double-tap, R-507) and in-app
// video (R-506); dock hidden; one close target ≥ 56 px lives in the screen's primary slot.
export interface MediaViewerProps extends StateProps {
  kind: 'image' | 'video';
  src?: string;
  alt: string;
  provenance?: Provenance;
  caption?: string;
  poster?: string;
  /** message shown in the frame instead of the media (offline / error) */
  frameMessage?: string;
  onVideoState?: (s: 'playing' | 'paused' | 'ended' | 'error') => void;
  onMarkInfo?: () => void;
}

const MAX_ZOOM = 4;

export function MediaViewer({
  kind,
  src,
  alt,
  provenance,
  caption,
  poster,
  frameMessage,
  onVideoState,
  onMarkInfo,
  state = 'default',
  className,
}: MediaViewerProps) {
  const [zoom, setZoom] = useState(1);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch0 = useRef<{ d: number; z: number } | null>(null);
  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const down = (e: PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinch0.current = { d: dist(), z: zoom };
  };
  const move = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch0.current && pinch0.current.d > 0)
      setZoom(Math.min(MAX_ZOOM, Math.max(1, (pinch0.current.z * dist()) / pinch0.current.d)));
  };
  const up = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch0.current = null;
  };
  return (
    <figure
      className={['fia-viewer', `fia-viewer--${kind}`, className].filter(Boolean).join(' ')}
      {...stateAttrs(state)}
    >
      {frameMessage ? (
        <div className="fia-viewer__frame-message" role="status">
          {frameMessage}
        </div>
      ) : kind === 'image' ? (
        <div
          className="fia-viewer__well"
          style={{ touchAction: 'none', overflow: 'auto' }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onDoubleClick={() => setZoom((z) => (z > 1 ? 1 : 2))}
        >
          <img
            src={src}
            alt={alt}
            draggable={false}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
          />
        </div>
      ) : (
        <video
          src={src}
          poster={poster}
          controls
          aria-label={alt}
          playsInline
          preload="metadata"
          onPlay={() => onVideoState?.('playing')}
          onPause={() => onVideoState?.('paused')}
          onEnded={() => onVideoState?.('ended')}
          onError={() => onVideoState?.('error')}
        />
      )}
      <figcaption>
        {provenance && <ProvenanceMark provenance={provenance} onInfo={onMarkInfo} />}
        {caption && <span>{caption}</span>}
      </figcaption>
    </figure>
  );
}
