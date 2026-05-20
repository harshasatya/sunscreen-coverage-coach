/**
 * Service Worker — Sunscreen Coverage Coach
 * Strategy: cache-first for app shell; network-only passthrough for cross-origin
 * (CDN, API) requests so MediaPipe/Transformers.js CDN imports are not intercepted.
 */

const CACHE_NAME = 'suncoach-v2';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './data/zones.json',
  './js/app.js',
  './js/camera.js',
  './js/mediapipe-loader.js',
  './js/face-mesh.js',
  './js/zones.js',
  './js/coverage-analyzer.js',
  './js/model-downloader.js',
  './js/heatmap-renderer.js',
  './js/uv-api.js',
  './js/storage.js',
  './js/scheduler.js',
  './js/analyzers/features.js',
  './js/analyzers/symmetry.js',
  './js/analyzers/uniformity.js',
  './js/analyzers/differential.js',
  './js/llm/runtime.js',
  './js/llm/prompts.js',
  './js/llm/backends/gemma3n.js',
  './js/llm/backends/smolvlm.js',
  './js/llm/backends/claude.js',
  './js/ui/onboarding.js',
  './js/ui/capture.js',
  './js/ui/results.js',
  './js/ui/history.js',
  './js/ui/settings.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('suncoach-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Pass cross-origin requests (CDN, APIs) straight to network
  if (url.origin !== self.location.origin) return;

  // Cache-first for same-origin app shell
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      });
    })
  );
});
