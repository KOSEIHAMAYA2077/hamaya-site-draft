import { z } from 'astro/zod';
import { validHttpsUrl } from './content-safety.mjs';

const text = z.string().trim().min(1);
const url = text.refine(validHttpsUrl, 'HTTPSの出典URLが必要です。');
const source = z
  .object({
    id: text,
    label: text,
    url,
    scope: text,
    observations: z.array(text).min(1),
  })
  .strict();

export const workCandidateSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    repository: z.string().regex(/^KOSEIHAMAYA2077\/[A-Za-z0-9_.-]+$/),
    repositoryUrl: url,
    title: text,
    summary: text,
    kind: z.enum(['game', 'hardware', 'algorithm', 'visual', 'design']),
    existingDraft: z.boolean(),
    draft: z.literal(true),
    decision: z.literal('pending'),
    visibility: z.literal('public'),
    verifiedAt: z.iso.date(),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    commitDate: text,
    codeExecution: z.literal('not-run'),
    behavior: z.array(text).min(1),
    technologies: z.array(text),
    entrances: z
      .array(z.object({ label: text, url, kind: text }).strict())
      .min(1),
    unknowns: z.array(text).min(1),
    attribution: z
      .object({ status: text, note: text, sources: z.array(url) })
      .strict(),
    rights: z.object({ license: text, thirdParty: text, note: text }).strict(),
    course: z.object({ status: text, note: text }).strict(),
    fork: z.boolean(),
    parent: url.nullable(),
    sources: z.array(source).min(2),
  })
  .strict()
  .superRefine((candidate, context) => {
    if (
      candidate.repositoryUrl !== `https://github.com/${candidate.repository}`
    )
      context.addIssue({
        code: 'custom',
        message: 'repositoryとURLが一致しません。',
        path: ['repositoryUrl'],
      });
    const prefix = `https://github.com/${candidate.repository}/`;
    if (
      !candidate.sources.some(
        (item) =>
          item.url.startsWith(`${prefix}blob/${candidate.commit}/`) ||
          item.url === `${prefix}tree/${candidate.commit}`,
      )
    )
      context.addIssue({
        code: 'custom',
        message: '固定commitで読んだファイルの出典が必要です。',
        path: ['sources'],
      });
    if (
      new Set(candidate.sources.map((item) => item.id)).size !==
      candidate.sources.length
    )
      context.addIssue({
        code: 'custom',
        message: '出典IDが重複しています。',
        path: ['sources'],
      });
  });

export function parseWorkCandidates(value) {
  const entries = z.array(workCandidateSchema).min(1).parse(value);
  if (
    new Set(entries.map((item) => item.id)).size !== entries.length ||
    new Set(entries.map((item) => item.repository)).size !== entries.length
  )
    throw new Error('作品候補のIDまたはrepoが重複しています。');
  return entries;
}
