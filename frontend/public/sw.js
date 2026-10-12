/* Service worker — app shell + pose model caching, offline API fallback for read-only data. */
const VERSION = 'v1';
const SHELL_CACHE = `physio-shell-${VERSION}`;
const RUNTIME_CACHE = `physio-runtime-${VERSION}`;
const API_CACHE = `physio-api-${VERSION}`;
const ALL_CACHES = [SHELL_CACHE, RUNTIME_CACHE, API_CACHE];

const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

// Cross-origin files needed to run the pose model and show fonts offline
const CACHEABLE_ORIGINS = [
  'https://storage.googleapis.com',
  'https://cdn.jsdelivr.net',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
];

// Read-only API calls that may be served from cache when offline
const API_GET_ALLOW = ['/api/exercises', '/api/assignments', '/api/sessions/my', '/api/users/me', '/api/programs/my'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !ALL_CACHES.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'CLEAR_API_CACHE') {
    event.waitUntil(caches.delete(API_CACHE));
  }
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const shell = await caches.match(fallbackUrl);
      if (shell) return shell;
    }
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never touch writes

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) {
      if (API_GET_ALLOW.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
        event.respondWith(networkFirst(request, API_CACHE));
      }
      return; // other API calls go straight to the network
    }
    if (request.mode === 'navigate') {
      event.respondWith(networkFirst(request, SHELL_CACHE, '/index.html'));
      return;
    }
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  if (CACHEABLE_ORIGINS.includes(url.origin)) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
  }
});
