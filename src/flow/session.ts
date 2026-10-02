// The flow session: one small external store shared by S01–S07, S18 and sheets 21/24, so
// position is shared state across Guide / Text / Overview (R-411) without touching App.tsx.
import { useSyncExternalStore } from 'react';
import type { NarrationManifest } from '../media/narration';
import type { NarrationChoice, NarrationMode } from '../media/provenance';
import { audibleUnits, guideNarration, narrationSource } from '../media/standin';
import { CONTENT_BASE } from '../media/usePack';
import { loadSettings } from '../settings/settings';
import { browserStore } from '../settings/storage';
import { createCatalog, type Catalog } from './catalog';
import { initialState, reduce, syncAudio, type FlowAction, type FlowState } from './machine';
import {
  browserKV,
  readCurrent,
  restoreSession,
  saveSession,
  writeCurrent,
  type KV,
  type SaveStatus,
  type View,
} from './store';
import type { CatalogManifest, FlowGuide } from './types';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface FlowSnapshot {
  catalogStatus: LoadStatus;
  manifest?: CatalogManifest;
  language?: string;
  book?: string;
  packId?: string;
  guideStatus: LoadStatus;
  guide?: FlowGuide;
  state?: FlowState;
  view: View;
  saveStatus?: SaveStatus;
  /** units whose marks are ignored on restore (C-11 digest mismatch; the record is kept). */
  changed: string[];
  error?: string;
  /** Per unit: the clip the narration mode allows, or why it is silent (C-05 + R-501; F5). */
  narration?: ReadonlyMap<string, NarrationChoice>;
  /** The clips come from the stand-in manifest (the PoC's live clips), not the pack (F5). */
  narrationStandIn?: boolean;
}

/** What the session needs besides the catalog: the narration mode (C-10) and the content base. */
export interface SessionOptions {
  narrationMode?: () => NarrationMode;
  contentBase?: string;
}

type SessionCatalog = Pick<Catalog, 'manifest' | 'guide'> & Partial<Pick<Catalog, 'narration'>>;

const DATA_BASE =
  (import.meta.env?.VITE_FIA_DATA_BASE as string | undefined) ??
  `${import.meta.env?.BASE_URL ?? '/'}data`;

export function createFlowSession(
  catalog: SessionCatalog,
  kv: KV | null,
  opts: SessionOptions = {},
) {
  const mode = () => opts.narrationMode?.() ?? 'source-fallback';
  // The pack manifest as read (null = unreadable), kept so a mode change re-resolves without a fetch.
  let packNarration: NarrationManifest | null = null;
  const withNarration = (guide: FlowGuide, m: NarrationMode) => {
    const src = narrationSource(packNarration, guide.packId, opts.contentBase ?? '');
    const choices = guideNarration(src, guide, m);
    return {
      guide: { ...guide, audio: audibleUnits(choices) },
      narration: choices,
      narrationStandIn: !!src?.standIn,
    };
  };
  const cur = readCurrent(kv);
  let snap: FlowSnapshot = {
    catalogStatus: 'idle',
    guideStatus: 'idle',
    view: 'guide',
    changed: [],
    ...cur,
  };
  const subs = new Set<() => void>();
  const set = (patch: Partial<FlowSnapshot>) => {
    snap = { ...snap, ...patch };
    subs.forEach((f) => f());
  };
  const persistCurrent = () =>
    writeCurrent(kv, { language: snap.language, book: snap.book, packId: snap.packId });
  const save = () => {
    if (!snap.guide || !snap.state) return;
    const r = saveSession(kv, snap.guide, snap.state, snap.view);
    if (r.status !== snap.saveStatus) set({ saveStatus: r.status });
  };

  return {
    subscribe(f: () => void) {
      subs.add(f);
      return () => void subs.delete(f);
    },
    get: () => snap,
    async loadCatalog(force = false) {
      if (!force && (snap.catalogStatus === 'ready' || snap.catalogStatus === 'loading')) return;
      set({ catalogStatus: 'loading', error: undefined });
      try {
        set({ manifest: await catalog.manifest(), catalogStatus: 'ready' });
      } catch (e) {
        set({ catalogStatus: 'error', error: String(e) });
      }
    },
    setLanguage(language: string) {
      if (language !== snap.language)
        set({
          language,
          book: undefined,
          packId: undefined,
          guide: undefined,
          state: undefined,
          guideStatus: 'idle',
        });
      persistCurrent();
    },
    selectBook(book: string) {
      set({ book });
      persistCurrent();
    },
    selectPack(packId: string) {
      if (packId !== snap.packId)
        set({ packId, guide: undefined, state: undefined, guideStatus: 'idle', changed: [] });
      persistCurrent();
    },
    async loadGuide(force = false) {
      const packId = snap.packId;
      if (!packId) return;
      if (!force && snap.guide?.packId === packId) return;
      if (!force && snap.guideStatus === 'loading') return;
      set({ guideStatus: 'loading', error: undefined });
      try {
        const [raw, pack] = await Promise.all([
          catalog.guide(packId),
          catalog.narration ? catalog.narration(packId) : Promise.resolve(null),
        ]);
        if (snap.packId !== packId) return;
        packNarration = pack;
        const { guide, narration, narrationStandIn } = withNarration(raw, mode());
        const restored = restoreSession(kv, guide);
        set({
          guide,
          narration,
          narrationStandIn,
          guideStatus: 'ready',
          state: restored?.state ?? initialState(guide),
          view: restored?.view ?? snap.view,
          changed: restored?.changed ?? [],
        });
      } catch (e) {
        if (snap.packId !== packId) return;
        set({ guideStatus: 'error', error: String(e) });
      }
    },
    /** True when this pack has a stored session (resume card, R-410). */
    hasSession: () => !!snap.state && snap.state.visited.length > 1,
    dispatch(a: FlowAction) {
      if (!snap.guide || !snap.state) return;
      const state = reduce(snap.guide, snap.state, a);
      if (state === snap.state) return;
      set({ state });
      save();
    },
    setView(view: View) {
      set({ view });
      save();
    },
    /** Re-resolve clips after the narration mode changed (S14); never plays (R-407). */
    refreshNarration() {
      if (!snap.guide || !snap.state) return;
      const next = withNarration({ ...snap.guide, audio: undefined }, mode());
      const same =
        next.narrationStandIn === snap.narrationStandIn &&
        [...next.narration].every(([id, c]) => snap.narration?.get(id)?.clip?.url === c.clip?.url);
      if (same) return;
      set({ ...next, state: syncAudio(next.guide, snap.state) });
    },
  };
}

export type FlowSession = ReturnType<typeof createFlowSession>;

let app: FlowSession | undefined;

/** The app's session (lazy, browser storage). Tests build their own with createFlowSession. */
export function flowSession(): FlowSession {
  app ??= createFlowSession(createCatalog(DATA_BASE), browserKV(), {
    narrationMode: () => loadSettings(browserStore()).settings.narrationMode,
    contentBase: CONTENT_BASE,
  });
  return app;
}

export function useFlow(session: FlowSession = flowSession()): FlowSnapshot {
  return useSyncExternalStore(session.subscribe, session.get, session.get);
}
