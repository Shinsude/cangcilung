const CACHE = 'cangcilung-v47';
const CORE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/sw-register.js',
  '/lib/utils.js',
  '/lib/render.js',
  '/lib/ui.js',
  '/lib/idb-storage.js',
  '/lib/ta.js',
  '/lib/ml.js',
  '/lib/affiliate.js',
  '/lib/mantra.js',
  '/cloud.js',
  '/manifest.webmanifest',
  'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js',
  'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.min.js',
  'https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/highlight.min.js'
];

self.addEventListener('install', function (e) {
  /* Toleran: cache aset yang berhasil, LEWATKAN yang gagal — jangan sampai
     satu aset CDN gagal bikin seluruh SW gagal install (yg membuat SW lama
     menetap & menyajikan tampilan usang + CSP lama). */
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(CORE.map(function (u) {
        return c.add(u).catch(function () { /* lewati aset yg gagal */ });
      }));
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
  if (url.origin === self.location.origin && (url.pathname === '/api/config' || url.pathname === '/api/quote')) return;
  if (url.origin === self.location.origin) {
    /* Network-first agar update terbaru selalu tampil; fallback cache jika offline.
       View terbaru tidak tertahan lama oleh cache service worker. */
    e.respondWith(
      fetch(e.request).then(function (res) {
        if (res && res.ok) {
          var clone = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, clone); });
        }
        return res;
      }).catch(function () {
        return caches.match(e.request).then(function (hit) { return hit || caches.match('/'); });
      })
    );
  }
});
