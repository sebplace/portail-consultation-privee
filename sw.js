// Service worker minimal : coquille hors-ligne (app shell) pour la consultation.
// Les données restent en localStorage ; ceci ne met en cache que les fichiers statiques.
const CACHE = 'pcp-shell-v4';
const ASSETS = [
  './',
  './index.html',
  './assets/css/styles.css',
  './assets/icon.svg',
  './manifest.webmanifest',
  './assets/js/app.js',
  './assets/js/core/rules.js',
  './assets/js/core/availability.js',
  './assets/js/core/store.js',
  './assets/js/data/seed.js',
  './assets/js/views/dom.js',
  './assets/js/views/patient.js',
  './assets/js/views/secretary.js',
  './assets/js/views/doctor.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  // Stratégie "network first" avec repli cache (utile hors-ligne).
  e.respondWith(
    fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(request).then((r) => r || caches.match('./index.html'))),
  );
});
