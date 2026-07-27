import { test, expect, type Page } from '@playwright/test';

// Same hydration-wait pattern as scan.spec.ts: the Scanner island hydrates
// client-side, and Astro only drops the <astro-island>'s `ssr` attribute
// once React's event listeners are actually attached. Without this wait,
// setInputFiles can fire before hydration and the page silently stays idle.
async function gotoReady(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => !document.querySelector('astro-island')?.hasAttribute('ssr'));
}

test('zh homepage renders with html[lang=zh-CN] and the zh hero text', async ({ page }) => {
  await gotoReady(page, '/zh');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('heading', { level: 1, name: '找出藏在你 PDF 里的内容' })).toBeVisible();
});

test('language switcher round-trips /zh <-> /', async ({ page }) => {
  await gotoReady(page, '/');
  await page.getByRole('link', { name: 'Switch to Chinese' }).click();
  await expect(page).toHaveURL(/\/zh$/);
  await page.waitForFunction(() => !document.querySelector('astro-island')?.hasAttribute('ssr'));

  await page.getByRole('link', { name: '切换到 English' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('scanning white_text.pdf through the zh scanner renders zh category titles', async ({
  page,
}) => {
  await gotoReady(page, '/zh');
  await page.setInputFiles('input[type=file]', 'tests/fixtures/white_text.pdf');

  // Same scoping trick as scan.spec.ts: the homepage's "What we detect"
  // marketing grid already renders every zh category title on first paint,
  // so matching a title alone would pass without a real scan. The
  // category-id badge (e.g. "prompt_injection") only appears inside an
  // actual finding group, so scope the title assertion to that group.
  const injectionGroup = page
    .locator('section.overflow-hidden')
    .filter({ has: page.getByText('prompt_injection', { exact: true }) });
  await expect(injectionGroup).toBeVisible({ timeout: 30_000 });
  await expect(injectionGroup.getByRole('heading', { level: 3, name: '提示词注入' })).toBeVisible();

  const nearWhiteGroup = page
    .locator('section.overflow-hidden')
    .filter({ has: page.getByText('near_white_text', { exact: true }) });
  await expect(nearWhiteGroup).toBeVisible();
  await expect(nearWhiteGroup.getByRole('heading', { level: 3, name: '近白色文字' })).toBeVisible();

  // Same feedback link as the en report, localized label, identical href.
  await expect(page.getByRole('link', { name: '报告误报或漏报' })).toHaveAttribute(
    'href',
    'https://github.com/whatsinmypdf/whatsinmypdf/issues/new/choose',
  );
});

test('a missing zh path serves the bilingual 404 page', async ({ page }) => {
  // Static hosting (astro preview and Cloudflare Pages alike) falls back to
  // the single root 404.html for every miss, /zh/* included — so that page
  // must carry both languages.
  const response = await page.goto('/zh/does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '页面不存在' })).toBeVisible();
  await expect(page.getByRole('link', { name: '返回扫描器' })).toHaveAttribute('href', '/zh');
});

test('/zh/learn index lists every zh article', async ({ page }) => {
  await page.goto('/zh/learn');
  await expect(page.getByRole('heading', { level: 1, name: '文章' })).toBeVisible();

  // Every slug in src/content/learn-zh/. The zh collection must stay in
  // lockstep with the en one: src/pages/zh/learn/[slug].astro looks entries up
  // by the English slug, so an article added on one side and not the other is
  // a 404 waiting for a language switch.
  const articleLinks = [
    '/zh/learn/10-places-text-can-hide-inside-a-pdf',
    '/zh/learn/hidden-prompts-in-academic-papers',
    '/zh/learn/hidden-text-in-pdfs-exported-from-word-and-google-docs',
    '/zh/learn/how-to-check-a-pdf-for-hidden-text',
    '/zh/learn/pdf-javascript-and-embedded-files',
    '/zh/learn/pdf-prompt-injection',
    '/zh/learn/resume-with-hidden-instructions-what-recruiters-should-do',
    '/zh/learn/white-font-resume-trick',
  ];
  for (const href of articleLinks) {
    await expect(page.locator(`a[href="${href}"]`)).toBeVisible();
  }
});
