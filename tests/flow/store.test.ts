import { describe, expect, it } from 'vitest';
import { C09, C11, flowValidator } from '../../src/flow/contracts';
import { initialState, reduce, type FlowAction } from '../../src/flow/machine';
import { waitingStops } from '../../src/flow/model';
import { createFlowSession } from '../../src/flow/session';
import {
  completionKey,
  memoryKV,
  restoreSession,
  saveSession,
  toCompletion,
  toWorkspace,
  workspaceKey,
} from '../../src/flow/store';
import { fixtureCatalog, PACK } from './fixture';

const g = await fixtureCatalog().guide(PACK);
const run = (...as: FlowAction[]) => as.reduce((s, a) => reduce(g, s, a), initialState(g));
const stop1 = waitingStops(g)[0];

describe('workspace (C-09) and completion (C-11)', () => {
  it('serialised session validates against both contracts', () => {
    const s = run({ type: 'jump', unitId: stop1.afterUnitId }, { type: 'continue' });
    const v = flowValidator();
    expect(v.validate(C09, toWorkspace(g, s, 'guide', 'light')).errors).toEqual([]);
    const cr = toCompletion(g, s);
    expect(v.validate(C11, cr).errors).toEqual([]);
    const rec = cr.records.find((r) => r.unitId === stop1.afterUnitId)!;
    expect(rec.discussed).toBe(true);
    expect(rec.playedParts).toEqual(['text', 'stop']);
  });
  it('kill mid-step → reopen → same unit, same state, never playing (R-410 accept)', () => {
    const kv = memoryKV();
    const s = run(
      { type: 'continue' },
      { type: 'continue' },
      { type: 'jump', unitId: stop1.afterUnitId },
    );
    expect(saveSession(kv, g, s, 'single-script').status).toBe('saved');
    const r = restoreSession(kv, g)!;
    expect(r.state.unitId).toBe(stop1.afterUnitId);
    expect(r.state.phase).toBe('stop');
    expect(r.state.played).toEqual(s.played);
    expect(r.view).toBe('single-script');
    const audio = restoreSession(kv, g, { hasAudio: true })!;
    expect(audio.state.phase).toBe('stop');
    const kv2 = memoryKV();
    saveSession(kv2, g, run({ type: 'continue' }), 'guide');
    expect(restoreSession(kv2, g, { hasAudio: true })!.state.phase).toBe('idle');
  });
  it('a digest mismatch clears that mark and reports it (C-11, J-A8)', () => {
    const kv = memoryKV();
    saveSession(kv, g, run({ type: 'continue' }), 'guide');
    const cr = JSON.parse(kv.get(completionKey(PACK))!);
    cr.records[0].sourceDigest = 'f'.repeat(64);
    kv.set(completionKey(PACK), JSON.stringify(cr));
    const r = restoreSession(kv, g)!;
    expect(r.changed).toEqual(['S01-U001']);
    expect(r.state.played).toEqual([]);
  });
  it('invalid or foreign stored data is ignored, not thrown', () => {
    const kv = memoryKV({ [workspaceKey(PACK)]: '{"nope":1}' });
    expect(restoreSession(kv, g)).toBeNull();
    expect(restoreSession(memoryKV({ [workspaceKey(PACK)]: 'not json' }), g)).toBeNull();
  });
  it('storage failure is a status, not an error', () => {
    expect(saveSession(null, g, initialState(g), 'guide').status).toBe('unavailable');
    const throwing = {
      get: () => null,
      set: () => {
        throw new Error('quota');
      },
      remove: () => {},
    };
    expect(saveSession(throwing, g, initialState(g), 'guide').status).toBe('unavailable');
  });
});

describe('flow session (shared position across views, R-411)', () => {
  it('language → pack → guide → continue persists; a new session resumes', async () => {
    const kv = memoryKV();
    const a = createFlowSession(fixtureCatalog(), kv);
    await a.loadCatalog();
    expect(a.get().catalogStatus).toBe('ready');
    a.setLanguage('eng');
    a.selectBook('MRK');
    a.selectPack(PACK);
    await a.loadGuide();
    a.dispatch({ type: 'continue' });
    a.setView('overview');
    const b = createFlowSession(fixtureCatalog(), kv);
    expect(b.get().packId).toBe(PACK);
    await b.loadGuide();
    expect(b.get().state!.unitId).toBe('S01-U002');
    expect(b.get().view).toBe('overview');
    expect(b.get().saveStatus).toBeUndefined();
  });
  it('catalog failure is an error state with retry', async () => {
    const s = createFlowSession(
      {
        manifest: async () => {
          throw new Error('offline');
        },
        guide: async () => g,
      },
      null,
    );
    await s.loadCatalog();
    expect(s.get().catalogStatus).toBe('error');
  });
});
