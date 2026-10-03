import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initialState, reduce, syncAudio, type FlowState } from '../src/flow/machine';
import { createFlowSession } from '../src/flow/session';
import type { FlowGuide } from '../src/flow/types';
import type { NarrationManifest } from '../src/media/narration';
import { STANDINS, audibleUnits, guideNarration, narrationSource } from '../src/media/standin';
import { fixtureCatalog, PACK } from './flow/fixture';

// F5 stand-in narration (RULING § 2026-10-02 ~17:22 ET): the PoC's live clips in the frozen C-05 shape.
const pack = (f: string) =>
  JSON.parse(readFileSync(join(process.cwd(), 'data/packs', PACK, f), 'utf8')) as {
    steps: { units: { id: string; textSha256: string; hidden?: boolean }[] }[];
    stops: { id: string; afterUnitId: string; kind: string }[];
  };
const units = pack('guide-units.json').steps.flatMap((s) => s.units);
const standin = STANDINS[PACK];
const POC = 'fia-functional-poc@62a979fc34272a481ef6a113cec23e8e22afdcb2:';

describe('stand-in C-05 manifest (PoC clips)', () => {
  it('binds every clip to its unit text, AI-marked with C-06 provenance naming the PoC', () => {
    const sha = new Map(units.map((u) => [u.id, u.textSha256]));
    expect(standin.manifest.entries).toHaveLength(113);
    for (const e of standin.manifest.entries) {
      expect(e.sourceSha256, e.id).toBe(sha.get(e.id));
      expect(e.ai).toBe(true);
      expect(e.recordingSource).toBe('generated');
      expect(e.mime).toBe('audio/mpeg');
      expect(e.durationSeconds).toBeGreaterThan(0);
      const prov = (e as unknown as { provenance: Record<string, string> }).provenance;
      expect(prov.status).toBe('generated');
      expect(prov.generator).toBe('narration');
      expect(prov.generatedFrom.startsWith(POC)).toBe(true);
      expect(prov.generatedFrom.endsWith(`#${e.id}`)).toBe(true);
    }
    expect(standin.base).toBe('https://fia.klappy.dev');
    expect(standin.sourcedFrom).toBe(
      'klappy/fia-functional-poc@62a979fc34272a481ef6a113cec23e8e22afdcb2',
    );
  });
  it('covers every unit once: a clip, or listed silent with the reason', () => {
    const clip = new Set(standin.manifest.entries.map((e) => e.id));
    const silent = new Set(standin.silent.map((s) => s.unitId));
    expect(clip.size + silent.size).toBe(units.length);
    for (const u of units) expect(clip.has(u.id) !== silent.has(u.id), u.id).toBe(true);
    // 13 hidden drama examples have no PoC clip; 4 pause cues are spoken inside the parent's clip.
    expect(standin.silent.filter((s) => s.why === 'hidden-no-poc-clip')).toHaveLength(13);
    expect(
      standin.silent.filter((s) => s.why === 'spoken-in-parent').map((s) => [s.unitId, s.parent]),
    ).toEqual([
      ['S02-U012', 'S02-U011'],
      ['S06-U005', 'S06-U004'],
      ['S06-U007', 'S06-U006'],
      ['S06-U009', 'S06-U008'],
    ]);
  });
  it('the pack manifest wins as soon as it has clips (B2b replaces the stand-in)', () => {
    const empty: NarrationManifest = {
      schemaVersion: 1,
      packId: PACK,
      language: 'eng',
      entries: [],
    };
    expect(narrationSource(empty, PACK, '')!.standIn).toBe(true);
    expect(narrationSource(null, PACK, '')!.base).toBe('https://fia.klappy.dev');
    const own = { ...empty, entries: [standin.manifest.entries[0]] };
    expect(narrationSource(own, PACK, '')).toEqual({ manifest: own, base: '', standIn: false });
    expect(narrationSource(empty, 'spa.MRK-1-1-13', '')).toEqual({
      manifest: empty,
      base: '',
      standIn: false,
    });
  });
});

