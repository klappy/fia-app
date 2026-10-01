// Service worker entry: wires the C-07 engine to the worker globals. Built by vite-plugin-pwa
// (`injectManifest`, no Workbox runtime) to `/sw.js`; registered only in production builds
// (src/offline/register.ts). A new worker waits until the person taps Reload (R-704).
import { createEngine, type OfflineRequest } from './engine';

// Minimal worker typings (the project compiles against the DOM lib; `webworker` conflicts).
interface ExtendableEvent extends Event {
  waitUntil(p: Promise<unknown>): void;
}
interface SwMessageEvent extends ExtendableEvent {
  data: unknown;
  ports: readonly MessagePort[];
}
interface FetchEvent extends ExtendableEvent {
  request: Request;
  respondWith(r: Promise<Response>): void;
}
interface WorkerSelf {
  caches: CacheStorage;
  location: Location;
  clients: {
    matchAll(o?: {
      includeUncontrolled?: boolean;
    }): Promise<Array<{ postMessage(m: unknown): void }>>;
    claim(): Promise<void>;
  };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', fn: (e: ExtendableEvent) => void): void;
  addEventListener(type: 'message', fn: (e: SwMessageEvent) => void): void;
  addEventListener(type: 'fetch', fn: (e: FetchEvent) => void): void;
}
declare const self: WorkerSelf;

const engine = createEngine({
  caches: self.caches,
  fetch: (input, init) => fetch(input, init),
  origin: self.location.origin,
  appVersion: import.meta.env.VITE_FIA_RELEASE || undefined,
  broadcast: async (message) => {
    for (const client of await self.clients.matchAll({ includeUncontrolled: true }))
      client.postMessage(message);
  },
  skipWaiting: () => self.skipWaiting(),
});

self.addEventListener('install', (event) => {
  event.waitUntil(engine.installShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(engine.activateShell().then(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  const port = event.ports[0];
  event.waitUntil(engine.handleMessage(event.data as OfflineRequest, port));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const req = event.request;
  event.respondWith(
    engine
      .handleFetch({ url: req.url, method: req.method, mode: req.mode })
      .then((res) => res ?? fetch(req)),
  );
});
