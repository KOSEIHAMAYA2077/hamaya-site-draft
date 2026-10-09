import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  PUBLIC_PREVIEW_NOTE_SOURCE,
  PUBLIC_PREVIEW_NOTE_TITLE,
} from '../src/lib/public-preview.mjs';

/** Check the reviewed public replica before Astro's forgiving Markdown loader. */
export async function checkPublicPreviewSource() {
  const source = await readFile(
    new URL('../src/public-preview/notes/cyberpunk2077-1.md', import.meta.url),
  );
  const evidence = JSON.parse(
    await readFile(
      new URL('../docs/PUBLIC_PREVIEW_SOURCE.json', import.meta.url),
      'utf8',
    ),
  );
  if (
    evidence.sourceUrl !== PUBLIC_PREVIEW_NOTE_SOURCE ||
    evidence.metadata.title !== PUBLIC_PREVIEW_NOTE_TITLE ||
    evidence.rawHtmlSha256 !==
      '7945c347aab6649fc5c6c8405eb74fe845025b807576cebace2a5ee6efb3e668' ||
    evidence.output.markdownSha256 !==
      '36b64afadb3636b03dc5a2e233582b184266e7e9f13f56d682e319b86cd39a35' ||
    createHash('sha256').update(source).digest('hex') !==
      evidence.output.markdownSha256
  )
    throw new Error('公開記事の原文照合を確認してください。');
  return evidence;
}
