// App-shell caching service worker (spec §13.2: "local cache allows ...
// dispensing if internet outage"). No PWA library — a stale-while-revalidate
// cache for same-origin static assets is a well-understood, low-risk pattern
// to hand-roll (unlike, say, QR encoding, this has no "looks right but is
// subtly wrong" failure mode). API requests are deliberately never cached
// here — they need fresh data, and the offline write path (dispensing) is
// handled by the app's own IndexedDB queue (see src/lib/offline/), not by
// intercepting API responses.

const CACHE_NAME = 'pms-shell-v1';
const CORE_ASSETS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => {}), // best-effort — a failed precache shouldn't block install
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/')) return; // never cache API calls
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      // Cache-first for instant load; network still runs to keep the cache fresh.
      return cached || network;
    }),
  );
});
