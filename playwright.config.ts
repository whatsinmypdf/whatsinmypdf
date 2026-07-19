import { defineConfig, devices } from '@playwright/test';

// This machine routes all outbound HTTP through a local proxy (HTTP_PROXY /
// HTTPS_PROXY env vars, see ~/.zshrc), which cannot reach the loopback
// webServer and turns Playwright's own readiness check into a 502. Bypass
// the proxy for localhost so the config works unmodified on this machine.
const noProxyHosts = 'localhost,127.0.0.1,::1';
process.env.NO_PROXY = process.env.NO_PROXY
  ? `${process.env.NO_PROXY},${noProxyHosts}`
  : noProxyHosts;
process.env.no_proxy = process.env.NO_PROXY;

// E2E_BASE_URL lets a caller point the suite at an already-running server
// (e.g. a small static server that applies public/_headers, to verify the
// real CSP headers against a live scan — something `astro preview` does
// not do, since it never reads public/_headers) instead of the default
// `astro preview` webServer this config spins up itself. Unset, behavior
// is unchanged: `pnpm e2e` still builds and previews on :4321 as before.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4321';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL,
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm build && pnpm preview --host localhost',
        url: 'http://localhost:4321',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
