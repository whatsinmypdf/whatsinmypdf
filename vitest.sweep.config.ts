import { defineConfig } from 'vitest/config';

// Separate config so `pnpm test` never picks the sweep up: it needs a corpus
// of real PDFs that this repo does not ship, and it is a measurement tool
// rather than a pass/fail check. See tests/sweep/corpus.test.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/sweep/**/*.test.ts'],
    testTimeout: 600_000,
  },
});
