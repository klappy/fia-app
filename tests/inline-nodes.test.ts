import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TextBlock } from '../src/components/TextBlock';
import { decodeEntities, inlineNodes } from '../src/components/inlineNodes';
import { joinGuide } from '../src/flow/catalog';
import type { FlowGuide } from '../src/flow/types';

// F5 fix r1 (rev-f5-r1a / r1c blocking): S05 rebuilds the unit's html as React nodes. The spa, tpi,
// hau and arb packs carry <b> and character references (`&quot;`, `&#x27;`), which must read as
// their characters, never as "&quot;El hijo de Dios&quot;" on the screen.
const PACKS = join(process.cwd(), 'data/packs');
const json = (pack: string, file: string) =>
  JSON.parse(readFileSync(join(PACKS, pack, file), 'utf8')) as never;
const load = (pack: string): FlowGuide =>
  joinGuide(json(pack, 'guide.json'), json(pack, 'guide-units.json'));
const unit = (g: FlowGuide, id: string) =>
  g.steps.flatMap((s) => s.units).find((u) => u.id === id)!;

/** The characters a reader sees: every string under the nodes, in order. */
function textOf(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(n)) return textOf(n.props.children);
  return '';
}
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('inlineNodes: guide html as React nodes', () => {
  it('spa S02-U002 reads its quotes, not &quot; (the regression r1a reproduced)', () => {
    const u = unit(load('spa.MRK-1-1-13'), 'S02-U002');
    expect(u.html).toContain('&quot;El hijo de Dios&quot;');
    const seen = textOf(inlineNodes(u.html!));
    expect(seen).toContain('Jesús, "El hijo de Dios", y el comienzo');
    expect(seen).not.toContain('&quot;');
    expect(seen).toBe(u.text);
  });

  it('spa <b> keeps its emphasis as <strong> on the S05 TextBlock', () => {
    const u = unit(load('spa.MRK-1-1-13'), 'S05-U005');
    const html = renderToStaticMarkup(
      createElement(TextBlock, {
        kind: 'guide',
        lang: 'spa',
        segments: [{ id: u.id, text: u.text, html: u.html }],
      }),
    );
    expect(html).toContain('<strong>Mesías</strong>');
    expect(html).toContain('<strong>Hijo de Dios</strong>');
    expect(html).not.toContain('&amp;quot;');
    expect(html).not.toContain('<b>');
  });

  it('every bundled pack: the decoded html reads as the unit text (whitespace aside)', () => {
    let checked = 0;
    for (const pack of readdirSync(PACKS)) {
      let g: FlowGuide;
      try {
        g = load(pack);
      } catch {
        continue; // not a guide pack
      }
      for (const u of g.steps.flatMap((s) => s.units)) {
        if (!u.html) continue;
        expect({ pack, id: u.id, seen: squash(textOf(inlineNodes(u.html))) }).toEqual({
          pack,
          id: u.id,
          seen: squash(u.text),
        });
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(150);
  });

  it('decodes named, decimal and hex references once; unknown names stay as written', () => {
    expect(decodeEntities('&quot;a&quot; &#x27;b&#39; &lt;c&gt; d&nbsp;e')).toBe(
      '"a" \'b\' <c> d\u00a0e',
    );
    expect(decodeEntities('&amp;quot; &#8212; &#X2014;')).toBe('&quot; — —');
    expect(decodeEntities('&bogus; & &;')).toBe('&bogus; & &;');
  });

  it('<i> reads as <em>; other tags drop and keep their text', () => {
    const html = renderToStaticMarkup(
      createElement('p', null, inlineNodes('<i>x</i> <data class="r">y</data> <b>z</b>')),
    );
    expect(html).toBe(
      '<p><em>x</em><span> </span><span>y</span><span> </span><strong>z</strong></p>',
    );
  });
});
