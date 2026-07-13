import { test, expect } from '@playwright/test';

test('clean PDF reports all clear', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', 'tests/fixtures/clean.pdf');
  await expect(page.getByText('No hidden content found')).toBeVisible({ timeout: 30_000 });
});

test('white-text injection PDF reports findings with evidence', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', 'tests/fixtures/white_text.pdf');
  // The homepage's static "What we detect" marketing section already renders
  // an <h3>Prompt injection</h3> for every category on first paint, so
  // matching that title alone would pass even with no scan run at all.
  // The category-id badge (e.g. "prompt_injection", underscored) only
  // appears inside an actual finding group in the report, so it uniquely
  // proves the scan ran and produced this finding.
  await expect(page.getByText('prompt_injection', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/Ignore all previous instructions/i).first()).toBeVisible();
});

test('no network request carries the PDF, and WASM only loads after a scan is requested', async ({
  page,
}) => {
  const posts: string[] = [];
  const wasmRequests: string[] = [];
  const nonLocalRequests: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET') posts.push(r.url());
    if (r.url().includes('.wasm')) wasmRequests.push(r.url());
    // Catches GET-querystring exfiltration too, not just POST bodies: every
    // request during the scan flow must stay on localhost.
    if (new URL(r.url()).hostname !== 'localhost') nonLocalRequests.push(r.url());
  });

  await page.goto('/');
  // Lazy-load guarantee (Task 6): the WASM engine must not be fetched just
  // from loading the page — only once the user actually picks a file.
  expect(wasmRequests).toEqual([]);

  await page.setInputFiles('input[type=file]', 'tests/fixtures/white_text.pdf');
  // The homepage's static "What we detect" marketing section already renders
  // an <h3>Prompt injection</h3> for every category on first paint, so
  // matching that title alone would pass even with no scan run at all.
  // The category-id badge (e.g. "prompt_injection", underscored) only
  // appears inside an actual finding group in the report, so it uniquely
  // proves the scan ran and produced this finding.
  await expect(page.getByText('prompt_injection', { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  expect(posts).toEqual([]);
  expect(wasmRequests.length).toBeGreaterThan(0);
  expect(nonLocalRequests).toEqual([]);
});
