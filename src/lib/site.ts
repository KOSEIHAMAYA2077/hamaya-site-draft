import { z } from 'astro/zod';
import data from '../data/site.json';
import { validHttpsUrl, validImagePath } from './content-safety.mjs';

const siteSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  bio: z.string().nullable(),
  portrait: z
    .object({
      src: z.string().refine(validImagePath, {
        message:
          '写真のsrcはimages/配下のPNG・JPEG・WebP・GIF・AVIFを指定してください。',
      }),
      alt: z.string().trim().min(1),
    })
    .nullable(),
  links: z.object({
    github: z
      .url({ hostname: /^github\.com$/, protocol: /^https$/ })
      .refine(validHttpsUrl),
    atcoder: z
      .url({ hostname: /^atcoder\.jp$/, protocol: /^https$/ })
      .refine(validHttpsUrl)
      .nullable(),
  }),
  socialImage: z
    .object({
      src: z.string().refine(validImagePath, {
        message:
          '共有画像のsrcはimages/配下のPNG・JPEG・WebP・GIF・AVIFを指定してください。',
      }),
      alt: z.string().trim().min(1),
    })
    .nullable()
    .default(null),
});
export const site = siteSchema.parse(data);
