import { ProvenanceMark } from './ProvenanceMark';
import { stateAttrs, type Provenance, type StateProps } from './types';

// media-viewer.md — image/map lightbox and in-app video; dock hidden; one close target ≥ 56 px.
export interface MediaViewerProps extends StateProps {
  kind: 'image' | 'video';
  src?: string;
  alt: string;
  provenance?: Provenance;
  caption?: string;
}

export function MediaViewer({
  kind,
  src,
  alt,
  provenance,
  caption,
  state = 'default',
  className,
}: MediaViewerProps) {
  return (
    <figure
      className={['fia-viewer', `fia-viewer--${kind}`, className].filter(Boolean).join(' ')}
      {...stateAttrs(state)}
    >
      {kind === 'image' ? (
        <img src={src} alt={alt} />
      ) : (
        <video src={src} controls aria-label={alt} playsInline />
      )}
      <figcaption>
        {provenance && <ProvenanceMark provenance={provenance} />}
        {caption && <span>{caption}</span>}
      </figcaption>
    </figure>
  );
}
