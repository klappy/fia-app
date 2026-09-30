import { describe, expect, it } from 'vitest';
import { detectPlatform, InstallController, type InstallHost } from '../src/offline/install';
import {
  largestPacks,
  mb,
  requestPersist,
  storageWarningFor,
  readStorage,
} from '../src/offline/storage';
import { OfflineClient, packRef } from '../src/offline/client';
import type { PackStatus } from '../src/offline/engine';

// Ported from the PoC tests/install.test.mjs (POC-REFERENCE § 7: install.js PORT).
function fixture() {
  const host = new EventTarget() as EventTarget & InstallHost;
  host.navigator = {};
  const media = new EventTarget() as EventTarget & { matches: boolean };
  media.matches = false;
  host.matchMedia = () => media;
  return { host, media, controller: new InstallController(host) };
}
type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

describe('install controller (R-701)', () => {
  it('install offer is consumed once; dismissal does not claim installation', async () => {
    const { host, controller } = fixture();
    let calls = 0;
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Prompt;
    event.prompt = async () => {
      calls++;
    };
    event.userChoice = Promise.resolve({ outcome: 'dismissed' });
    host.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(controller.snapshot().available).toBe(true);
    await controller.install();
    await controller.install();
    expect(calls).toBe(1);
    expect(controller.snapshot().accepted).toBe(false);
    expect(controller.snapshot().available).toBe(false);
    controller.dispose();
  });

  it('browser acceptance and launch mode are separate, with no persistent installed flag', () => {
    const { host, media, controller } = fixture();
    host.dispatchEvent(new Event('appinstalled'));
    expect(controller.snapshot().accepted).toBe(true);
    expect(controller.snapshot().standalone).toBe(false);
    media.matches = true;
    media.dispatchEvent(new Event('change'));
    expect(controller.snapshot().standalone).toBe(true);
    controller.dispose();
    media.matches = false;
    const next = new InstallController(host);
    expect(next.snapshot().accepted).toBe(false);
    next.dispose();
  });

  it('missing or failed installation event is recoverable and never installed', async () => {
    const { host, controller } = fixture();
    await controller.install();
    expect(controller.snapshot().available).toBe(false);
    const event = new Event('beforeinstallprompt') as Prompt;
    event.prompt = async () => {
      throw new Error('blocked');
    };
    host.dispatchEvent(event);
    await controller.install();
    expect(controller.snapshot().error).toBeTruthy();
    expect(controller.snapshot().accepted).toBe(false);
    expect(controller.snapshot().pending).toBe(false);
    controller.dispose();
  });

  it('detects the platform for the assisted steps (S17)', () => {
    expect(
      detectPlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }),
    ).toBe('ios');
    expect(
      detectPlatform({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        maxTouchPoints: 5,
      }),
    ).toBe('ios');
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' })).toBe(
      'android',
    );
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })).toBe('desktop');
  });
});

describe('storage (R-703, R-311)', () => {
  it('reads quota and persistence, and logs the persist request', async () => {
    const storage = {
      estimate: async () => ({ usage: 61_000_000, quota: 1_261_000_000 }),
      persisted: async () => false,
      persist: async () => true,
    };
    expect(await readStorage(storage)).toEqual({
      supported: true,
      usage: 61_000_000,
      quota: 1_261_000_000,
      persisted: false,
    });
    const log: string[] = [];
    expect(await requestPersist(storage, (l) => log.push(l))).toBe(true);
    expect(log[0]).toMatch(/persist requested: granted/);
    expect(await readStorage(undefined)).toEqual({ supported: false });
    expect(await requestPersist(undefined, (l) => log.push(l))).toBeUndefined();
    expect(log[1]).toMatch(/unavailable/);
  });

  it('chooses the SH-4 variant and lists the largest packs without removing any', () => {
    expect(
      storageWarningFor(50e6, { supported: true, usage: 0, quota: 10e6, persisted: true }),
    ).toBe('space');
    expect(
      storageWarningFor(1e6, { supported: true, usage: 0, quota: 10e6, persisted: false }),
    ).toBe('persist');
    expect(
      storageWarningFor(1e6, { supported: true, usage: 0, quota: 10e6, persisted: true }),
    ).toBeNull();
    const p = (packId: string, bytes: number, state: PackStatus['state'] = 'saved') =>
      ({
        done: true,
        packId,
        bytes,
        state,
        saved: true,
        updateAvailable: false,
        corrupt: false,
      }) as PackStatus;
    const packs = [
      p('a.MRK-1-1-2', 5),
      p('b.MRK-1-1-2', 50),
      p('c.MRK-1-1-2', 500, 'partial'),
      p('d.MRK-1-1-2', 20),
    ];
    expect(largestPacks(packs, 2).map((x) => x.packId)).toEqual(['b.MRK-1-1-2', 'd.MRK-1-1-2']);
    expect(packs).toHaveLength(4);
    expect(mb(22_400_000)).toBe('22');
    expect(mb(1_700_000)).toBe('1.7');
    expect(mb(93)).toBe('0.1');
  });
});

describe('offline client (R-704, R-310)', () => {
  it('without a worker it reports unavailable instead of pretending to save', async () => {
    const c = new OfflineClient({});
    expect(c.snapshot().supported).toBe(false);
    await expect(c.request({ type: 'STATUS' })).rejects.toThrow('unavailable');
  });

  it('a waiting worker raises updateReady; Reload posts SKIP_WAITING and reloads on takeover', async () => {
    const posted: unknown[] = [];
    const listeners: Record<string, (e: MessageEvent) => void> = {};
    const waiting = { postMessage: (m: unknown) => posted.push(m) };
    const reg = { active: null, waiting, installing: null, addEventListener: () => undefined };
    let reloaded = 0;
    const c = new OfflineClient({
      container: {
        controller: { postMessage: () => undefined },
        register: async () => reg,
        addEventListener: (t, fn) => (listeners[t] = fn),
      },
      reload: () => reloaded++,
    });
    // STATUS on the controller never answers in this fixture; do not await refresh.
    void c.register();
    await new Promise((r) => setTimeout(r, 0));
    expect(c.snapshot().updateReady).toBe(true);
    expect(reloaded).toBe(0); // never applied without the tap
    c.applyUpdate();
    expect(posted).toEqual([{ type: 'SKIP_WAITING' }]);
    listeners.controllerchange?.({} as MessageEvent);
    expect(reloaded).toBe(1);
  });

  it('decline is remembered per revision', () => {
    const c = new OfflineClient({});
    c.decline('spa.MRK-1-1-13', 'a'.repeat(64));
    expect(c.snapshot().declined['spa.MRK-1-1-13']).toBe('a'.repeat(64));
  });

  it('formats pack refs for display', () => {
    expect(packRef('spa.MRK-1-1-13')).toBe('MRK 1:1–13');
    expect(packRef('arb.GEN-1-1-2-3')).toBe('GEN 1:1–2:3');
    expect(packRef('eng.PSA-23-1')).toBe('PSA 23:1');
  });
});
