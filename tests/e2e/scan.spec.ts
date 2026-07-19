import { test, expect, type Page } from '@playwright/test';

// The Scanner component hydrates client-side (Astro `client:load`) inside
// an <astro-island>. Astro's runtime removes that element's `ssr` attribute
// only once hydration — and with it, React's delegated event listeners —
// has actually attached. `page.setInputFiles` fires a native `change`
// event immediately; called before that listener is attached, the event is
// lost and the page silently stays on the idle dropzone forever. This race
// is real, not theoretical: it was caught by this suite's own parallel
// workers contending for CPU (reproduced with `--workers=3`, absent with
// `--workers=1`). Every test waits for hydration to finish before touching
// the file input.
async function gotoReady(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => !document.querySelector('astro-island')?.hasAttribute('ssr'));
}

test('clean PDF reports all clear', async ({ page }) => {
  await gotoReady(page);
  await page.setInputFiles('input[type=file]', 'tests/fixtures/clean.pdf');
  await expect(page.getByText('No hidden content found')).toBeVisible({ timeout: 30_000 });
});

test('white-text injection PDF reports findings with evidence', async ({ page }) => {
  await gotoReady(page);
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
  const websockets: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET') posts.push(r.url());
    if (r.url().includes('.wasm')) wasmRequests.push(r.url());
    // Catches GET-querystring exfiltration too, not just POST bodies: every
    // request during the scan flow must stay on localhost.
    if (new URL(r.url()).hostname !== 'localhost') nonLocalRequests.push(r.url());
  });
  // P1-9: the no-upload guarantee only covered HTTP. A compromised
  // dependency could just as easily exfiltrate over a WebSocket, which
  // page.on('request') never sees. Assert the whole scan flow opens none.
  page.on('websocket', (ws) => websockets.push(ws.url()));

  await gotoReady(page);
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
  expect(websockets).toEqual([]);
});

