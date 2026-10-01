import { describe, expect, it } from 'vitest';
import { EN } from '../src/i18n';
import { OfflineClient } from '../src/offline/client';
import type { PackStatus } from '../src/offline/engine';
import { saveRowState } from '../src/offline/tiers';
import { firstRunRedirect, whereName } from '../src/screens/routing';

// Persona gate rerun4 defects (cookbook PR #51).
describe('S16 back label names the screen you return to', () => {
  it('uses the screen name when the title is a parametrized headline (S18)', () => {
    expect(whereName('S18')).toBe('Completion');
    expect(whereName('S18')).not.toContain('{');
  });
  it('keeps plain titles and the Guide fallback', () => {
    expect(whereName('S13')).toBe(EN['s.downloads.title']);
    expect(whereName(undefined)).toBe(EN['s.common.dock.guide']);
  });
});

describe('S01 skips the picker once a language is chosen', () => {
  it('first run shows the picker', () => {
    expect(firstRunRedirect(undefined, '')).toBeNull();
  });
  it('reopening at / goes to the Library', () => {
    expect(firstRunRedirect('spa', '')).toBe('/library');
  });
  it('More → Language (?mode=use) still shows the picker', () => {
    expect(firstRunRedirect('spa', '?mode=use')).toBeNull();
  });
});

describe('save row never flashes Save between the last file and Saved', () => {
  it('stays saving until STATUS reports the pack saved', async () => {
    const packId = 'spa.MRK-1-1-13';
    let saved = false;
    const controller = {
      postMessage(msg: { type: string }, transfer?: Transferable[]) {
        const port = (transfer?.[0] as MessagePort) ?? null;
        if (!port) return;
        if (msg.type === 'SAVE') {
          port.postMessage({ progress: true, packId, bytes: 6, total: 6, files: 6, count: 6 });
          saved = true;
          setTimeout(() => port.postMessage({ packId, state: 'saved' }), 5);
        } else if (msg.type === 'STATUS') {
          const packs: Partial<PackStatus>[] = saved ? [{ packId, state: 'saved' }] : [];
          setTimeout(() => port.postMessage({ packs }), 20);
        }
      },
    };
    const c = new OfflineClient({
      container: {
        controller,
        register: async () => ({ addEventListener: () => undefined }),
        addEventListener: () => undefined,
      },
    });
    const rows: string[] = [];
    c.subscribe(() => {
      const st = c.snapshot();
      rows.push(saveRowState(packId, st.packs, st.saving).state);
    });
    await c.save(packId, 'text', 'source-fallback');
    expect(rows).toContain('saving');
    expect(rows.at(-1)).toBe('saved');
    const firstSaved = rows.indexOf('saved');
    expect(rows.slice(rows.indexOf('saving'), firstSaved)).not.toContain('none');
  });
});
