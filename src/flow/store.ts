// Workspace (C-09) and completion record (C-11) persistence behind a tiny key-value port.
// Storage failure is a status, not an error; restore validates against the schema and the
// loaded pack, drops what no longer matches, and never autoplays (C-09 description, R-410).
import { C09, C11, errorText, flowValidator } from './contracts';
import { initialState, type FlowState } from './machine';
import { indexOf, stopAt } from './model';
import type { FlowGuide } from './types';

export interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function memoryKV(seed: Record<string, string> = {}): KV & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    get: (k) => data.get(k) ?? null,
    set: (k, v) => void data.set(k, v),
    remove: (k) => void data.delete(k),
  };
}

/** Browser localStorage, or null when the platform refuses it (private mode, blocked). */
export function browserKV(): KV | null {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    const probe = 'fia.probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return {
      get: (k) => ls.getItem(k),
      set: (k, v) => ls.setItem(k, v),
      remove: (k) => ls.removeItem(k),
    };
  } catch {
    return null;
  }
}

export const workspaceKey = (packId: string) => `fia.workspace.v1.${packId}`;
export const completionKey = (packId: string) => `fia.completion.v1.${packId}`;
/** L3's own pointer to the last-used language / book / pack (not a contract; UI convenience). */
export const CURRENT_KEY = 'fia.flow.current.v1';

export type View = 'guide' | 'single-script' | 'overview';

export interface Workspace {
  schemaVersion: 1;
  packId: string;
  contentLanguage: string;
  theme: 'light' | 'dark';
  view: 'guide' | 'scripture' | 'resources' | 'overview' | 'single-script';
  position: {
    stepId: string;
    unitId: string;
    visited: string[];
    finished: boolean;
    attachedStopId?: string;
  };
  checkpoint: null;
  savedAt: string;
}

export interface CompletionRecord {
  schemaVersion: 1;
  packId: string;
  records: {
    unitId: string;
    sourceDigest: string;
    manualOverride: boolean | null;
    autoComplete: boolean;
    discussed?: boolean;
    playedParts: ('text' | 'terms' | 'description' | 'stop')[];
  }[];
}

export function toWorkspace(
  g: FlowGuide,
  s: FlowState,
  view: View,
  theme: 'light' | 'dark',
  now = new Date(),
): Workspace {
  const stop = s.phase === 'stop' ? stopAt(g, s.unitId) : undefined;
  return {
    schemaVersion: 1,
    packId: g.packId,
    contentLanguage: g.language,
    theme,
    view,
    position: {
      stepId: s.unitId.slice(0, 3),
      unitId: s.unitId,
      visited: s.visited.slice(-512),
      finished: s.finished,
      ...(stop ? { attachedStopId: stop.id } : {}),
    },
    checkpoint: null,
    savedAt: now.toISOString(),
  };
}

/** One record per touched unit; `discussed` lives on the stop's unit and only there (R-410). */
export function toCompletion(g: FlowGuide, s: FlowState): CompletionRecord {
  const byId = new Map(g.steps.flatMap((st) => st.units.map((u) => [u.id, u] as const)));
  const touched = new Set([...s.played, ...s.discussed.map((id) => stopUnit(g, id))]);
  const records = [...touched]
    .filter((id): id is string => !!id && byId.has(id))
    .sort((a, b) => indexOf(g, a) - indexOf(g, b))
    .map((unitId) => {
      const stop = stopAt(g, unitId);
      const discussed = stop ? s.discussed.includes(stop.id) : false;
      const parts: CompletionRecord['records'][number]['playedParts'] = [];
      if (s.played.includes(unitId)) parts.push('text');
      if (discussed) parts.push('stop');
      return {
        unitId,
        sourceDigest: byId.get(unitId)!.textSha256,
        manualOverride: null,
        autoComplete: s.played.includes(unitId),
        ...(stop ? { discussed } : {}),
        playedParts: parts,
      };
    });
  return { schemaVersion: 1, packId: g.packId, records };
}

