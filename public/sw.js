const CACHE_NAME = 'swingclips-cache-v14';
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
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // SURGICAL INTERCEPTION:
  // Only intercept requests for the /ffmpeg/ directory to provide caching.
  // We leave ALL Next.js internal chunks and workers alone so that Safari
  // handles them natively without the "foreign origin" bug.
  if (url.pathname.includes('/ffmpeg/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      })
    );
  }
  
  // For everything else, do NOT call event.respondWith().
  // This allows the browser to handle the fetch directly.
});
