import { describe, expect, it } from 'vitest';
import {
  initialState,
  primaryKind,
  reduce,
  type FlowAction,
  type FlowState,
} from '../../src/flow/machine';
import { indexOf, isLast, isScriptureCue, units, waitingStops } from '../../src/flow/model';
import type { FlowGuide } from '../../src/flow/types';
import { fixtureCatalog, PACK } from './fixture';

const g: FlowGuide = await fixtureCatalog().guide(PACK);
const run = (s: FlowState, ...as: FlowAction[]) => as.reduce((x, a) => reduce(g, x, a), s);
const at = (unitId: string, s = initialState(g)) => run(s, { type: 'jump', unitId });
const stop1 = waitingStops(g)[0];

describe('guide machine — text-first (no narration yet)', () => {
  it('starts at unit 1, silent, one primary (R-402, R-407)', () => {
    const s = initialState(g);
    expect(s.unitId).toBe('S01-U001');
    expect(s.phase).toBe('next-ready');
    expect(primaryKind(g, s)).toBe('no-audio');
    expect(run(s, { type: 'play' })).toBe(s); // no clip: Play does nothing, never surprise audio
  });
  it('continue advances one unit and marks it played (R-401, R-410)', () => {
    const s = run(initialState(g), { type: 'continue' });
    expect(s.unitId).toBe('S01-U002');
    expect(s.played).toEqual(['S01-U001']);
    expect(s.visited).toEqual(['S01-U001', 'S01-U002']);
  });
  it('a stop unit waits; continue sets discussed and shows undo; undo clears it (R-410, 21)', () => {
    const s = at(stop1.afterUnitId);
    expect(s.phase).toBe('stop');
    expect(primaryKind(g, s)).toBe('discuss');
    const c = run(s, { type: 'continue' });
    expect(c.discussed).toEqual([stop1.id]);
    expect(c.undo).toEqual({ stopId: stop1.id, unitId: stop1.afterUnitId });
    expect(indexOf(g, c.unitId)).toBe(indexOf(g, stop1.afterUnitId) + 1);
    const u = run(c, { type: 'undo' });
    expect(u.discussed).toEqual([]);
    expect(u.unitId).toBe(stop1.afterUnitId);
    expect(u.phase).toBe('stop');
  });
  it('skip never marks a stop discussed; back to a discussed stop does not re-ask', () => {
    const skipped = run(at(stop1.afterUnitId), { type: 'skip' });
    expect(skipped.discussed).toEqual([]);
    const back = run(at(stop1.afterUnitId), { type: 'continue' }, { type: 'back' });
    expect(back.unitId).toBe(stop1.afterUnitId);
    expect(back.phase).toBe('next-ready');
  });
  it('R-414: after a Scripture cue, Continue advances', () => {
    const cue = units(g).find((u) => isScriptureCue(u, g.title))!;
    const s = run(at(cue.id), { type: 'continue' });
    expect(indexOf(g, s.unitId)).toBe(indexOf(g, cue.id) + 1);
  });
  it('the whole guide completes end to end (R-415), marks kept on restart', () => {
    let s = initialState(g);
    for (let i = 0; i < 500 && !s.finished; i++) s = run(s, { type: 'continue' });
    expect(s.finished).toBe(true);
    expect(s.phase).toBe('finished');
    expect(s.discussed).toHaveLength(waitingStops(g).length);
    const r = run(s, { type: 'restart' });
    expect(r.unitId).toBe('S01-U001');
    expect(r.discussed).toHaveLength(waitingStops(g).length);
    expect(r.finished).toBe(false);
  });
  it('last unit reads Finish', () => {
    const last = units(g)[units(g).length - 1];
    expect(isLast(g, last.id)).toBe(true);
    const s = at(last.id);
    expect(['finish', 'discuss']).toContain(primaryKind(g, s));
  });
});

describe('guide machine — with narration (L4 events)', () => {
  const audio = () => initialState(g, { hasAudio: true, autoContinue: true });
  it('idle → Play → playing → end → countdown → next unit plays (R-408)', () => {
    let s = audio();
    expect(primaryKind(g, s)).toBe('play');
    s = run(s, { type: 'play' });
    expect(primaryKind(g, s)).toBe('pause');
    s = run(s, { type: 'narration-end' });
    expect(s.phase).toBe('countdown');
    expect(primaryKind(g, s)).toBe('wait');
    s = run(s, { type: 'countdown-done' });
    expect(s.unitId).toBe('S01-U002');
    expect(s.phase).toBe('playing');
  });
  it('Wait holds on the unit, silent (05: primary during countdown = hold)', () => {
    const s = run(audio(), { type: 'play' }, { type: 'narration-end' }, { type: 'wait' });
    expect(s.phase).toBe('next-ready');
    expect(s.unitId).toBe('S01-U001');
  });
  it('auto-continue never fires at a stop', () => {
    const s = run(at(stop1.afterUnitId, audio()), { type: 'play' }, { type: 'narration-end' });
    expect(s.phase).toBe('stop');
    expect(run(s, { type: 'countdown-done' })).toBe(s);
  });
  it('auto-continue off: next-ready, no countdown', () => {
    const s = run(
      initialState(g, { hasAudio: true, autoContinue: false }),
      { type: 'play' },
      { type: 'narration-end' },
    );
    expect(s.phase).toBe('next-ready');
  });
});
