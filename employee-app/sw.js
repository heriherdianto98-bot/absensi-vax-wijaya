/* Offline install shell only. Employee pages, sessions, and API data are never cached. */
const CACHE = 'vax-employee-install-v1';
const APP = '/employee-app/';
const ASSETS = [
  APP + 'index.html',
  APP + 'manifest.json',
  APP + 'install.js',
  APP + 'icon-192.png',
  APP + 'icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('vax-employee-install-') && key !== CACHE)
        .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' ||
      url.origin !== self.location.origin ||
      !url.pathname.startsWith(APP)) return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request, { ignoreSearch: true }).then(response =>
        response || caches.match(APP + 'index.html')
      )
    )
  );
});
