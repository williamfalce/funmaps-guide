// Compass PWA service worker.
//
// Strategy: network-first, falling back to cache when offline. We deliberately
// don't pre-cache a fixed list of files, since Vite generates new hashed
// filenames (e.g. index-Xy9dQ.js) on every deploy — a hardcoded list would
// break the moment a new version ships. Instead, every successful network
// response gets cached on the fly, so whatever a visitor has actually loaded
// before stays available if they lose connection later.

const CACHE_NAME = "compass-cache-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Clean up old cache versions if CACHE_NAME is ever bumped in the future.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only handle GET requests — never intercept POSTs (API calls to Claude,
  // banners, etc.), since those should always hit the network live.
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache a copy of successful responses for offline fallback later.
        if (response && response.status === 200) {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
        }
        return response;
      })
      .catch(() => {
        // Network failed (offline) — try to serve whatever we've cached before.
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Nothing cached for this either — let it fail normally rather than
          // pretending we have something we don't.
          return new Response("Offline and this hasn't been loaded before.", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        });
      })
  );
});
