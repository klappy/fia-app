import { describe, expect, it } from 'vitest';
import {
  initialState,
  primaryAction,
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

describe('guide machine — a clip that fails to load never traps the person (J-A1 walk)', () => {
  const audio = () => initialState(g, { hasAudio: true, autoContinue: true });
  const lastId = units(g)[units(g).length - 1].id;
  it('playing → clip-error: the big button goes on, the part is not marked played', () => {
    const s = run(audio(), { type: 'play' }, { type: 'clip-error' });
    expect(s.phase).toBe('next-ready');
    expect(s.played).toEqual([]);
    expect(primaryKind(g, s)).toBe('continue'); // not `resume`, which only retried the clip
    const n = run(s, primaryAction(primaryKind(g, s)));
    expect(n.unitId).toBe('S01-U002');
    expect(run(s, { type: 'skip' }).unitId).toBe('S01-U002'); // Skip still works
  });
  it('never counts down into the next part, even with auto-continue on', () => {
    const s = run(audio(), { type: 'play' }, { type: 'clip-error' });
    expect(run(s, { type: 'countdown-done' })).toBe(s);
  });
  it('on the last part the forward action finishes the guide (S18), not a dead end', () => {
    const s = run(at(lastId, audio()), { type: 'play' }, { type: 'clip-error' });
    expect(isLast(g, s.unitId)).toBe(true);
    expect(primaryKind(g, s)).toBe('finish');
    const done = run(s, primaryAction(primaryKind(g, s)));
    expect(done.finished).toBe(true);
    expect(done.phase).toBe('finished');
  });
  it('an un-discussed stop still waits; its continue marks it discussed', () => {
    const s = run(at(stop1.afterUnitId, audio()), { type: 'play' }, { type: 'clip-error' });
    expect(s.phase).toBe('stop');
    expect(primaryKind(g, s)).toBe('discuss');
    expect(run(s, { type: 'continue' }).discussed).toEqual([stop1.id]);
  });
  it('the clip can be tried again as a second choice: play from where the error left it', () => {
    const s = run(audio(), { type: 'play' }, { type: 'clip-error' });
    expect(s.hasAudio).toBe(true);
    expect(run(s, { type: 'play' }).phase).toBe('playing');
  });
  it('is ignored unless a clip is playing (idle, paused, text-only)', () => {
    const idle = audio();
    expect(run(idle, { type: 'clip-error' })).toBe(idle);
    const paused = run(idle, { type: 'play' }, { type: 'pause' });
    expect(run(paused, { type: 'clip-error' })).toBe(paused);
    const text = initialState(g);
    expect(run(text, { type: 'clip-error' })).toBe(text);
  });
});
