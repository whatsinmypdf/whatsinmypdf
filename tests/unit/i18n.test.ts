import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { enPathFor, zhPathFor } from '../../src/i18n/locales';

const contentDir = (name: string) =>
  fileURLToPath(new URL(`../../src/content/${name}`, import.meta.url));

describe('learn article locales', () => {
  it('en and zh collections contain exactly the same slugs', () => {
    // The language switcher and hreflang tags derive the counterpart URL by
    // prefix-swapping alone, so a missing translation would silently 404.
    const en = readdirSync(contentDir('learn')).filter((f) => f.endsWith('.md')).sort();
    const zh = readdirSync(contentDir('learn-zh')).filter((f) => f.endsWith('.md')).sort();
    expect(zh).toEqual(en);
  });
});

describe('locale path mapping', () => {
  it('round-trips every page path', () => {
    for (const p of ['/', '/about', '/learn', '/learn/pdf-prompt-injection']) {
      expect(enPathFor(zhPathFor(p))).toBe(p);
    }
  });

  it('only strips /zh as a path segment, not as a prefix of another segment', () => {
    expect(enPathFor('/zhang')).toBe('/zhang');
    expect(enPathFor('/zh')).toBe('/');
    expect(enPathFor('/zh/about')).toBe('/about');
  });
});
