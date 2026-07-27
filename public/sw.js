// Service worker: makes the site work with the network unplugged, including a
// reload. Scanning already worked offline once the engine was cached, but the
// page itself did not survive a refresh, and "pull the plug and it still
// works" is one of the three checks the homepage invites visitors to run.
//
// Three rules, because one strategy would be wrong for at least one of these:
//
//   navigation (HTML) -> network first, cache as fallback.
//       This is a scanner. A visitor who is online should get the current
//       detection logic, not whatever was cached last week. Offline, the
//       cached copy is strictly better than the dinosaur.
//   /_astro/*         -> cache first.
//       Content-addressed: the filename changes when the bytes do, so a hit
//       is always correct and revalidation can only cost a round trip. This
//       is what makes an offline scan possible at all — the worker re-imports
//       the scanner module and the 10 MB wasm on every scan.
//   everything else    -> cache first, refreshed in the background.
//       Demo PDFs, the favicon, og.png. Staleness here is harmless.
//
// Nothing about a scanned file is cached, because nothing about a scanned file
// is ever requested: the scan happens in a worker on bytes read from disk.

const CACHE = 'whatsinmypdf-v1';

self.addEventListener('install', (event) => {
  // No precache list: the asset filenames are build-generated hashes, and a
  // list baked in here would go stale on the next deploy. Everything is
  // cached as it is genuinely used, which for this site means the first visit
  // covers the page and the first scan covers the engine.
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions of this worker.
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

function isHashedAsset(url) {
  return url.pathname.startsWith('/_astro/');
}

// ignoreVary on every lookup: the origin serves these with `Vary: Origin`,
// and a module-script request carries an Origin header while the plain fetch
// that warmed the cache does not. Honouring Vary there means a cached file is
// never returned to the import that needs it — the page loads offline and then
// fails to hydrate, which is the failure this worker exists to prevent. These
// responses do not actually differ by origin; they are static files.
const MATCH = { ignoreVary: true };

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, MATCH);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function cacheFirstRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, MATCH);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit);
  return hit ?? network;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const hit = await cache.match(request, MATCH);
    if (hit) return hit;
    // No cached copy and no network: let the browser show its own offline
    // error rather than inventing a page that might look like a scan result.
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never let a cached copy of the worker script outlive a deploy.
  if (url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  } else if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(cacheFirstRevalidate(request));
  }
});
