import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { joinGuide } from '../src/flow/catalog';
import { bandModel } from '../src/flow/ui/band';
import { firstWords, guideMap, stepBeads } from '../src/screens/S07Overview.map';
import { t } from '../src/i18n';

// F6-S07 Whole guide map model (src/screens/S07Overview.map.ts) on the bundled eng Mark 1:1–13 pack,
// at the nodded mock's position (07-overview.html:80, S03-U004: part 4 of 25 in step 3).
const PACK = 'eng.MRK-1-1-13';
const read = (file: string) =>
  JSON.parse(readFileSync(join(process.cwd(), 'data/packs', PACK, file), 'utf8')) as never;
const guide = joinGuide(read('guide.json'), read('guide-units.json'));
const at = (unitId: string, visited = [unitId], discussed: string[] = []) =>
  guideMap(guide, { unitId, visited, discussed });

describe('S07 guide map model', () => {
  it('counts what the mock counts: 6 steps, 130 parts, 23 talks', () => {
    const m = at('S03-U004');
    expect(m.steps.map((s) => s.parts.length)).toEqual([8, 13, 25, 29, 45, 10]);
    expect(m.parts).toBe(130);
    expect(m.talks).toBe(23);
    expect(m.current).toEqual({ stepIndex: 2, n: 4 });
    expect(m.steps.map((s) => s.status)).toEqual([
      'done',
      'done',
      'current',
      'ahead',
      'ahead',
      'ahead',
    ]);
    expect(m.steps.map((s) => s.talks)).toEqual([0, 3, 3, 2, 12, 3]);
    expect(
      t('s.overview.v2.summary', { title: guide.title, steps: 6, parts: m.parts, talks: m.talks }),
    ).toBe('Mark 1:1–13 · 6 steps · 130 parts · 23 talks together');
  });

  it('marks parts by position, as the band does: heard, you are here, ahead', () => {
    const m = at('S03-U004');
    const s3 = m.steps[2].parts;
    expect(s3.slice(0, 5).map((p) => p.state)).toEqual([
      'done',
      'done',
      'done',
      'current',
      'upcoming',
    ]);
    expect(m.steps[0].parts.every((p) => p.state === 'done')).toBe(true);
    expect(m.steps[5].parts.every((p) => p.state === 'upcoming')).toBe(true);
    // The open step's beads agree with the band's for the same section (flow/ui/band.ts).
    const band = bandModel(guide, 'S03-U004');
    const section = s3.slice(band.from - 1, band.to);
    expect(section.map((p) => [p.kind, p.state])).toEqual(
      band.beads.filter((b) => b.kind !== 'stop' && b.kind !== 'end').map((b) => [b.kind, b.state]),
    );
  });

  it('puts a talk after its part and the end of the guide after the last part', () => {
    const m = at('S03-U004');
    const s3 = m.steps[2].parts;
    expect(s3.filter((p) => p.talk).map((p) => p.n)).toEqual([7, 19, 21]);
    const last = m.steps[5].parts.at(-1)!;
    expect(last.end).toBe(true);
    const beads = stepBeads(m.steps[5]);
    expect(beads.at(-1)).toEqual({ kind: 'end', state: 'upcoming' });
    expect(beads.filter((b) => b.kind === 'stop')).toHaveLength(3);
  });

  it('names a talk the person went past un-discussed as skipped', () => {
    const m = at('S03-U004', ['S03-U010', 'S03-U004']);
    const talk = m.steps[2].parts.find((p) => p.n === 7)!.talk!;
    expect(talk.skipped).toBe(true);
    const discussed = at('S03-U004', ['S03-U010', 'S03-U004'], [talk.stop.id]);
    expect(discussed.steps[2].parts.find((p) => p.n === 7)!.talk!.skipped).toBe(false);
  });

  it('teaches only the marks the guide draws', () => {
    const m = at('S03-U004');
    expect([...m.kinds].sort()).toEqual(['end', 'media', 'plain', 'scripture', 'stop', 'term']);
  });

  it('cuts a part to its first words at a word boundary (mock firstWords)', () => {
    expect(firstWords('John the Baptist')).toBe('John the Baptist');
    expect(firstWords('In the first scene: Mark begins his account of the good news')).toBe(
      'In the first scene: Mark begins…',
    );
    expect(firstWords('Pause the audio here and show your group a map')).toBe(
      'Pause the audio here and show…',
    );
    expect(firstWords('x'.repeat(50))).toBe(`${'x'.repeat(33)}…`);
    expect(at('S03-U004').steps[2].parts[3].words).toBe('In the first scene: Mark begins…');
  });
});
