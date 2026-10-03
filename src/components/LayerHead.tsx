import { Bead } from './glass';
import { KINDS } from '../frame/kinds';
import type { BeadKind } from '../flow/ui/band';

// Layer-frame head (PRD § 8.1 Layer; nodded mocks design/alpha-v2-screens/10-key-term.html,
// 11-image-viewer.html, 12-video.html): the item's kind bead (the guide's coded marks, PRD § 8.3)
// with its kind line, and the item's title set large. The frame's <h1> carries the title for
// assistive tech (ScreenFrame `titleHidden`), so the visible title here is aria-hidden.
// Shared by S10, S11 and S12; any layer that opens one resource can use it.
export type LayerKind = 'term' | 'image' | 'map' | 'video';

const BEAD: Record<LayerKind, { kind: BeadKind; color: string }> = {
  term: { kind: 'term', color: KINDS.term.color },
  image: { kind: 'media', color: KINDS.media.color },
  map: { kind: 'media', color: KINDS.media.color },
  video: { kind: 'video', color: KINDS.video.color },
};

export interface LayerHeadProps {
  kind: LayerKind;
  /** "Key term · FIA", "Video Bible Dictionary · streams" */
  kindLine: string;
  title: string;
  /** 'title' (S10 mock): the bead leads the title and the kind line follows; 'kind' (S11, S12 mocks): the bead leads the kind line above the title. */
  beadOn?: 'kind' | 'title';
  /** text scale (useTextScale) for the bead box, as the guide's chips */
  scale?: number;
}

export function LayerHead({ kind, kindLine, title, beadOn = 'kind', scale = 1 }: LayerHeadProps) {
  const b = BEAD[kind];
  const bead = (n: number) => (
    <span className="fia-layer-head__bead" aria-hidden="true">
      <Bead kind={b.kind} state="done" size={n * Math.min(scale, 2)} color={b.color} />
    </span>
  );
  const line = (
    <p className="fia-layer-head__kind" data-kind={kind}>
      {beadOn === 'kind' && bead(12)}
      {kindLine}
    </p>
  );
  return (
    <div className="fia-layer-head" data-bead={beadOn}>
      {beadOn === 'kind' && line}
      <p className="fia-layer-head__title" aria-hidden="true" dir="auto">
        {beadOn === 'title' && bead(16)}
        {title}
      </p>
      {beadOn === 'title' && line}
    </div>
  );
}
