import { test, expect } from '@playwright/test';

// "Load it, pull the plug, it still works" is one of the three checks the
// homepage asks visitors to run, and the only one that needed a service
// worker. Everything here was broken at some point while building it, in ways
// that all looked identical from the outside (a blank page), so each step is
// asserted separately:
//
//   - the HTML has to survive a reload (it was not cached at all: registration
//     happens on load, after the page has already been fetched)
//   - the island chunks have to be there too (they arrive via dynamic import,
//     so a DOM scan for <script src> misses them, and one of them lands after
//     the worker takes control)
//   - a cached file has to actually be handed to the import that wants it
//     (`Vary: Origin` on the response versus an Origin header on a module
//     request means cache.match misses without ignoreVary — the page loads and
//     then fails to hydrate)
//   - and the scan itself has to run, which is the point of the exercise
test('after one visit, the site loads and scans with the network cut', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => !document.querySelector('astro-island')?.hasAttribute('ssr'));
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 30_000,
  });

  // One scan online: this is what pulls the engine into the cache.
  await page.setInputFiles('input[type=file]', 'tests/fixtures/white_text.pdf');
  await expect(page.getByText('prompt_injection', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  // The second warm-up pass runs on requestIdleCallback; wait for the chunk it
  // exists to catch rather than for a duration.
  await page.waitForFunction(
    async () => {
      const cache = await caches.open('whatsinmypdf-v1');
      const keys = await cache.keys();
      const paths = keys.map((r) => new URL(r.url).pathname);
      return (
        paths.some((p) => p.includes('client.')) &&
        paths.some((p) => p.includes('Scanner.')) &&
        paths.some((p) => p.endsWith('.wasm'))
      );
    },
    null,
    { timeout: 30_000 },
  );

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.querySelector('astro-island')?.hasAttribute('ssr'), null, {
    timeout: 30_000,
  });

  await page.setInputFiles('input[type=file]', 'tests/fixtures/hidden_layer.pdf');
  await expect(page.getByText('hidden_layers', { exact: true })).toBeVisible({ timeout: 40_000 });
  await context.setOffline(false);
});
