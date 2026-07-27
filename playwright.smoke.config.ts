import { defineConfig, devices } from '@playwright/test';

// Post-deploy smoke suite. `pnpm e2e` proves the *build* works against a local
// `astro preview`; this proves the *deployment* works. The two are not the
// same thing: astro preview never reads public/_headers, so a broken CSP, a
// wrong Content-Type on the .wasm asset, or a Pages routing change is
// invisible to the e2e suite and only shows up against the real origin.
//
// Runs against production by default; override with SMOKE_BASE_URL to point
// at a Pages preview deployment.
const baseURL = process.env.SMOKE_BASE_URL ?? 'https://whatsinmypdf.com';

export default defineConfig({
  testDir: './tests/smoke',
  fullyParallel: true,
  reporter: 'list',
  // Retries cover CDN propagation in the seconds after a deploy and ordinary
  // network flake. A smoke test that pages you over a transient 502 gets
  // ignored, which is worse than not having one.
  retries: 2,
  timeout: 90_000,
  use: { baseURL },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
