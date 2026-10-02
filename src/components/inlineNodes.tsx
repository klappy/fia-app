import type { ReactNode } from 'react';

const NAMED: Record<string, string> = {
  quot: '"',
  apos: "'",
  amp: '&',
  lt: '<',
  gt: '>',
  nbsp: '\u00a0',
};

/**
 * The text of an html run: character references decoded (`&quot;`, `&#x27;`, `&#39;`, `&amp;`, …,
 * named, decimal or hex) in one pass, so `&amp;quot;` reads `&quot;`; an unknown name stays as written.
 */
export function decodeEntities(s: string): string {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, ref: string) => {
    if (ref[0] !== '#') return NAMED[ref] ?? whole;
    const cp = /^#x/i.test(ref) ? parseInt(ref.slice(2), 16) : Number(ref.slice(1));
    return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole;
  });
}

const EMPHASIS = { strong: 'strong', b: 'strong', em: 'em', i: 'em' } as const;

/**
 * Inline emphasis only: `<strong>`/`<b>` and `<em>`/`<i>` become nodes; every other tag is dropped,
 * text kept and its character references decoded (the non-English packs carry `<b>` and `&quot;`).
 */
export function inlineNodes(html: string): ReactNode[] {
  const out: ReactNode[] = [];
  const open: ('strong' | 'em')[] = [];
  let key = 0;
  for (const part of html.split(/(<[^>]*>)/)) {
    const tag = /^<(\/?)(strong|em|b|i)(?:\s[^>]*)?>$/i.exec(part);
    if (tag) {
      const name = EMPHASIS[tag[2].toLowerCase() as keyof typeof EMPHASIS];
      const i = open.lastIndexOf(name);
      if (!tag[1]) open.push(name);
      else if (i >= 0) open.splice(i, 1);
      continue;
    }
    if (!part || part.startsWith('<')) continue;
    let node: ReactNode = decodeEntities(part);
    for (const t of [...open].reverse())
      node = t === 'strong' ? <strong key={key++}>{node}</strong> : <em key={key++}>{node}</em>;
    out.push(typeof node === 'string' ? <span key={key++}>{node}</span> : node);
  }
  return out;
}
