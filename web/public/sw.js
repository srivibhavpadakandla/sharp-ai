/*
 * Tombstone.
 *
 * The installable-app change was reverted, but a service worker that is already
 * registered on someone's phone does not disappear when the files do — it keeps
 * running and keeps serving its cache, and it only ever checks this URL. So the
 * file has to stay and has to be a worker that removes itself.
 *
 * Deleting it instead would leave anyone who opened the site during that window
 * on a cached copy indefinitely, with no way to push them a fix. This unregisters
 * on activation and deletes every cache it made.
 *
 * Safe to delete once nobody is on the old worker.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('sharp-ai-')).map((k) => caches.delete(k)));
    await self.registration.unregister();
    // Reload the open tabs so they leave the worker's control immediately
    // rather than at some later navigation.
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const c of clients) c.navigate(c.url).catch(() => {});
  })());
});

/* No fetch handler at all: every request goes straight to the network. */
