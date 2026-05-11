const CACHE_NAME = 'finanza-personale-v11';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icons/app-icon.svg',
  './src/app.js',
  './src/components/RecurringEntryModal.js',
  './src/components/TransactionModal.js',
  './src/components/UserMenu.js',
  './src/data/auth.js',
  './src/data/auth-accounts.js',
  './src/data/categories.js',
  './src/data/store.js',
  './src/pages/accounts.js',
  './src/pages/assistant.js',
  './src/pages/dashboard.js',
  './src/pages/monthly.js',
  './src/pages/profiles.js',
  './src/pages/report.js',
  './src/pages/salvadanaio.js',
  './src/pages/savings.js',
  './src/pages/settings.js',
  './src/pages/transactions.js',
  './src/styles/components.css',
  './src/styles/main.css',
  './src/styles/reset.css',
  './src/styles/variables.css',
  './src/utils/assistant.js',
  './src/utils/backendClient.js',
  './src/utils/calculations.js',
  './src/utils/formatters.js',
  './src/utils/helpers.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        });
      })
      .catch(() => caches.match('./index.html'))
  );
});
