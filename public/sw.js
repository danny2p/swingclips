const CACHE_NAME = 'swingclips-cache-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/ffmpeg/ffmpeg-core.js',
  '/ffmpeg/ffmpeg-core.wasm',
  '/ffmpeg/ffmpeg-core.worker.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Use a proxy strategy to inject security headers
  // This allows FFmpeg.wasm to work on hosts that strip COOP/COEP headers
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If the response is already valid, clone it and add headers
        if (response.status === 0) return response;

        const newHeaders = new Headers(response.headers);
        newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
        newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      })
      .catch(() => {
        // Fallback to cache for offline support
        return caches.match(event.request);
      })
  );
});
