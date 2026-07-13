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

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4321',
  },
  webServer: {
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