describe('per-unit audio in the kept machine', () => {
  const load = async () => (await fixtureCatalog().guide(PACK)) as FlowGuide;
  const withAudio = async (mode: 'source-fallback' | 'source-only' = 'source-fallback') => {
    const g = await load();
    const choices = guideNarration(narrationSource(null, PACK, ''), g, mode);
    return { g: { ...g, audio: audibleUnits(choices) } as FlowGuide, choices };
  };
  it('plays the stand-in clip at the PoC url; Recorded only leaves every AI clip silent', async () => {
    const { choices } = await withAudio();
    const c = choices.get('S01-U001')!;
    expect(c.clip!.url).toBe('https://fia.klappy.dev/audio/mark-1-1-13/S01-U001.mp3');
    expect(c.mark).toBe('ai-voice');
    expect(choices.get('S02-U005')!.clip!.url).toBe(
      'https://fia.klappy.dev/audio/next-actions/S02-U005.mp3',
    );
    const silent = await withAudio('source-only');
    expect(audibleUnits(silent.choices).size).toBe(0);
    expect(silent.choices.get('S01-U001')!.silent).toBe('source-only-silent');
  });
  it('a silent unit is ready to continue; an attached pause cue waits at its stop at once', async () => {
    const { g } = await withAudio();
    let s = initialState(g);
    expect(s).toMatchObject({ unitId: 'S01-U001', hasAudio: true, phase: 'idle' });
    // S02-U011 (with-pause clip) → narration ends → countdown → S02-U012, silent, stop-003 waits.
    s = reduce(g, s, { type: 'jump', unitId: 'S02-U011' });
    s = reduce(g, s, { type: 'play' });
    s = reduce(g, s, { type: 'narration-end' });
    expect(s.phase).toBe('countdown');
    s = reduce(g, s, { type: 'countdown-done' });
    expect(s).toMatchObject({ unitId: 'S02-U012', hasAudio: false, phase: 'stop' });
    // A hidden example with no clip: the primary continues without audio.
    s = reduce(g, s, { type: 'jump', unitId: 'S04-U017' });
    expect(s).toMatchObject({ hasAudio: false, phase: 'next-ready' });
    s = reduce(g, s, { type: 'continue' });
    expect(s.unitId).toBe('S04-U018');
  });
  it('countdown into the next voiced unit starts it playing (2 s countdown, RULING)', async () => {
    const { g } = await withAudio();
    let s: FlowState = reduce(g, initialState(g), { type: 'play' });
    s = reduce(g, s, { type: 'narration-end' });
    s = reduce(g, s, { type: 'countdown-done' });
    expect(s).toMatchObject({ unitId: 'S01-U002', hasAudio: true, phase: 'playing' });
  });
  it('syncAudio re-reads the clip without playing and never leaves a stop', async () => {
    const { g } = await withAudio();
    const bare = { ...g, audio: new Set<string>() };
    const s0 = initialState(bare);
    expect(s0.phase).toBe('next-ready');
    expect(syncAudio(g, s0)).toMatchObject({ hasAudio: true, phase: 'idle' });
    const atStop = reduce(bare, s0, { type: 'jump', unitId: 'S02-U005' });
    expect(atStop.phase).toBe('stop');
    expect(syncAudio(g, atStop).phase).toBe('stop');
  });
  it('the session loads the stand-in when the pack lists no clips, and resolves per mode', async () => {
    const s = createFlowSession(fixtureCatalog(), null);
    s.selectPack(PACK);
    await s.loadGuide();
    expect(s.get().narrationStandIn).toBe(true);
    expect(s.get().state).toMatchObject({ hasAudio: true, phase: 'idle' });
    let mode: 'source-fallback' | 'source-only' = 'source-only';
    const quiet = createFlowSession(fixtureCatalog(), null, { narrationMode: () => mode });
    quiet.selectPack(PACK);
    await quiet.loadGuide();
    expect(quiet.get().state).toMatchObject({ hasAudio: false, phase: 'next-ready' });
    mode = 'source-fallback';
    quiet.refreshNarration();
    expect(quiet.get().state).toMatchObject({ hasAudio: true, phase: 'idle' });
  });
});
