// Palvelutyöntekijä: vain saman alkuperän staattiset tiedostot (verkko ensin, välimuisti varalla).
// Firebase- ja CDN-pyyntöjä ei käsitellä, joten tulokset haetaan aina suoraan verkosta.
// Välimuistin nimi seuraa sovelluksen versiota: index.html rekisteröi tiedoston muodossa sw.js?v=APP_VERSION.
// Uusi versio = uusi skriptin URL, joten selain asentaa palvelutyöntekijän uudelleen ja vanhat välimuistit poistetaan.
const CACHE_PREFIX = '3era-';
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = CACHE_PREFIX + VERSION;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then(m => m || caches.match('./')))
  );
});