const stopUnit = (g: FlowGuide, stopId: string) =>
  g.stops.find((x) => x.id === stopId)?.afterUnitId;

export type SaveStatus = 'saved' | 'unavailable' | 'invalid';

export function saveSession(
  kv: KV | null,
  g: FlowGuide,
  s: FlowState,
  view: View,
  theme: 'light' | 'dark' = 'light',
): { status: SaveStatus; detail?: string } {
  const ws = toWorkspace(g, s, view, theme);
  const cr = toCompletion(g, s);
  const v = flowValidator();
  const a = v.validate(C09, ws);
  if (!a.ok) return { status: 'invalid', detail: `C-09 ${errorText(a.errors)}` };
  const b = v.validate(C11, cr);
  if (!b.ok) return { status: 'invalid', detail: `C-11 ${errorText(b.errors)}` };
  if (!kv) return { status: 'unavailable' };
  try {
    kv.set(workspaceKey(g.packId), JSON.stringify(ws));
    kv.set(completionKey(g.packId), JSON.stringify(cr));
    return { status: 'saved' };
  } catch (e) {
    return { status: 'unavailable', detail: String(e) };
  }
}

export interface Restored {
  state: FlowState;
  view: View;
  /** units whose C-11 digest no longer matches the pack text (marks cleared, J-A8). */
  changed: string[];
}

const readJson = (kv: KV, key: string): unknown => {
  try {
    const raw = kv.get(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
};

/** Restore a session for this pack, or null when there is none (or it fails validation). */
export function restoreSession(
  kv: KV | null,
  g: FlowGuide,
  opts: { hasAudio?: boolean; autoContinue?: boolean } = {},
): Restored | null {
  if (!kv) return null;
  const v = flowValidator();
  const ws = readJson(kv, workspaceKey(g.packId));
  if (!ws || !v.validate(C09, ws).ok) return null;
  const w = ws as Workspace;
  if (w.packId !== g.packId) return null;
  const known = (id: string) => indexOf(g, id) >= 0;
  const base = initialState(g, opts);
  const cr = readJson(kv, completionKey(g.packId));
  const digest = new Map(g.steps.flatMap((st) => st.units.map((u) => [u.id, u.textSha256])));
  const played: string[] = [];
  const discussed: string[] = [];
  const changed: string[] = [];
  if (cr && v.validate(C11, cr).ok && (cr as CompletionRecord).packId === g.packId) {
    for (const r of (cr as CompletionRecord).records) {
      if (!digest.has(r.unitId)) continue;
      if (digest.get(r.unitId) !== r.sourceDigest) {
        changed.push(r.unitId);
        continue;
      }
      if (r.playedParts.includes('text')) played.push(r.unitId);
      const stop = stopAt(g, r.unitId);
      if (r.discussed && stop) discussed.push(stop.id);
    }
  }
  const unitId = known(w.position.unitId) ? w.position.unitId : base.unitId;
  const stop = stopAt(g, unitId);
  const atStop = stop && !discussed.includes(stop.id);
  const view: View = w.view === 'overview' || w.view === 'single-script' ? w.view : 'guide';
  return {
    view,
    changed,
    state: {
      ...base,
      unitId,
      visited: w.position.visited.filter(known),
      played,
      discussed,
      finished: w.position.finished,
      // restore never autoplays (C-09): a stop waits, anything else is ready, never playing.
      phase: w.position.finished
        ? 'finished'
        : atStop
          ? 'stop'
          : base.hasAudio
            ? 'idle'
            : 'next-ready',
    },
  };
}

export interface Current {
  language?: string;
  book?: string;
  packId?: string;
}

export function readCurrent(kv: KV | null): Current {
  if (!kv) return {};
  const c = readJson(kv, CURRENT_KEY);
  return c && typeof c === 'object' ? (c as Current) : {};
}

export function writeCurrent(kv: KV | null, c: Current): void {
  try {
    kv?.set(CURRENT_KEY, JSON.stringify(c));
  } catch {
    /* storage failure is a status, not an error */
  }
}
