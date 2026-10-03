import { z } from 'astro/zod';
import data from '../data/site.json';

const siteSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  bio: z.string().nullable(),
  portrait: z
    .object({
      src: z
        .string()
        .regex(/^images\/[a-zA-Z0-9_./-]+$/)
        .refine(
          (src) =>
            src
              .split('/')
              .every(
                (segment) => segment && segment !== '.' && segment !== '..',
              ),
          { message: '写真のsrcはimages/配下のファイルを指定してください。' },
        ),
      alt: z.string().trim().min(1),
    })
    .nullable(),
  links: z.object({
    github: z.url({ hostname: /^github\.com$/, protocol: /^https$/ }),
    atcoder: z
      .url({ hostname: /^atcoder\.jp$/, protocol: /^https$/ })
      .nullable(),
  }),
  socialImage: z
    .object({
      src: z
        .string()
        .regex(/^images\/[a-zA-Z0-9_./-]+$/)
        .refine(
          (src) =>
            src
              .split('/')
              .every(
                (segment) => segment && segment !== '.' && segment !== '..',
              ),
          {
            message: '共有画像のsrcはimages/配下のファイルを指定してください。',
          },
        ),
      alt: z.string().trim().min(1),
    })
    .nullable()
    .default(null),
});
export const site = siteSchema.parse(data);
