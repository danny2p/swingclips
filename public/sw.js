const CACHE_NAME = 'swingclips-cache-v1';
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
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
