import { test, expect, type Page } from '@playwright/test';

// Same hydration wait as the e2e suite: Astro drops the <astro-island>'s `ssr`
// attribute only once React's listeners are attached.
async function gotoReady(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => !document.querySelector('astro-island')?.hasAttribute('ssr'));
}

// A CSP that blocks the hydration script or the module worker surfaces here
// first, as a "Refused to…" console error, before any assertion fails.
function collectCspErrors(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Refused to|Content Security Policy/i.test(m.text())) {
      violations.push(m.text());
    }
  });
  return violations;
}

test('the deployed scanner loads its WASM engine and produces a real report', async ({
  page,
  baseURL,
}) => {
  const cspErrors = collectCspErrors(page);
  const offOrigin: string[] = [];
  const origin = new URL(baseURL!).hostname;
  page.on('request', (r) => {
    if (new URL(r.url()).hostname !== origin) offOrigin.push(r.url());
  });

  await gotoReady(page, '/');
  await page.getByRole('button', { name: 'Résumé with hidden instructions', exact: true }).click();

  // The category-id badge only renders inside a real ReportView finding group,
  // so this proves the WASM engine actually ran on the live deployment rather
  // than the static "What we detect" section being visible.
  const group = page
    .locator('section.overflow-hidden')
    .filter({ has: page.getByText('prompt_injection', { exact: true }) });
  await expect(group).toBeVisible({ timeout: 60_000 });

  expect(cspErrors).toEqual([]);
  // The homepage tells visitors to open their network tab during a scan and
  // see for themselves. This is that check, run against production on every
  // deploy: a full scan contacts this origin and nothing else — no analytics,
  // no CDN, no font host. Edge-injected scripts count too, which is how the
  // zone's Web Analytics beacon was caught. The stronger claim — that no
  // request anywhere carries the PDF — is covered by the e2e suite, which
  // asserts zero non-GET requests against a local build.
  expect(offOrigin).toEqual([]);
});

test('the deployed zh scanner produces a report too', async ({ page }) => {
  const cspErrors = collectCspErrors(page);

  await gotoReady(page, '/zh');
  await page.getByRole('button', { name: '藏有隐藏指令的简历', exact: true }).click();

  const group = page
    .locator('section.overflow-hidden')
    .filter({ has: page.getByText('prompt_injection', { exact: true }) });
  await expect(group).toBeVisible({ timeout: 60_000 });
  await expect(group.getByRole('heading', { level: 3, name: '提示词注入' })).toBeVisible();

  expect(cspErrors).toEqual([]);
});

// The claim the homepage makes to anyone who doubts "runs locally": load the
// page, pull the plug, scan anyway. It only holds while /_astro/* is served
// immutable — with a revalidating cache header the worker's module import
// fails offline and the scan dies at "Loading scan engine…". Cloudflare's
// default was exactly that, so this test guards a header, not a feature.
test('a second scan still works with the network cut', async ({ page, context }) => {
  await gotoReady(page, '/');
  await page.getByRole('button', { name: 'Résumé with hidden instructions', exact: true }).click();
  await expect(
    page
      .locator('section.overflow-hidden')
      .filter({ has: page.getByText('prompt_injection', { exact: true }) }),
  ).toBeVisible({ timeout: 60_000 });

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Scan another file', exact: true }).click();
  // A local fixture, not one of the /demo/ files: those would need a fetch,
  // and the point here is that no fetch is left to make.
  await page.setInputFiles('input[type=file]', 'tests/fixtures/hidden_layer.pdf');
  await expect(
    page
      .locator('section.overflow-hidden')
      .filter({ has: page.getByText('hidden_layers', { exact: true }) }),
  ).toBeVisible({ timeout: 60_000 });
  await context.setOffline(false);
});

// The homepage's second check, end to end against the deployed site: visit,
// scan, pull the plug, reload, scan again. It depends on real response headers
// (the origin's `Vary: Origin` is why the worker has to match with ignoreVary)
// and on the deployed service worker actually taking control, neither of which
// a local preview proves.
test('after one visit the deployed site reloads and scans with the network cut', async ({
  page,
  context,
}) => {
  await gotoReady(page, '/');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 60_000,
  });

  await page.getByRole('button', { name: 'Résumé with hidden instructions', exact: true }).click();
  await expect(
    page
      .locator('section.overflow-hidden')
      .filter({ has: page.getByText('prompt_injection', { exact: true }) }),
  ).toBeVisible({ timeout: 60_000 });

  // Wait on the cache reaching the state that makes the claim true, not on a
  // duration: the second warm-up pass runs when the browser goes idle.
  await page.waitForFunction(
    async () => {
      const cache = await caches.open('whatsinmypdf-v1');
      const paths = (await cache.keys()).map((r) => new URL(r.url).pathname);
      return (
        paths.some((p) => p.includes('client.')) &&
        paths.some((p) => p.includes('Scanner.')) &&
        paths.some((p) => p.endsWith('.wasm'))
      );
    },
    null,
    { timeout: 60_000 },
  );

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.querySelector('astro-island')?.hasAttribute('ssr'), null, {
    timeout: 60_000,
  });
  await page.setInputFiles('input[type=file]', 'tests/fixtures/hidden_layer.pdf');
  await expect(
    page
      .locator('section.overflow-hidden')
      .filter({ has: page.getByText('hidden_layers', { exact: true }) }),
  ).toBeVisible({ timeout: 60_000 });
  await context.setOffline(false);
});

test('the service worker script is never served from a stale cache', async ({ request }) => {
  const res = await request.get('/sw.js');
  expect(res.status()).toBe(200);
  // Cloudflare dropped a bare `no-cache` here without a word; this catches the
  // rule going quiet again after a config or platform change.
  expect(res.headers()['cache-control']).toContain('must-revalidate');
});

test('hashed build assets are served immutable', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const asset = html.match(/\/_astro\/[A-Za-z0-9_.-]+\.js/)?.[0];
  expect(asset, 'no /_astro/ asset found in the homepage HTML').toBeTruthy();

  const res = await request.get(asset!);
  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toContain('immutable');
});

test('production serves the crawler and security endpoints', async ({ request }) => {
  for (const path of ['/robots.txt', '/sitemap-index.xml', '/.well-known/security.txt']) {
    const res = await request.get(path);
    expect(res.status(), `${path} should be 200`).toBe(200);
  }
});

test('production sends the hardening headers from public/_headers', async ({ request }) => {
  const res = await request.get('/');
  const headers = res.headers();

  // Not a full copy of the header file — just the parts whose loss would
  // silently weaken the site while every page still rendered fine.
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['content-security-policy']).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  // No host beyond 'self' anywhere in the policy. Written as an assertion on
  // the header text because the request-level check above only sees hosts a
  // page actually contacted; this one fails even if the third party is idle.
  expect(headers['content-security-policy']).not.toMatch(/https?:\/\//);
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
});
