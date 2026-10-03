import { validMarkdownImage, validMarkdownLink } from './content-safety.mjs';

/**
 * Validate before Astro collects image imports. Comments are authoring notes,
 * not published content. Neither path modifies the source Markdown file.
 * @param {{base?: string}} [options]
 * @returns {import('satteri').MdastPluginInstance & {name: string}}
 */
export function markdownSafety({ base = '/' } = {}) {
  return {
    name: 'content-input-safety',
    html(node, context) {
      if (/^<!--[\s\S]*-->$/.test(node.value)) {
        context.removeNode(node);
        return;
      }
      throw new Error(
        'Markdownの本文にHTMLは使えません。文字として示す場合はコードで囲んでください。',
      );
    },
    link(node) {
      if (!validMarkdownLink(node.url))
        throw new Error(
          'Markdownのリンクは認証情報を含まないHTTPSかサイト内のパスを指定してください。',
        );
    },
    definition(node) {
      if (!validMarkdownLink(node.url))
        throw new Error(
          'Markdownの参照リンクは認証情報を含まないHTTPSかサイト内のパスを指定してください。',
        );
    },
    image(node) {
      if (!validMarkdownImage(node.url, base))
        throw new Error(
          'Markdownの画像は /images/ 配下の承認済みPNG・JPEG・WebP・GIF・AVIFを指定してください。外部URLや相対ファイルの読み込みは使えません。',
        );
    },
  };
}

/**
 * Check resolved reference-style images and generated attributes too. This
 * runs before Astro's image marker; it cannot import a relative source file.
 * @param {{base?: string}} [options]
 * @returns {import('satteri').HastVisitorInstance & {name: string}}
 */
export function markdownUrlSafety({ base = '/' } = {}) {
  return {
    name: 'content-output-url-safety',
    element: {
      filter: ['a', 'img'],
      visit(node) {
        if (node.tagName === 'a') {
          const href = node.properties?.href;
          if (href !== undefined && !validMarkdownLink(href))
            throw new Error('Markdownに使用できないリンクが含まれています。');
        } else if (!validMarkdownImage(node.properties?.src, base)) {
          throw new Error(
            'Markdownの画像は /images/ 配下の承認済みPNG・JPEG・WebP・GIF・AVIFを指定してください。',
          );
        }
      },
    },
  };
}
