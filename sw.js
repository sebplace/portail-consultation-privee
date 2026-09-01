// Service worker : met en cache UNIQUEMENT la coquille statique de l'application.
// Il ne met JAMAIS en cache de données identifiantes, de rendez-vous ni de contenu
// clinique. Les données de démonstration vivent dans localStorage (jamais dans ce cache),
// et aucune requête réseau applicative n'est interceptée ni stockée : seules les
// ressources statiques listées ci-dessous (HTML/CSS/JS/icône/manifest) sont servies.
const CACHE = 'pcp-shell-v5';
const SHELL = [
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
// Ensemble des URLs de coquille (résolues en absolu) pour un contrôle strict.
const SHELL_URLS = new Set(SHELL.map((p) => new URL(p, self.registration.scope).href));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const href = request.url.split('#')[0].split('?')[0];
  const isShell = SHELL_URLS.has(href) || href === self.registration.scope;
  if (isShell) {
    // Coquille statique : cache d'abord, réseau en secours (fonctionne hors-ligne).
    e.respondWith(caches.match(request).then((r) => r || fetch(request)));
    return;
  }
  // Tout le reste (le cas échéant) : réseau direct, jamais mis en cache.
  e.respondWith(fetch(request).catch(() => caches.match('./index.html')));
});
