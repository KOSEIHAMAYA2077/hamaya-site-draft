import { isAlias, isMap, isScalar, isSeq, parseDocument } from 'yaml';
import { DraftExportError, exportDraft } from './draft-export.mjs';

export const MAX_DRAFT_BYTES = 1024 * 1024;
const MAX_FRONTMATTER_CHARACTERS = 64 * 1024;
const shared = ['title', 'description', 'date', 'tags', 'draft'];
const workFields = ['status', 'url', 'repository', 'cover'];

export class DraftImportError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'DraftImportError';
  }
}

/**
 * Parse only a file explicitly selected by the caller. No file access, writes,
 * URL loads or browser storage occur here. Unknown settings stop the import.
 * @param {string} source UTF-8 Markdown file contents
 * @param {string} filename Selected file's basename, never an arbitrary path
 */
export function importDraft(source, filename) {
  if (
    typeof filename !== 'string' ||
    !/^[^/\\\u0000-\u001f]+\.md$/i.test(filename)
  )
    throw new DraftImportError('.md ファイルを選んでください。');
  if (
    typeof source !== 'string' ||
    new TextEncoder().encode(source).length > MAX_DRAFT_BYTES
  )
    throw new DraftImportError(
      '1 MiB 以内の Markdown ファイルを選んでください。',
    );
  const start = source.match(/^\uFEFF?---[ \t]*(?:\r\n|\n|\r)/);
  if (!start) throw new DraftImportError('先頭に --- で囲んだ設定が必要です。');
  const remaining = source.slice(start[0].length);
  // JavaScript's multiline ^ also treats U+2028/U+2029 as line boundaries.
  // Frontmatter fences must occupy a physical LF/CRLF/CR line instead.
  const end = /(^|\r\n|\n|\r)(?:---|\.\.\.)[ \t]*(?:\r\n|\n|\r|$)/.exec(
    remaining,
  );
  if (!end) throw new DraftImportError('設定を閉じる --- が見つかりません。');
  const yaml = remaining.slice(0, end.index + end[1].length);
  if (yaml.length > MAX_FRONTMATTER_CHARACTERS)
    throw new DraftImportError(
      '設定が大きすぎます。64 KiB 以内にしてください。',
    );
  let body = remaining.slice(end.index + end[0].length);
  // The first blank line separates the frontmatter from the body. Every byte
  // after that separator belongs to the author's text, including its ending.
  body = body.replace(/^(?:\r\n|\n|\r)/, '');
  const document = parseDocument(yaml, {
    schema: 'core',
    uniqueKeys: true,
    merge: false,
    prettyErrors: false,
    strict: true,
  });
  if (document.errors.length || document.warnings.length)
    throw new DraftImportError(
      'YAML の設定を読めません。重複したキー・タグ・記法を確認してください。',
    );
  if (!isMap(document.contents))
    throw new DraftImportError('設定はキーと値の組で書いてください。');
  if (
    document.contents.items.some(
      (pair) => !isScalar(pair.key) || typeof pair.key.value !== 'string',
    )
  )
    throw new DraftImportError('設定のキーは文字列で書いてください。');
  // Inspect iteratively before toJS: deeply nested data and aliases are not
  // useful in this small schema and must not consume an unbounded call stack.
  /** @type {{node: unknown, depth: number}[]} */
  const nodes = [{ node: document.contents, depth: 0 }];
  let count = 0;
  while (nodes.length) {
    const item = nodes.pop();
    if (!item) break;
    const { node, depth } = item;
    if (++count > 10_000 || depth > 32)
      throw new DraftImportError(
        'YAML の設定が複雑すぎます。値を簡潔に書いてください。',
      );
    if (isAlias(node))
      throw new DraftImportError(
        'YAML のエイリアスは取り込めません。値を直接書いてください。',
      );
    if (isMap(node)) {
      for (const pair of node.items) {
        if (!isScalar(pair.key) || typeof pair.key.value !== 'string')
          throw new DraftImportError('設定のキーは文字列で書いてください。');
        nodes.push({ node: pair.value, depth: depth + 1 });
      }
    } else if (isSeq(node)) {
      for (const child of node.items)
        nodes.push({ node: child, depth: depth + 1 });
    }
  }
  /** @type {Record<string, any>} */
  const data = document.toJS({ mapAsMap: false, maxAliasCount: 0 });
  const supported = [...shared, 'category', ...workFields];
  const unknown = Object.keys(data).filter((key) => !supported.includes(key));
  if (unknown.length)
    throw new DraftImportError(
      `未対応の設定があります: ${unknown.join('、')}。`,
    );
  const hasCategory = Object.hasOwn(data, 'category');
  const hasWorkField = workFields.some((field) => Object.hasOwn(data, field));
  if (hasCategory === hasWorkField)
    throw new DraftImportError(
      '記事か作品か決められません。category または作品の status を確認してください。',
    );
  const kind = hasCategory ? 'note' : 'work';
  for (const key of [
    'title',
    'description',
    'date',
    'category',
    'status',
    'url',
    'repository',
  ]) {
    if (Object.hasOwn(data, key) && typeof data[key] !== 'string')
      throw new DraftImportError(`${key} は文字列で書いてください。`);
  }
  for (const key of ['url', 'repository']) {
    if (Object.hasOwn(data, key) && data[key] === '')
      throw new DraftImportError(
        `${key} が空です。HTTPS のURLを書くか、設定自体を省いてください。`,
      );
  }
  if (
    Object.hasOwn(data, 'tags') &&
    (!Array.isArray(data.tags) ||
      !data.tags.every((tag) => typeof tag === 'string'))
  )
    throw new DraftImportError('tags は文字列の配列で書いてください。');
  if (Object.hasOwn(data, 'draft') && typeof data.draft !== 'boolean')
    throw new DraftImportError('draft は true または false で書いてください。');
  if (Object.hasOwn(data, 'cover')) {
    const cover = data.cover;
    if (!cover || typeof cover !== 'object' || Array.isArray(cover))
      throw new DraftImportError('cover は src と alt の組で書いてください。');
    const unknownCover = Object.keys(cover).filter(
      (key) => !['src', 'alt'].includes(key),
    );
    if (unknownCover.length)
      throw new DraftImportError(
        `未対応の設定があります: ${unknownCover.map((key) => `cover.${key}`).join('、')}。`,
      );
    if (typeof cover.src !== 'string' || typeof cover.alt !== 'string')
      throw new DraftImportError(
        'cover.src と cover.alt は文字列で書いてください。',
      );
  }
  const input = {
    kind,
    slug: filename.replace(/\.md$/i, ''),
    title: data.title,
    description: data.description,
    date: data.date,
    category: data.category,
    status: data.status ?? '記録',
    tags: data.tags ?? [],
    url: data.url,
    repository: data.repository,
    cover: data.cover,
    body,
    verbatimBody: true,
    verbatimMetadata: true,
  };
  try {
    // Filename rules apply at export. Imports with legacy basenames remain
    // editable and require a valid new filename before downloading.
    exportDraft({ ...input, slug: 'import-check' });
  } catch (error) {
    if (error instanceof DraftExportError)
      throw new DraftImportError(
        `設定と本文を確認してください。${Object.values(error.issues).join(' ')}`,
      );
    throw error;
  }
  return {
    input,
    filename,
    originalDraft: data.draft ?? true,
    fields: Object.keys(data),
  };
}
