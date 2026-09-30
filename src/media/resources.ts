// Resources pack (L1 `resources.json`) → S09 catalog cards (R-508: one open, one info), chip
// counts, search, and the per-item models S10–S12 read. Marks come from C-06 via provenance.ts.
import type { Provenance } from '../components/types';
import { hasContent, markFor, type Slot } from './provenance';

export interface Derivative {
  sourcePath: string;
  kind: 'image' | 'audio';
  tier: string;
  recipe: string;
  mime: string;
  eligible: boolean;
  status?: string;
  fallbackMime?: string;
}

export interface AudioSlot extends Slot {
  url?: string;
  sourceId?: string;
  derivatives?: Derivative[];
}

export interface TextSlot extends Slot {
  html?: string;
  sourceId?: string;
  textSha256?: string;
}

export interface PackTerm {
  id: string;
  termNumber: string;
  title: string;
  text: TextSlot;
  audio: AudioSlot;
  passages?: string[];
}

export interface PackMedia {
  id: string;
  kind: 'image' | 'map' | 'video';
  title: string;
  engTitle: string;
  titleProvenance: Slot;
  url: string;
  description: Slot;
  packaged: boolean;
  streamOnly?: boolean;
  derivatives?: Derivative[];
}

export interface ResourcesPack {
  schemaVersion: 1;
  packId: string;
  terms: PackTerm[];
  images: PackMedia[];
  maps: PackMedia[];
  videos: PackMedia[];
}

export type CardType = 'terms' | 'images' | 'maps' | 'videos';
export type Chip = 'all' | CardType;

export interface ResourceCard {
  id: string;
  type: CardType;
  title: string;
  /** English title kept for search in every language */
  engTitle: string;
  /** mark for what the card shows (title/text) */
  mark: Provenance;
  /** mark for the card's audio/description, if any */
  audioMark?: Provenance;
  /** caption key under the title, if the state calls for one (spec 09 § States) */
  captionKey?:
    's.resources.streams' | 's.resources.text-only-offline' | 's.resources.open-english-map';
  /** the one open action is available */
  openable: boolean;
}

export interface CardOptions {
  offline?: boolean;
}

function mediaCard(m: PackMedia, type: CardType, o: CardOptions): ResourceCard {
  const mark = markFor(m.titleProvenance, 'text');
  let captionKey: ResourceCard['captionKey'];
  let openable = true;
  if (type === 'videos') {
    if (o.offline) {
      captionKey = 's.resources.streams';
    }
  } else if (o.offline && !m.packaged) {
    captionKey = 's.resources.text-only-offline';
    openable = false;
  } else if (type === 'maps' && mark === 'absent') {
    captionKey = 's.resources.open-english-map';
  }
  return {
    id: m.id,
    type,
    title: m.title,
    engTitle: m.engTitle,
    mark,
    audioMark: markFor(m.description, 'description'),
    captionKey,
    openable,
  };
}

export function buildCards(pack: ResourcesPack, o: CardOptions = {}): ResourceCard[] {
  return [
    ...pack.terms.map<ResourceCard>((t) => ({
      id: t.id,
      type: 'terms',
      title: t.title,
      engTitle: t.title,
      mark: markFor(t.text, 'text'),
      audioMark: markFor(t.audio, 'audio'),
      openable: hasContent(t.text) || t.text.fallback === 'eng',
    })),
    ...pack.images.map((m) => mediaCard(m, 'images', o)),
    ...pack.maps.map((m) => mediaCard(m, 'maps', o)),
    ...pack.videos.map((m) => mediaCard(m, 'videos', o)),
  ];
}

export function chipCounts(cards: ResourceCard[]): Record<CardType, number> {
  const c: Record<CardType, number> = { terms: 0, images: 0, maps: 0, videos: 0 };
  for (const x of cards) c[x.type] += 1;
  return c;
}

/** Case- and diacritic-insensitive fold for search. */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

export function filterCards(cards: ResourceCard[], chip: Chip, query = ''): ResourceCard[] {
  const q = fold(query.trim());
  return cards.filter(
    (c) =>
      (chip === 'all' || c.type === chip) &&
      (!q || fold(c.title).includes(q) || fold(c.engTitle).includes(q)),
  );
}

export function findMedia(pack: ResourcesPack, id: string): PackMedia | undefined {
  return [...pack.images, ...pack.maps, ...pack.videos].find((m) => m.id === id);
}

export function findTerm(pack: ResourcesPack, id: string): PackTerm | undefined {
  return pack.terms.find((t) => t.id === id);
}

/** Plain text of a term's HTML (tags dropped, entities for the few the pipeline emits). */
export function htmlToParagraphs(html: string): string[] {
  return html
    .split(/<\/p>/i)
    .map((p) =>
      p
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim(),
    )
    .filter(Boolean);
}

/** Video playback state (R-506): streamed only; offline is honest, never an endless spinner. */
export function videoState(m: PackMedia, online: boolean): 'playable' | 'needs-connection' {
  return online && !!m.url ? 'playable' : 'needs-connection';
}

export type VideoUiState = 'idle' | 'playing' | 'paused' | 'ended' | 'error';

/**
 * S12 primary: close when not playable or ended; retry after an error (no element lookup — the
 * frame message has replaced the video); otherwise play/pause the mounted element.
 */
export function videoPrimaryAction(
  playable: boolean,
  vs: VideoUiState,
): 'close' | 'retry' | 'toggle' {
  if (!playable || vs === 'ended') return 'close';
  if (vs === 'error') return 'retry';
  return 'toggle';
}
