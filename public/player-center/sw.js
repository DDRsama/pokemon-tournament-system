const CACHE_NAME = 'pts-player-center-v3.2-i18n-1';
const STATIC_ASSETS = [
  '/player/',
  '/player/center.css?v=3.2-i18n-1',
  '/player/center.js?v=3.1-pwa-install',
  '/shared/i18n.js?v=3.2-i18n-1',
  '/shared/theme.css?v=3.2-i18n-1',
  '/shared/favicon.svg',
  '/shared/apple-touch-icon.png',
  '/shared/app-icon-192.png',
  '/shared/app-icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('pts-player-center-') && key !== CACHE_NAME)
          .map(key => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate' && url.pathname.startsWith('/player')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('/player/', copy));
          return response;
        })
        .catch(() => caches.match('/player/')),
    );
    return;
  }

  if (url.pathname.startsWith('/player/') || url.pathname.startsWith('/shared/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        });
      }),
    );
  }
});
