/*
 * Sharp AI service worker.
 *
 * The point of this is a competition pit: patchy wifi, a phone, and a question.
 * So the rules differ by what is being fetched.
 *
 *  - Answers (/api/*) are NEVER served from cache. A stale answer about a rule
 *    is worse than no answer, and the site's whole claim is that what it says is
 *    backed by a section you can check today.
 *  - Pages are network-first with a cached fallback, so a dropped connection
 *    shows the last version of a page instead of the browser's error.
 *  - Static assets are cache-first: they are content-hashed, so a hit is
 *    always correct.
 */
const VERSION = 'sharp-ai-v2';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const OFFLINE = '/offline/';

// Trailing slashes, because that is what Pages serves and redirects to. Cached
// under '/path', a request for '/path/' missed and the fallback never fired —
// which is exactly the case this worker exists for.
const PRECACHE = ['/', '/chat/', '/path/', '/cad/', '/browse/', '/about/', OFFLINE,
  '/logo.svg', '/icon-192.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // Individually, not addAll: one 404 would reject the whole install and
    // leave the app with no worker at all.
    await Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Never cache an answer, a usage count, or anything else from the worker.
  if (url.pathname.startsWith('/api/') || url.hostname.endsWith('workers.dev')) return;
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const c = await caches.open(SHELL);
        c.put(request, fresh.clone());
        return fresh;
      } catch {
        // Try the request, then the same path with and without its trailing
        // slash, then the offline page. A near-miss on a slash is not a reason
        // to show the browser's error page.
        const alt = url.pathname.endsWith('/')
          ? url.pathname.slice(0, -1) || '/'
          : `${url.pathname}/`;
        return (await caches.match(request, { ignoreSearch: true }))
          || (await caches.match(url.pathname, { ignoreSearch: true }))
          || (await caches.match(alt, { ignoreSearch: true }))
          || (await caches.match(OFFLINE))
          || new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } });
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const hit = await caches.match(request);
    if (hit) return hit;
    try {
      const fresh = await fetch(request);
      if (fresh.ok && fresh.type === 'basic') {
        const c = await caches.open(ASSETS);
        c.put(request, fresh.clone());
      }
      return fresh;
    } catch {
      return hit || Response.error();
    }
  })());
});
