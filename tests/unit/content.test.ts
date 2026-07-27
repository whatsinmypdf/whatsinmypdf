import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// src/pages/zh/learn/[slug].astro resolves a zh article by the *English*
// slug, so the two collections are not independent: an article added to one
// side and not the other renders a working page in one language and a 404 the
// moment the visitor hits the language switcher. Nothing in the build catches
// that — both collections are individually valid — so it is asserted here.
const slugsIn = (dir: string): string[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
    .sort();

describe('learn collections', () => {
  it('pair every English article with a zh article under the same slug', () => {
    expect(slugsIn('src/content/learn-zh')).toEqual(slugsIn('src/content/learn'));
  });

  it('give every article the frontmatter the schema requires', () => {
    for (const dir of ['src/content/learn', 'src/content/learn-zh']) {
      for (const slug of slugsIn(dir)) {
        const source = readFileSync(`${dir}/${slug}.md`, 'utf8');
        const frontmatter = source.match(/^---\n([\s\S]*?)\n---/)?.[1];
        expect(frontmatter, `${dir}/${slug}.md has no frontmatter block`).toBeTruthy();
        for (const key of ['title', 'description', 'pubDate']) {
          expect(frontmatter, `${dir}/${slug}.md is missing ${key}`).toContain(`${key}:`);
        }
      }
    }
  });

  it('keep internal article links pointing at slugs that exist', () => {
    const known = new Set(slugsIn('src/content/learn'));
    for (const dir of ['src/content/learn', 'src/content/learn-zh']) {
      for (const slug of slugsIn(dir)) {
        const source = readFileSync(`${dir}/${slug}.md`, 'utf8');
        for (const [, target] of source.matchAll(/\]\(\/learn\/([a-z0-9-]+)\)/g)) {
          expect(known, `${dir}/${slug}.md links to /learn/${target}, which does not exist`).toContain(
            target,
          );
        }
      }
    }
  });
});
