import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { units, waitingStops } from '../src/flow/model';
import type { CatalogManifest, FlowGuide } from '../src/flow/types';
import { EN, t } from '../src/i18n';
import { completionSummary, keepRef, nextPassage, partKinds } from '../src/screens/completionModel';
import { fixtureCatalog, PACK } from './flow/fixture';

// F6-S18 Completion in glass (mock design/alpha-v2-screens/18-completion.html): the recap's counts come
// from the guide and the person's own record, never invented; kinds the pack does not place at a part
// (images, maps, videos: PRD § 8.7) draw no line; the next passage is the one S03 lists after this one;
// the changed files take the kit only from its vendored paths.
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const catalog = JSON.parse(read('data/catalog/manifest.json')) as CatalogManifest;

let guide: FlowGuide;
let order: string[];
let talks: ReturnType<typeof waitingStops>;
beforeAll(async () => {
  guide = await fixtureCatalog().guide(PACK);
  order = units(guide).map((u) => u.id);
  talks = waitingStops(guide);
});

describe('F6-S18 recap from the guide and the record', () => {
  it('a whole walk: all six steps, 130 of 130 parts, key terms and the passage read, 23 of 23 talks', () => {
    const s = completionSummary(guide, { visited: order, discussed: talks.map((x) => x.id) });
    expect(s.steps.map((x) => x.title)).toEqual([
      'Hear and Heart',
      'Setting the Stage',
      'Defining the Scenes',
      'Embodying the Text',
      'Filling the Gaps',
      'Speaking the Word',
    ]);
    expect(s.steps.every((x) => x.reached)).toBe(true);
    expect([s.stepsReached, s.visited, s.total]).toEqual([6, 130, 130]);
    // parts carrying a term id in the pack (guide.json units[].resources) and the Scripture cue (R-414);
    // the checked-in L1 sample gives the mock's 56 (the shipped data/packs build gives 60)
    expect(s.kinds).toEqual([
      { kind: 'term', parts: 56 },
      { kind: 'scripture', parts: 5 },
    ]);
    expect([s.talks, s.discussed, s.skipped]).toEqual([23, 23, 0]);
  });

  it('images, maps and videos are never guessed: no part carries them in the pack yet', () => {
    const kinds = new Set(units(guide).flatMap((u) => partKinds(guide, u)));
    expect([...kinds].sort()).toEqual(['scripture', 'term']);
  });

  it('talked is never played (R-410): skipped talks and unvisited parts lower the counts honestly', () => {
    const drop = new Set(order.slice(40, 43));
    const visited = order.filter((id) => !drop.has(id));
    const discussed = talks.slice(2).map((x) => x.id);
    const s = completionSummary(guide, { visited, discussed });
    expect([s.visited, s.total]).toEqual([127, 130]);
    expect([s.talks, s.discussed, s.skipped]).toEqual([23, 21, 2]);
    expect(s.kinds.find((k) => k.kind === 'term')!.parts).toBeLessThan(56);
  });

  it('a step never reached stays unticked and the steps line says so', () => {
    const visited = order.filter((id) => !id.startsWith('S04-'));
    const s = completionSummary(guide, { visited, discussed: [] });
    expect(s.stepsReached).toBe(5);
    expect(s.steps.find((x) => x.id === 'S04')!.reached).toBe(false);
    expect(t('s.completion.some-steps', { k: s.stepsReached, n: s.steps.length })).toBe(
      '5 of 6 steps',
    );
  });

  it('an empty record counts nothing', () => {
    const s = completionSummary(guide, { visited: [], discussed: [] });
    expect([s.stepsReached, s.visited, s.discussed, s.skipped, s.kinds.length]).toEqual([
      0, 0, 0, 0, 0,
    ]);
  });
});

describe('F6-S18 next passage (the primary)', () => {
  it('is the passage S03 lists after this one in the same book', () => {
    expect(nextPassage(catalog, 'eng', PACK)?.title).toBe('Mark 1:14–20');
    expect(nextPassage(catalog, 'eng', 'eng.MRK-1-14-20')?.packId).toBe('eng.MRK-1-21-28');
  });
  it('is none after the book’s last passage, or for a pack the catalog does not list', () => {
    expect(nextPassage(catalog, 'eng', 'eng.MRK-16-9-20')).toBeUndefined();
    expect(nextPassage(catalog, 'eng', 'eng.XXX-1-1-1')).toBeUndefined();
    expect(nextPassage(catalog, 'spa', PACK)).toBeUndefined();
  });
  it('never breaks the reference at its dash', () => {
    expect(keepRef('Mark 1:14–20')).toBe('Mark 1:14⁠–⁠20');
    expect(t('s.completion.primary.next', { ref: 'Mark 1:14–20' })).toBe(
      'Next passage: Mark 1:14–20',
    );
  });
});

describe('F6-S18 words are the mock’s', () => {
  it('new keys read as the nodded mock, plural-safe', () => {
    expect(t('s.completion.headline', { passage: 'Mark 1:1–13' })).toBe('You finished Mark 1:1–13');
    expect(
      `${t('s.completion.all-steps', { n: 6 })} · ${t('s.completion.parts-of', { v: 130, total: 130 })}`,
    ).toBe('All 6 steps · 130 of 130 parts');
    expect(EN['s.completion.went-through']).toBe('What your group went through');
    expect(t('s.completion.kind.term', { n: 56 })).toBe('Key terms in 56 parts');
    expect(t('s.completion.kind.media', { n: 6 })).toBe('Images and maps in 6 parts');
    expect(t('s.completion.kind.video', { n: 1 })).toBe('Videos in 1 part');
    expect(t('s.completion.kind.scripture', { n: 6 })).toBe('The passage read in 6 parts');
    expect(t('s.completion.kind.stop', { d: 23, stops: 23 })).toBe(
      'Talked together at 23 of 23 stops',
    );
    expect(EN['s.completion.marks-kept']).toBe('Your marks are kept.');
    expect(EN['s.completion.start-guide-again']).toBe('Start the guide again');
    expect(EN['s.completion.send-feedback']).toBe('Send feedback');
    expect(EN['s.completion.saved-ready']).toBe('Saved on this phone · ready offline');
  });
  it('the screen draws no v1 words or hand-drawn arrows', () => {
    const src = read('src/screens/S18Completion.tsx');
    for (const k of [
      's.completion.summary',
      's.completion.discussed',
      's.completion.beads-label',
      's.completion.stage-label',
      's.completion.next',
      's.completion.another-passage',
    ])
      expect(src).not.toContain(`'${k}'`);
    expect(src).not.toContain('⟶');
    expect(src).not.toContain('SecondaryAction');
  });
});

describe('F6-S18 G-F import check (PRD § 5 rule 3)', () => {
  it('kit parts come only from the vendored kit (directly or via components/glass.ts)', () => {
    const src = read('src/screens/S18Completion.tsx');
    const kit = [...src.matchAll(/from '([^']*(?:vendor|glass)[^']*)'/g)].map((m) => m[1]);
    expect(kit.length).toBeGreaterThan(0);
    for (const p of kit)
      expect(p).toMatch(/^(\.\.\/)+(vendor\/glass\/components\/|components\/glass$)/);
    expect(src).toMatch(/vendor\/glass\/components\/progress\/StageRail/);
    for (const part of ['GlassSurface', 'CatalogRow', 'Icon', 'StageRail', 'Bead'])
      expect(src).toContain(`<${part}`);
    // one primary: the frame's thumb slot; no second dark fill on the page
    expect(src).not.toMatch(/variant="dark"/);
    expect(read('src/screens/S18Completion.css')).not.toContain('surface-inverse');
  });
});
