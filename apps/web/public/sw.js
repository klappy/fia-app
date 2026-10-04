// Upgrade-only worker at the previous application's exact URL and scope.
// No fetch handler: requests use the network. Preserve all cache and storage data.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  await self.clients.claim();
  await self.registration.unregister();
})()));
