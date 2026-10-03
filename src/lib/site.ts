import { z } from 'astro/zod';
import data from '../data/site.json';

const siteSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  bio: z.string().nullable(),
  portrait: z
    .object({
      src: z.string().regex(/^images\/[a-zA-Z0-9_./-]+$/),
      alt: z.string().min(1),
    })
    .nullable(),
  links: z.object({
    github: z.url({ hostname: /^github\.com$/, protocol: /^https$/ }),
    atcoder: z
      .url({ hostname: /^atcoder\.jp$/, protocol: /^https$/ })
      .nullable(),
  }),
});
export const site = siteSchema.parse(data);
