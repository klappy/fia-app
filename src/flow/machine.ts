// Guide session state machine (05 § States, 21 § States, 24 § States). Pure: every transition
// is a function of (guide, state, action). Audio is L4's; the machine only receives its events.
import { firstUnitId, indexOf, isLast, stopAt, unitAt } from './model';
import type { FlowGuide } from './types';

/** Auto-continue countdown (05 § States: 2 s ring). PRD R-408 cites the PoC's 750 ms. */
export const COUNTDOWN_MS = 2000;
/** Undo band after a stop was continued (21: 5 s). */
export const UNDO_MS = 5000;

export type Phase =
  'idle' | 'playing' | 'paused' | 'countdown' | 'next-ready' | 'stop' | 'finished';

export interface FlowState {
  unitId: string;
  phase: Phase;
  visited: string[];
  /** units whose narration or text was played through (C-11 playedParts `text`). */
  played: string[];
  /** stop ids the person continued past (C-11 `discussed`); never set by a jump or skip. */
  discussed: string[];
  /** forward-jump guard: stop ids already asked about this session (Q24-a). */
  asked: string[];
  /** undo band target after `We talked — continue`. */
  undo?: { stopId: string; unitId: string };
  /** sheet 21 shown once this session; later stops show the band only (Q21-a). */
  stopSheetSeen: boolean;
  finished: boolean;
  /** the unit has a narration clip (false until L4 wires narration). */
  hasAudio: boolean;
  autoContinue: boolean;
}

export type FlowAction =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'narration-end' }
  | { type: 'countdown-done' }
  | { type: 'wait' }
  | { type: 'continue' }
  | { type: 'undo' }
  | { type: 'undo-expired' }
  | { type: 'back' }
  | { type: 'skip' }
  | { type: 'jump'; unitId: string }
  | { type: 'asked'; stopIds: string[] }
  | { type: 'stop-sheet-seen' }
  | { type: 'restart' };

export function initialState(
  g: FlowGuide,
  opts: { hasAudio?: boolean; autoContinue?: boolean } = {},
): FlowState {
  const s: FlowState = {
    unitId: firstUnitId(g),
    phase: 'idle',
    visited: [],
    played: [],
    discussed: [],
    asked: [],
    stopSheetSeen: false,
    finished: false,
    hasAudio: opts.hasAudio ?? false,
    autoContinue: opts.autoContinue ?? true,
  };
  return enter(g, s, s.unitId);
}

const add = (xs: string[], x: string) => (xs.includes(x) ? xs : [...xs, x]);

/** Land on a unit: never plays (R-407); an un-discussed stop without narration waits at once. */
function enter(g: FlowGuide, s: FlowState, unitId: string): FlowState {
  const stop = stopAt(g, unitId);
  const waiting = stop && !s.discussed.includes(stop.id) && !s.hasAudio;
  return {
    ...s,
    unitId,
    visited: add(s.visited, unitId),
    phase: waiting ? 'stop' : s.hasAudio ? 'idle' : 'next-ready',
  };
}

function advance(g: FlowGuide, s: FlowState): FlowState {
  const played = add(s.played, s.unitId);
  if (isLast(g, s.unitId))
    return { ...s, played, phase: 'finished', finished: true, undo: undefined };
  const next = unitAt(g, indexOf(g, s.unitId) + 1)!;
  return enter(g, { ...s, played, undo: undefined }, next.id);
}

