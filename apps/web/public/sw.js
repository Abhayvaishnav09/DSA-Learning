/*
 * LogicPath service worker (PWA): learning keeps working on a flaky connection.
 *
 * - Built assets (/_next/static/*) never change once built: cache-first.
 * - Pages: network-first, falling back to the last copy seen, so an installed app opens offline.
 * - API calls are never cached here: the app's own data layer decides what is fresh.
 */
const VERSION = 'v1';
const STATIC = `lp-static-${VERSION}`;
const PAGES = `lp-pages-${VERSION}`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.match(/\.(?:svg|png|woff2)$/)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(PAGES).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(
          async () =>
            (await caches.match(request)) ?? (await caches.match('/learn')) ?? Response.error(),
        ),
    );
  }
});
