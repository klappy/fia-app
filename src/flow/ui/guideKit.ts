// Pure helpers and the text-scale hook shared by the guide family (F5). Split from GuideChrome.tsx so
// that file exports components only (react-refresh).
import { t } from '../../i18n';
import type { PackMedia, PackTerm, ResourcesPack } from '../../media/resources';
import type { GuideUnit } from '../types';
import { CUE_MEDIA, type BandModel, type Tail } from './band';
import { keepNumber, keepRef, NB } from '../../frame/text';
import { iconSz, useTextScale } from '../../frame/scale';

// ── text scale (C-10 text size → html[data-text-step], settings/apply.ts) ────────────────────────────

// The reader lives in the shared layer (frame/scale.ts); the guide's parts import it from here.
export { useTextScale, iconSz as iconSize };

// NB, keepRef and keepNumber are the shared layer's (frame/text.ts); re-exported for the guide's parts.
export { NB, keepRef };

export function tailWords(tail: Tail): string {
  switch (tail.kind) {
    case 'talk-here':
      return t('s.guide.band.talk-here');
    case 'talk-after':
      return keepNumber(t('s.guide.band.talk-after', { n: tail.n }));
    case 'guide-ends':
      return keepNumber(t('s.guide.band.guide-ends', { n: tail.n }));
    case 'step-ends':
      return keepNumber(t('s.guide.band.step-ends', { n: tail.n }));
  }
}

/** "Part 4 of 25 in this step · talk after part 7" (the band's caption, PRD § 8.3). */
export const bandCaption = (b: BandModel) =>
  `${t('s.guide.band.part', { n: b.n, m: b.m })}${NB}· ${tailWords(b.tail)}`;

export type CardView = 'guide' | 'text' | 'resources';

export interface PartItem {
  kind: 'term' | 'image' | 'map';
  id: string;
  title: string;
  /** shown words when two items share a title ("Lord (1)", "Lord (2)") */
  label?: string;
}

export function partItems(u: GuideUnit, res: ResourcesPack | null | undefined): PartItem[] {
  if (!res) return [];
  const terms = new Map<string, PackTerm>(res.terms.map((x) => [x.id, x]));
  const media = new Map<string, PackMedia>([...res.images, ...res.maps].map((x) => [x.id, x]));
  const out: PartItem[] = [];
  for (const id of u.resources) {
    const term = terms.get(id);
    if (term) out.push({ kind: 'term', id, title: term.title });
  }
  // Two senses under one title (e.g. t87 and t88, both "Lord") stay distinct, never merged or chosen
  // for the reader (PoC next-actions PLAN item 4): each is numbered in pack order.
  const same = (x: PartItem) => out.filter((y) => y.kind === 'term' && y.title === x.title);
  for (const it of out.filter((x) => x.kind === 'term')) {
    const group = same(it);
    if (group.length > 1)
      it.label = t('s.guide.term-sense', { title: it.title, n: group.indexOf(it) + 1 });
  }
  for (const id of CUE_MEDIA[u.id] ?? []) {
    const m = media.get(id);
    if (m) out.push({ kind: m.kind === 'map' ? 'map' : 'image', id, title: m.title });
  }
  return out;
}