export function reduce(g: FlowGuide, s: FlowState, a: FlowAction): FlowState {
  switch (a.type) {
    case 'play':
      return s.hasAudio && ['idle', 'paused', 'next-ready'].includes(s.phase)
        ? { ...s, phase: 'playing' }
        : s;
    case 'pause':
      return s.phase === 'playing' ? { ...s, phase: 'paused' } : s;
    case 'narration-end': {
      if (s.phase !== 'playing') return s;
      const stop = stopAt(g, s.unitId);
      const played = add(s.played, s.unitId);
      if (stop && !s.discussed.includes(stop.id)) return { ...s, played, phase: 'stop' };
      if (isLast(g, s.unitId)) return { ...s, played, phase: 'next-ready' };
      return { ...s, played, phase: s.autoContinue ? 'countdown' : 'next-ready' };
    }
    case 'countdown-done': {
      if (s.phase !== 'countdown') return s;
      const n = advance(g, s);
      return n.phase === 'idle' ? { ...n, phase: 'playing' } : n;
    }
    case 'wait':
      return s.phase === 'countdown' ? { ...s, phase: 'next-ready' } : s;
    case 'continue': {
      if (s.phase === 'playing' || s.phase === 'countdown') return s;
      if (s.phase === 'stop') {
        const stop = stopAt(g, s.unitId)!;
        const n = advance(g, { ...s, discussed: add(s.discussed, stop.id) });
        return n.finished ? n : { ...n, undo: { stopId: stop.id, unitId: s.unitId } };
      }
      return advance(g, s);
    }
    case 'undo': {
      if (!s.undo) return s;
      const discussed = s.discussed.filter((x) => x !== s.undo!.stopId);
      return { ...s, discussed, unitId: s.undo.unitId, phase: 'stop', undo: undefined };
    }
    case 'undo-expired':
      return { ...s, undo: undefined };
    case 'back': {
      const i = indexOf(g, s.unitId);
      if (i <= 0) return { ...s, undo: undefined };
      return enter(g, { ...s, undo: undefined, finished: false }, unitAt(g, i - 1)!.id);
    }
    case 'skip': {
      // Skip ahead never marks a stop discussed (R-410); the passed stop reads as skipped.
      if (isLast(g, s.unitId)) return s;
      const next = unitAt(g, indexOf(g, s.unitId) + 1)!;
      return enter(g, { ...s, undo: undefined }, next.id);
    }
    case 'jump':
      if (indexOf(g, a.unitId) < 0) return s;
      return enter(g, { ...s, undo: undefined, finished: false }, a.unitId);
    case 'asked':
      return { ...s, asked: a.stopIds.reduce(add, s.asked) };
    case 'stop-sheet-seen':
      return { ...s, stopSheetSeen: true };
    case 'restart':
      // Start again: marks are kept (R-415), position goes to unit 1, silent until Play.
      return enter(g, { ...s, finished: false, undo: undefined }, firstUnitId(g));
  }
}

export type PrimaryKind =
  | 'play'
  | 'pause'
  | 'resume'
  | 'wait'
  | 'continue'
  | 'play-next'
  | 'no-audio'
  | 'discuss'
  | 'finish';

/** Which primary the guide shows (05 § States table). Exactly one, always (R-402). */
export function primaryKind(g: FlowGuide, s: FlowState): PrimaryKind {
  const last = isLast(g, s.unitId);
  switch (s.phase) {
    case 'playing':
      return 'pause';
    case 'paused':
      return 'resume';
    case 'countdown':
      return 'wait';
    case 'stop':
      return 'discuss';
    case 'idle':
      return 'play';
    case 'finished':
      return 'finish';
    case 'next-ready':
      if (last) return 'finish';
      if (!s.hasAudio) return 'no-audio';
      return stopAt(g, s.unitId) ? 'play-next' : 'continue';
  }
}

export const PRIMARY_KEY: Record<PrimaryKind, string> = {
  play: 's.guide.primary-play',
  pause: 's.guide.primary-pause',
  resume: 's.guide.primary-resume',
  wait: 's.guide.primary-wait',
  continue: 's.guide.primary-continue',
  'play-next': 's.guide.primary-play-next',
  'no-audio': 's.guide.primary-no-audio',
  discuss: 's.guide.primary-discuss',
  finish: 's.guide.primary-finish',
};

/** The action the primary performs for its kind. */
export function primaryAction(kind: PrimaryKind): FlowAction {
  switch (kind) {
    case 'play':
    case 'resume':
      return { type: 'play' };
    case 'pause':
      return { type: 'pause' };
    case 'wait':
      return { type: 'wait' };
    default:
      return { type: 'continue' };
  }
}
