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

// Cloudflare Web Analytics, injected into the HTML at the edge (see the
// comment in public/_headers). It is the only third party the deployed page is
// allowed to talk to, and it is disclosed on /privacy. Anything else appearing
// during a scan is a regression worth failing the deploy over.
const ALLOWED_THIRD_PARTY_HOSTS = ['static.cloudflareinsights.com', 'cloudflareinsights.com'];

test('the deployed scanner loads its WASM engine and produces a real report', async ({
  page,
  baseURL,
}) => {
  const cspErrors = collectCspErrors(page);
  const unexpectedHosts: string[] = [];
  const origin = new URL(baseURL!).hostname;
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (host !== origin && !ALLOWED_THIRD_PARTY_HOSTS.includes(host)) unexpectedHosts.push(r.url());
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
  // The privacy guarantee, asserted against production and not just a local
  // preview: during a full scan the page talks to its own origin and to the
  // disclosed analytics host, and to nothing else. The stronger claim — that
  // no request anywhere carries the PDF — is covered by the e2e suite, which
  // asserts zero non-GET requests against a local build.
  expect(unexpectedHosts).toEqual([]);
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
  // The edge-injected analytics beacon must stay allowed, or every visitor's
  // console fills with a CSP violation for a script the origin itself added.
  expect(headers['content-security-policy']).toContain('https://static.cloudflareinsights.com');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
});
