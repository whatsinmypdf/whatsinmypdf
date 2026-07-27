import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';

// The CSP allows inline <script>/<style> by hash, so the header and the build
// output have to agree exactly. They can drift for two reasons: an Astro
// upgrade changes its hydration runtime, or someone edits src/lib/registerSW.ts
// (Astro inlines a script that small rather than emitting a file). Both used to
// surface only after a deploy, as a "Refused to execute inline script" in every
// visitor's console.
//
// No browser needed — this reads the built files. It lives in the e2e suite
// because that is the suite that runs after `pnpm build`; `pnpm test` runs
// before dist/ exists.
const DIST = 'dist';
const INLINE = /<(script|style)([^>]*)>([\s\S]*?)<\/\1>/g;

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(path);
    return e.isFile() && e.name.endsWith('.html') ? [path] : [];
  });
}

test('every inline script and style in the build is allowed by the CSP header', () => {
  const headers = readFileSync('public/_headers', 'utf8');
  const csp = headers.match(/Content-Security-Policy:.*/)?.[0];
  expect(csp, 'no Content-Security-Policy line in public/_headers').toBeTruthy();

  const missing: string[] = [];
  const seen = new Set<string>();
  for (const file of htmlFiles(DIST)) {
    const html = readFileSync(file, 'utf8');
    for (const [, tag, attrs, body] of html.matchAll(INLINE)) {
      // External scripts carry their own URL and are covered by 'self';
      // JSON-LD never executes, so CSP does not govern it.
      if (/\bsrc=/.test(attrs) || /application\/ld\+json/.test(attrs)) continue;
      const hash = `sha256-${createHash('sha256').update(body).digest('base64')}`;
      if (seen.has(hash)) continue;
      seen.add(hash);
      if (!csp!.includes(hash)) missing.push(`${tag} in ${file}: '${hash}'`);
    }
  }

  expect(
    missing,
    `Inline content in dist/ has no matching CSP hash. Add these to public/_headers:\n${missing.join('\n')}`,
  ).toEqual([]);
});
