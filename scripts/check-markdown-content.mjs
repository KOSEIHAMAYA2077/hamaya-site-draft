import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';
import { importDraft, MAX_DRAFT_BYTES } from '../src/lib/draft-import.mjs';
import {
  markdownSafety,
  markdownUrlSafety,
} from '../src/lib/markdown-safety.mjs';

/**
 * Astro's glob loader logs render errors and continues with an empty body.
 * Run outside that loader so unsafe source makes the command fail reliably.
 * Inspect every Markdown file, including drafts: a draft's image imports must
 * not read files before publication filtering. Never alter the author's file.
 * @param {{root?: string, base?: string}} [options]
 */
export async function checkMarkdownContent({
  root = fileURLToPath(new URL('../src/content/', import.meta.url)),
  base = '/',
} = {}) {
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
    throw new Error('Markdownの保存先にsymlinkは使えません。');
  const renderer = await createSatteriMarkdownProcessor({
    syntaxHighlight: false,
    mdastPlugins: [markdownSafety({ base })],
    hastPlugins: [markdownUrlSafety({ base })],
  });
  let checked = 0;
  /** @param {string} directory @param {'note' | 'work'} kind */
  async function visit(directory, kind) {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error('Markdownの保存先にsymlinkは使えません。');
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      const label = path.relative(root, filename);
      if (entry.isSymbolicLink())
        throw new Error(`${label}: Markdownの保存先にsymlinkは使えません。`);
      if (entry.isDirectory()) {
        await visit(filename, kind);
        continue;
      }
      if (!entry.name.endsWith('.md')) continue;
      try {
        const info = await lstat(filename);
        if (!info.isFile() || info.size > MAX_DRAFT_BYTES)
          throw new Error('1 MiB以内の通常のMarkdownファイルが必要です。');
        const source = new TextDecoder('utf-8', { fatal: true }).decode(
          await readFile(filename),
        );
        const parsed = importDraft(source, entry.name);
        if (parsed.input.kind !== kind)
          throw new Error('保存先とfrontmatterの記事・作品の種類が違います。');
        await renderer.render(parsed.input.body, {
          frontmatter: {},
        });
        checked += 1;
      } catch (error) {
        throw new Error(
          `${label}: ${error instanceof Error ? error.message : 'Markdownを確認してください。'}`,
        );
      }
    }
  }
  await visit(path.join(root, 'notes'), 'note');
  await visit(path.join(root, 'works'), 'work');
  return { checked };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await checkMarkdownContent({
      base: process.env.BASE_PATH || '/',
    });
    console.log(`Markdownの安全性を確認しました: ${result.checked}件`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
