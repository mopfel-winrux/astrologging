/* astro service worker: makes the app installable and usable offline.
 * shell + data: stale-while-revalidate (serve cache, refresh in background)
 * ship state:   network first, cached copy when the ship is unreachable
 * DSS images:   cache on first load
 */
const VERSION = 'astro-v7';
const SHELL = ['/astro/', '/astro/index.html', '/astro/app.js', '/astro/planets.js', '/astro/style.css', '/astro/tile.svg', '/astro/manifest.json',
  '/astro/data/catalog.jsn', '/astro/data/stars.jsn', '/astro/data/lines.jsn'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (same && url.pathname.startsWith('/~/scry/astro/')) {
    e.respondWith(fetch(req).then((r) => { if (r.ok) caches.open(VERSION).then((c) => c.put(req, r.clone())); return r; })
      .catch(() => caches.match(req).then((r) => r || new Response('{"offline":true}', { status: 503, headers: { 'Content-Type': 'application/json' } }))));
    return;
  }
  if (same && (url.pathname === '/astro' || url.pathname.startsWith('/astro/'))) {
    const key = url.pathname === '/astro' ? '/astro/' : req;
    e.respondWith(caches.match(key).then((cached) => {
      const net = fetch(req).then((r) => { if (r.ok) caches.open(VERSION).then((c) => c.put(key, r.clone())); return r; }).catch(() => cached);
      return cached || net;
    }));
    return;
  }
  if (url.hostname === 'alasky.cds.unistra.fr') {
    e.respondWith(caches.match(req).then((cached) => cached || fetch(req).then((r) => { caches.open(VERSION + '-img').then((c) => c.put(req, r.clone())); return r; })));
  }
});
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });
