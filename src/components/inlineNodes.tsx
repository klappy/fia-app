import type { ReactNode } from 'react';

/** Inline emphasis only: `<strong>` and `<em>` become nodes; every other tag is dropped, text kept. */
export function inlineNodes(html: string): ReactNode[] {
  const out: ReactNode[] = [];
  const open: ('strong' | 'em')[] = [];
  let key = 0;
  for (const part of html.split(/(<\/?(?:strong|em)>|<[^>]*>)/)) {
    const tag = /^<(\/?)(strong|em)>$/.exec(part);
    if (tag) {
      const name = tag[2] as 'strong' | 'em';
      const i = open.lastIndexOf(name);
      if (!tag[1]) open.push(name);
      else if (i >= 0) open.splice(i, 1);
      continue;
    }
    if (!part || part.startsWith('<')) continue;
    let node: ReactNode = part;
    for (const t of [...open].reverse())
      node = t === 'strong' ? <strong key={key++}>{node}</strong> : <em key={key++}>{node}</em>;
    out.push(typeof node === 'string' ? <span key={key++}>{node}</span> : node);
  }
  return out;
}
