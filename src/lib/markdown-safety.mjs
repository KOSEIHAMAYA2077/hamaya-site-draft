import { markdownImagePath, validMarkdownLink } from './content-safety.mjs';

/** @param {unknown} value @param {string} base @param {readonly string[] | undefined} approvedAssets */
function imagePath(value, base, approvedAssets) {
  const relative = markdownImagePath(value, base);
  if (!relative)
    throw new Error(
      'Markdownの画像は images/ または ./images/ 配下のPNG・JPEG・WebP・GIF・AVIFを指定してください。親フォルダ・外部URL・以前のbase付きパスは使えません。',
    );
  if (approvedAssets && !approvedAssets.includes(relative))
    throw new Error(
      `画像が未採用です: ${relative}。画像本体を public/images/ に置き、public-assets.json で採用を確認してください。`,
    );
  return relative;
}

/**
 * Validate before Astro collects image imports. Comments are authoring notes,
 * not published content. Neither path modifies the source Markdown file.
 * @param {{base?: string, approvedAssets?: readonly string[]}} [options]
 * @returns {import('satteri').MdastPluginInstance & {name: string}}
 */
export function markdownSafety({ base = '/', approvedAssets } = {}) {
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
    definition(node, context) {
      if (!validMarkdownLink(node.url))
        throw new Error(
          'Markdownの参照リンクは認証情報を含まないHTTPSかサイト内のパスを指定してください。',
        );
      // A definition may be used by both an image and an ordinary link. Map
      // only the narrow public image namespace before Astro sees the URL.
      const relative = markdownImagePath(node.url, base);
      if (relative) context.setProperty(node, 'url', `/${relative}`);
    },
    image(node, context) {
      const relative = imagePath(node.url, base, approvedAssets);
      context.setProperty(node, 'url', `/${relative}`);
    },
  };
}

/**
 * Check resolved reference-style images and generated attributes too. This
 * runs before Astro's image marker; it cannot import a relative source file.
 * @param {{base?: string, approvedAssets?: readonly string[]}} [options]
 * @returns {import('satteri').HastVisitorInstance & {name: string}}
 */
export function markdownUrlSafety({ base = '/', approvedAssets } = {}) {
  return {
    name: 'content-output-url-safety',
    element: {
      filter: ['a', 'img'],
      visit(node, context) {
        if (node.tagName === 'a') {
          const href = node.properties?.href;
          if (href !== undefined && !validMarkdownLink(href))
            throw new Error('Markdownに使用できないリンクが含まれています。');
        } else {
          const relative = imagePath(
            node.properties?.src,
            base,
            approvedAssets,
          );
          context.setProperty(node, 'src', `/${relative}`);
        }
      },
    },
  };
}
