const CACHE_NAME = 'swingclips-cache-v4';
const PRE_CACHE = [
  '/',
  '/manifest.json',
  '/ffmpeg/ffmpeg-core.js',
  '/ffmpeg/ffmpeg-core.wasm',
  '/ffmpeg/ffmpeg-core.worker.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRE_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Strategy: Network-First, but auto-cache EVERYTHING from our own origin
  // This captures all the Next.js JS/CSS chunks automatically
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          // If it's a cross-origin or error, just return it (with headers if basic)
          return injectHeaders(response);
        }

        // Clone and save to cache for next time
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return injectHeaders(response);
      })
      .catch(() => {
        // Offline: Return from cache
        return caches.match(event.request);
      })
  );
});

function injectHeaders(response) {
  if (!response || response.status === 0) return response;

  const newHeaders = new Headers(response.headers);
  newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
  newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
  newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