test('encrypted PDF is rejected with a password-protected error, never a report', async ({
  page,
}) => {
  await gotoReady(page);
  await page.setInputFiles('input[type=file]', 'tests/fixtures/encrypted.pdf');

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible({ timeout: 30_000 });
  await expect(alert).toContainText('password-protected');

  // Never a report: no verdict heading, no findings/category groups, no
  // report-only "Scan another file" / "Download JSON report" controls.
  await expect(page.getByText('No hidden content found')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Download JSON report' })).not.toBeVisible();
  await expect(page.getByText(/findings? across/)).not.toBeVisible();
});

// P1-9: 7 of the 10 detection categories were only ever exercised by
// fixture-level unit tests, never through the actual UI render path
// (ReportView's page/text/detail/fallback branches, category grouping,
// badge). This sweeps the remaining fixtures (near_white_text and
// prompt_injection are already covered above) and asserts each fixture's
// expected category group actually renders in the report.
//
// Expected categories per fixture are taken verbatim from
// tests/fixtures/EXPECTED.md, which is cross-validated against the
// reference PyMuPDF scanner. offpage.pdf is the documented exception: per
// EXPECTED.md ("Deviation from the plan brief") it triggers
// cropbox_mismatch, not outside_cropbox, and does NOT trigger
// prompt_injection (the injection phrase sits outside the cropbox and is
// never extracted) — both are asserted explicitly below.
//
// Titles are copied from src/lib/scanner/categories.ts. The homepage's
// static "What we detect" section renders every title as an <h3> on first
// paint regardless of any scan, so a bare title match would false-pass.
// The category-id badge (e.g. "tiny_font") only renders inside an actual
// ReportView finding group, so each assertion is scoped to the <section>
// containing that exact id badge, and then checks the title heading inside
// that same section — proving both the right category id AND its title
// rendered together, from a real scan.
const CATEGORY_SWEEP: { fixture: string; groups: { id: string; title: string }[] }[] = [
  {
    fixture: 'tiny_font.pdf',
    groups: [
      { id: 'tiny_font', title: 'Tiny font' },
      { id: 'prompt_injection', title: 'Prompt injection' },
    ],
  },
  {
    fixture: 'invisible_tr.pdf',
    groups: [
      { id: 'invisible_render_mode', title: 'Invisible render mode' },
      { id: 'prompt_injection', title: 'Prompt injection' },
    ],
  },
  {
    fixture: 'hidden_layer.pdf',
    groups: [
      { id: 'hidden_layers', title: 'Hidden layers' },
      { id: 'prompt_injection', title: 'Prompt injection' },
    ],
  },
  {
    fixture: 'embedded.pdf',
    groups: [{ id: 'embedded_files', title: 'Embedded files' }],
  },
  {
    fixture: 'javascript.pdf',
    groups: [{ id: 'javascript', title: 'Embedded JavaScript' }],
  },
  {
    fixture: 'annotation.pdf',
    groups: [
      { id: 'annotations', title: 'Annotations' },
      { id: 'prompt_injection', title: 'Prompt injection' },
    ],
  },
  {
    fixture: 'offpage.pdf',
    groups: [{ id: 'cropbox_mismatch', title: 'Crop box mismatch' }],
  },
];

for (const { fixture, groups } of CATEGORY_SWEEP) {
  test(`${fixture} renders its expected category group(s) in the report`, async ({ page }) => {
    await gotoReady(page);
    await page.setInputFiles('input[type=file]', `tests/fixtures/${fixture}`);

    for (const { id, title } of groups) {
      // Scoped to CategoryGroup's own section class ("overflow-hidden"),
      // not just any <section>: the astro-island hosting Scanner sits
      // nested inside the homepage's hero <section>, so an unscoped
      // `section` locator filtered by descendant text also matches that
      // ancestor hero section (which trivially contains the same text via
      // its CategoryGroup descendant), causing a strict-mode violation.
      const group = page
        .locator('section.overflow-hidden')
        .filter({ has: page.getByText(id, { exact: true }) });
      await expect(group).toBeVisible({ timeout: 30_000 });
      await expect(group.getByRole('heading', { level: 3, name: title })).toBeVisible();
    }

    if (fixture === 'offpage.pdf') {
      // Locked-in documentation of the EXPECTED.md deviation: this fixture
      // must NOT show outside_cropbox or prompt_injection.
      await expect(page.getByText('outside_cropbox', { exact: true })).not.toBeVisible();
      await expect(page.getByText('prompt_injection', { exact: true })).not.toBeVisible();
    }
  });
}

// "Try an example" demo buttons (Scanner.tsx DEMOS): same-origin fetch of
// public/demo/*.pdf, fed through the identical scan path as a user-picked
// file. Titles/ids are copied from src/lib/scanner/categories.ts, scoped the
// same way as CATEGORY_SWEEP above to prove the group came from a real scan.
const DEMO_SWEEP: { button: string; groups: { id: string; title: string }[] }[] = [
  {
    button: 'Résumé with hidden instructions',
    groups: [
      { id: 'near_white_text', title: 'Near-white text' },
      { id: 'tiny_font', title: 'Tiny font' },
      { id: 'prompt_injection', title: 'Prompt injection' },
    ],
  },
  {
    button: 'Report with a hidden layer',
    groups: [
      { id: 'hidden_layers', title: 'Hidden layers' },
      { id: 'invisible_render_mode', title: 'Invisible render mode' },
    ],
  },
];

for (const { button, groups } of DEMO_SWEEP) {
  test(`"${button}" example button renders its expected category group(s)`, async ({ page }) => {
    await gotoReady(page);
    await page.getByRole('button', { name: button, exact: true }).click();

    for (const { id, title } of groups) {
      const group = page
        .locator('section.overflow-hidden')
        .filter({ has: page.getByText(id, { exact: true }) });
      await expect(group).toBeVisible({ timeout: 30_000 });
      await expect(group.getByRole('heading', { level: 3, name: title })).toBeVisible();
    }
  });
}

test('the résumé example scan carries no upload — only same-origin GET requests, no websockets', async ({
  page,
}) => {
  const posts: string[] = [];
  const nonLocalRequests: string[] = [];
  const websockets: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET') posts.push(r.url());
    if (new URL(r.url()).hostname !== 'localhost') nonLocalRequests.push(r.url());
  });
  page.on('websocket', (ws) => websockets.push(ws.url()));

  await gotoReady(page);
  await page
    .getByRole('button', { name: 'Résumé with hidden instructions', exact: true })
    .click();
  await expect(page.getByText('prompt_injection', { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  expect(posts).toEqual([]);
  expect(nonLocalRequests).toEqual([]);
  expect(websockets).toEqual([]);
});

test('cancelling a scan and immediately uploading a second file always shows the second file\'s report (generation-counter regression, P0-2)', async ({
  page,
}) => {
  await gotoReady(page);

  await page.setInputFiles('input[type=file]', 'tests/fixtures/white_text.pdf');
  // exact: true matters here: the disabled file <input type=file> also has
  // an implicit ARIA role of "button", and its accessible name is computed
  // from its enclosing <label>'s full text content (loading message +
  // fileName + "Cancel" all concatenated) — a non-exact name match against
  // "Cancel" resolves to both elements and throws a strict-mode violation.
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.setInputFiles('input[type=file]', 'tests/fixtures/clean.pdf');

  await expect(page.getByText('No hidden content found')).toBeVisible({ timeout: 30_000 });
  // If the cancelled first scan's continuation had won the race and
  // clobbered state, this would show white_text.pdf's prompt_injection
  // finding instead (or the wrong fileName in the header) — the bug
  // P0-2's generation counter fixes.
  await expect(page.getByText('prompt_injection', { exact: true })).not.toBeVisible();
  await expect(page.getByText('clean.pdf').first()).toBeVisible();
});
