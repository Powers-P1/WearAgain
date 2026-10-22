/* Root-scoped WearAgain v1 PWA retirement, not a new caching worker.
 * Older clients registered /sw.js (scope /) and cached /, /app/ and /retailers/.
 * The new /sw.js must be real JavaScript, never the Pages HTML SPA fallback.
 * The separate v2 app PWA remains /app/sw.js (scope /app/).
 */
const LEGACY_PREFIX = 'wearagain-demo-';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.filter(name => name.startsWith(LEGACY_PREFIX))
      .map(name => caches.delete(name)));

    // Keep tabs before retiring this registration. Never unregister /app/sw.js.
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await self.registration.unregister();

    // Controlled pages can keep the old content until a navigation. Try to
    // reload same-origin windows after unregistration without clearing any
    // user data; closing tabs or permission failures are harmless.
    await Promise.all(tabs.map(async client => {
      try {
        if (new URL(client.url).origin === self.location.origin) {
          await client.navigate(client.url);
        }
      } catch {
        // Offline and closed pages will use the network on their next visit.
      }
    }));
  })());
});
