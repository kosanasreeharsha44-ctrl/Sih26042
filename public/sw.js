// ============================================================================
// BhashaSetu - Service Worker (Offline-First & Voice Asset Caching)
// Provides CacheStorage resilience for pre-rendered natural voice assets & TTS
// ============================================================================

const CACHE_STATIC_NAME = 'bhashasetu-static-v2';
const CACHE_VOICE_NAME = 'bhashasetu-voice-cache-v2';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/metadata.json'
];

// Install: precache foundational shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate: cleanup older cache versions & claim clients immediately
self.addEventListener('activate', (event) => {
  const allowedCaches = [CACHE_STATIC_NAME, CACHE_VOICE_NAME];
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (!allowedCaches.includes(key)) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch: intercept network requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Natural AI TTS API interceptor
  if (url.pathname.includes('/api/ai/tts')) {
    event.respondWith(
      fetch(event.request.clone())
        .then(async (networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            // Clone response and cache in voice cache
            try {
              const cache = await caches.open(CACHE_VOICE_NAME);
              // Save copy
              cache.put(event.request.url, networkResponse.clone());
            } catch (_) {
              // Ignore cache write error
            }
          }
          return networkResponse;
        })
        .catch(async () => {
          // Offline fallback for TTS API: check CacheStorage
          const cached = await caches.match(event.request.url);
          if (cached) return cached;

          // Return graceful offline fallback payload so client app never crashes
          return new Response(
            JSON.stringify({
              fallbackToBrowser: true,
              offlineVoiceActive: true,
              message: 'Using offline pre-rendered voice assets and local speech synthesis.'
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200
            }
          );
        })
    );
    return;
  }

  // 2. Audio assets / blobs
  if (url.pathname.match(/\.(wav|mp3|ogg|aac|m4a)$/i) || event.request.destination === 'audio') {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const copy = networkResponse.clone();
            caches.open(CACHE_VOICE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        }).catch(() => {
          return new Response(new Uint8Array(0), {
            status: 200,
            headers: { 'Content-Type': 'audio/wav' }
          });
        });
      })
    );
    return;
  }

  // 3. Static assets & HTML navigation: Stale-While-Revalidate with offline fallback
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok && event.request.method === 'GET') {
            const copy = networkResponse.clone();
            caches.open(CACHE_STATIC_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline and request is an HTML page navigation, return cached root
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html') || caches.match('/');
          }
          return null;
        });

      return cachedResponse || fetchPromise;
    })
  );
});
