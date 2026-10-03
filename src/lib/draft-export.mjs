import { validHttpsUrl, validImagePath } from './content-safety.mjs';

/**
 * @typedef {Object} DraftInput
 * @property {string} [kind]
 * @property {string} [slug]
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [date]
 * @property {string} [category]
 * @property {string} [status]
 * @property {string | string[]} [tags]
 * @property {string} [body]
 * @property {string} [url]
 * @property {string} [repository]
 * @property {{src: string, alt: string}} [cover]
 * @property {boolean} [verbatimBody] Keep the selected file's body unchanged.
 * @property {boolean} [verbatimMetadata] Keep selected file's scalar values unchanged.
 */

export class DraftExportError extends Error {
  /** @param {Record<string, string>} issues */
  constructor(issues) {
    super('入力を確認してください。');
    this.name = 'DraftExportError';
    this.issues = issues;
  }
}

/** @param {unknown} value */
function text(value) {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n') : '';
}

/** @param {string} value */
function quote(value) {
  // JSON strings are valid YAML double-quoted scalars. Escape Unicode line
  // separators too, so each frontmatter field always occupies one source line.
  return JSON.stringify(value).replace(
    /[\u0085\u2028\u2029]/g,
    (character) =>
      `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/** @param {string} value */
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/**
 * Create a browser-downloadable draft. This module never writes a file,
 * renders HTML, sends data, or accepts an arbitrary output path.
 * @param {DraftInput} input
 */
export function exportDraft(input = {}) {
  /** @type {Record<string, string>} */
  const issues = {};
  const kind = text(input.kind);
  const slug = text(input.slug).trim();
  const metadataText = (/** @type {unknown} */ value) =>
    input.verbatimMetadata && typeof value === 'string' ? value : text(value);
  const title = metadataText(input.title);
  const description = metadataText(input.description);
  const date = input.verbatimMetadata
    ? metadataText(input.date)
    : text(input.date).trim();
  const category = text(input.category);
  const status = text(input.status);
  const body =
    input.verbatimBody && typeof input.body === 'string'
      ? input.body
      : text(input.body);
  const tags = Array.isArray(input.tags)
    ? [...input.tags]
    : [
        ...new Set(
          text(input.tags)
            .split(/[,\n]/)
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ];
  const url = input.verbatimMetadata
    ? metadataText(input.url)
    : text(input.url).trim();
  const repository = input.verbatimMetadata
    ? metadataText(input.repository)
    : text(input.repository).trim();
  const cover = input.cover;

  if (!['note', 'work'].includes(kind))
    issues.kind = '記事か作品を選んでください。';
  if (!title.trim()) issues.title = '題を入力してください。';
  else if (/[\n\u0085\u2028\u2029]/.test(title))
    issues.title = '題は1行で入力してください。';
  if (!description.trim()) issues.description = '短い要約を入力してください。';
  if (!tags.every((tag) => typeof tag === 'string'))
    issues.tags = 'タグは文字列で入力してください。';
  if (!validDate(date))
    issues.date = '日付は実在する日を YYYY-MM-DD で入力してください。';
  if (!slug || slug.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    issues.slug =
      'ファイル名は半角の小文字・数字・ハイフンで、64文字以内にしてください。先頭・末尾や連続するハイフンは使えません。';
  } else if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(slug)) {
    issues.slug = 'このファイル名は使用できません。別の名前を選んでください。';
  }
  if (kind === 'note' && !['学び', '雑記'].includes(category))
    issues.category = '記事の種類を選んでください。';
  if (kind === 'work' && !['制作中', '完成', '記録'].includes(status))
    issues.status = '作品の状態を選んでください。';
  if (!body.trim()) issues.body = '本文を入力してください。';

  // YAML can quote control characters; Markdown body text should not contain
  // them. Keep ordinary tabs and normalized line breaks available.
  for (const [field, value] of Object.entries({
    title,
    description,
    body,
    tags: tags.join('\n'),
  })) {
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
      issues[field] =
        '扱えない制御文字が含まれています。入力を確認してください。';
  }
  if (kind === 'work') {
    if (url && !validHttpsUrl(url))
      issues.url =
        '作品のURLは、ログイン情報を含まない HTTPS の完全なURLを入力してください。';
    if (repository && !validHttpsUrl(repository))
      issues.repository =
        'リポジトリは、ログイン情報を含まない HTTPS の完全なURLを入力してください。';
    if (cover !== undefined) {
      if (!cover || typeof cover !== 'object' || !validImagePath(cover.src))
        issues.coverSrc =
          '表紙は images/ 配下のPNG・JPEG・WebP・GIF・AVIFを指定してください。';
      if (
        !cover ||
        typeof cover.alt !== 'string' ||
        !cover.alt.trim() ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(cover.alt)
      )
        issues.coverAlt = '表紙の説明を入力してください。';
    }
  }
  if (Object.keys(issues).length) throw new DraftExportError(issues);

  const lines = [
    '---',
    `title: ${quote(title)}`,
    `description: ${quote(description)}`,
    `date: ${quote(date)}`,
    `tags: [${tags.map(quote).join(', ')}]`,
    'draft: true',
    kind === 'note'
      ? `category: ${quote(category)}`
      : `status: ${quote(status)}`,
  ];
  if (kind === 'work') {
    if (url) lines.push(`url: ${quote(url)}`);
    if (repository) lines.push(`repository: ${quote(repository)}`);
    if (cover) {
      lines.push(
        'cover:',
        `  src: ${quote(cover.src)}`,
        `  alt: ${quote(cover.alt)}`,
      );
    }
  }
  const ending = input.verbatimBody || body.endsWith('\n') ? '' : '\n';
  const markdown = `${lines.join('\n')}\n---\n\n${body}${ending}`;
  return {
    filename: `${slug}.md`,
    directory: kind === 'note' ? 'src/content/notes/' : 'src/content/works/',
    markdown,
  };
}
