// Service worker registration and first-visit cache warm-up.
//
// Lives in its own module rather than inline in BaseLayout so the intent has
// room to be explained; Astro may still inline it, which is why
// tests/e2e/csp.spec.ts checks the CSP hashes against the build.
//
// Fire-and-forget by design: without a service worker the site behaves
// identically, it just stops surviving a reload with the network unplugged.

// Re-request what this page is built from, so it passes through the freshly
// installed worker and lands in its cache.
//
// Without this, the first visit caches nothing: registration happens on
// `load`, by which point the HTML, the scripts and the stylesheet have all
// been fetched already, outside the worker's reach. The visitor would have to
// come back a second time before "pull the plug and reload" worked — and the
// homepage tells them to try it now. These re-requests are served from the
// browser's own HTTP cache, so they cost close to nothing.
function warmCache(): void {
  // Driven by what the browser actually loaded, not by what is visible in the
  // markup: Astro's island runtime pulls its component chunks in with dynamic
  // import(), so they never appear as <script src> and a DOM scan misses
  // exactly the files the scanner needs to hydrate.
  const urls = new Set<string>([window.location.href]);
  for (const entry of performance.getEntriesByType('resource')) {
    if (entry.name.startsWith(`${window.location.origin}/`)) urls.add(entry.name);
  }
  for (const url of urls) {
    void fetch(url).catch(() => {
      // Offline already, or the asset moved. Nothing to do about it here.
    });
  }
}

// Twice, because one pass races the page. The worker takes control partway
// through hydration, and a chunk still in flight at that moment (Astro's
// client runtime, measured) is missing from the resource list the first pass
// reads — leaving the page loadable offline but unable to hydrate, which is
// worse than not caching at all. The second pass runs once the browser is
// idle and everything has landed; both are served by the HTTP cache.
function warmCacheTwice(): void {
  warmCache();
  // Not `'requestIdleCallback' in window`: that narrows window to never in the
  // else branch, since the DOM lib declares the method as always present.
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => warmCache(), { timeout: 5000 });
  } else {
    setTimeout(warmCache, 3000);
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => {
        // A worker that just installed does not control this page until it
        // claims it, and fetches made before that never reach it.
        if (navigator.serviceWorker.controller) warmCacheTwice();
        else
          navigator.serviceWorker.addEventListener('controllerchange', warmCacheTwice, {
            once: true,
          });
      })
      .catch(() => {
        // Unsupported, blocked by policy, or a private window. Nothing the
        // visitor can act on and nothing broken, so nothing is reported.
      });
  });
}
