import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const learnSchema = z.object({
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
});

const learn = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/learn' }),
  schema: learnSchema,
});

// Separate collection (not a locale field on `learn`) so the English
// collection and its /learn/<slug> URLs stay completely untouched. Entry
// IDs here must match the English slugs verbatim — src/pages/zh/learn/
// looks entries up by the same slug.
const learnZh = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/learn-zh' }),
  schema: learnSchema,
});

export const collections = { learn, learnZh };
