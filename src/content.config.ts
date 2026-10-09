import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';
import { validHttpsUrl, validImagePath } from './lib/content-safety.mjs';
import { NOTE_CATEGORIES } from './lib/note-categories.mjs';

import { workCandidateSchema } from './lib/work-candidates.mjs';

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
    url: z
      .string()
      .refine(validHttpsUrl, '認証情報を含まないHTTPSのURLを指定してください。')
      .optional(),
    repository: z
      .string()
      .refine(validHttpsUrl, '認証情報を含まないHTTPSのURLを指定してください。')
      .optional(),
    status: z.enum(['制作中', '完成', '記録']).default('記録'),
    cover: z
      .object({
        src: z.string().refine(validImagePath, {
          message:
            '表紙のsrcはimages/配下のPNG・JPEG・WebP・GIF・AVIFを指定してください。',
        }),
        alt: z.string().trim().min(1),
      })
      .optional(),
  }),
});
const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
  schema: shared.extend({ category: z.enum(NOTE_CATEGORIES) }),
});
const publicPreviewNotes = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/public-preview/notes' }),
  schema: shared.extend({ category: z.enum(NOTE_CATEGORIES) }),
});

const workCandidates = defineCollection({
  loader: file('src/data/work-candidates.json'),
  schema: workCandidateSchema,
});

export const collections = { works, notes, publicPreviewNotes, workCandidates };
