const CACHE_NAME = 'swingclips-cache-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/ffmpeg/ffmpeg-core.js',
  '/ffmpeg/ffmpeg-core.wasm',
  '/ffmpeg/ffmpeg-core.worker.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Immediately take control of the page without waiting for a refresh
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Only intercept same-origin requests or specific CDN requests to avoid CORS issues
  // But ensure COOP/COEP are applied to make SharedArrayBuffer work
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 0) return response; // Handled by browser

        const newHeaders = new Headers(response.headers);
        newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
        newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
        newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin'); // Critical for allowing resources

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      })
      .catch(() => caches.match(event.request))
  );
});
