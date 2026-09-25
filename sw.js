// Offline support: the app shell is cached so an assessment can be filled in
// without signal. Weather needs the network; without it, weather checks are
// skipped and the app says so.
const CACHE = 'streamcheck-v3';
const SHELL = [
  './', './index.html', './styles.css', './manifest.webmanifest', './icon.svg',
  './src/app.js', './src/protocol.js', './src/checks.js', './src/score.js', './src/fhir.js',
  './src/weather.js', './src/examples.js', './src/oah-sites.js', './src/evidence.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname === 'api.open-meteo.com') return; // weather is always live
  // Network first for the app itself, so updates arrive; cache as fallback.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && (url.origin === location.origin || url.hostname.endsWith('cdnjs.cloudflare.com') || url.hostname === 'tile.openstreetmap.org')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
  );
});
