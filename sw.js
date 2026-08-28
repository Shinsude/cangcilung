const CACHE = 'cangcilung-v28';
const CORE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/lib/fileparse.js',
  '/lib/safeeval.js',
  '/lib/utils.js',
  '/lib/stream.js',
  '/lib/search.js',
  '/lib/render.js',
  '/lib/ui.js',
  '/lib/idb-storage.js',
  '/lib/ta.js',
  '/kb.js',
  '/cloud.js',
  '/manifest.webmanifest',
  'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js',
  'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.min.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
  'https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/highlight.min.js',
  'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(CORE);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === self.location.origin && url.pathname === '/api/config') return;
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(function (hit) {
        var fetched = fetch(e.request).then(function (res) {
          if (res && res.ok) {
            var clone = res.clone();
            caches.open(CACHE).then(function (c) { c.put(e.request, clone); });
          }
          return res;
        }).catch(function () { return hit; });
        return hit || fetched;
      })
    );
  }
});
