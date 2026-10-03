import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const shared = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  date: z.iso.date(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(true),
});

const works = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/works' }),
  schema: shared.extend({
    url: z.url({ protocol: /^https$/ }).optional(),
    repository: z.url({ protocol: /^https$/ }).optional(),
    status: z.enum(['制作中', '完成', '記録']).default('記録'),
  }),
});
const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
  schema: shared.extend({ category: z.enum(['学び', '雑記']) }),
});

export const collections = { works, notes };
