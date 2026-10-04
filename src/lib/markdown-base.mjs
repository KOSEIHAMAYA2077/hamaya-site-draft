import { publicImageDimensions } from './public-image-metadata.mjs';

// Let Markdown authors use /images/... and /works/... on either Pages URL style.
export function withBase(url, base = '/') {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//'))
    return url;
  const prefix = `/${base.replace(/^\/+|\/+$/g, '')}`;
  if (prefix === '/' || url === prefix || url.startsWith(`${prefix}/`))
    return url;
  return `${prefix}${url}`;
}

export default function markdownBase({ base = '/', imageMetadata = {} } = {}) {
  return {
    name: 'site-base-path',
    element: {
      filter: ['a', 'img'],
      visit(node, context) {
        for (const key of ['href', 'src']) {
          const value = node.properties?.[key];
          if (typeof value === 'string')
            context.setProperty(node, key, withBase(value, base));
        }
        if (node.tagName === 'img') {
          const size = publicImageDimensions(
            imageMetadata,
            node.properties?.src,
            base,
          );
          if (size) {
            context.setProperty(node, 'width', size.width);
            context.setProperty(node, 'height', size.height);
          }
          context.setProperty(node, 'loading', 'lazy');
          context.setProperty(node, 'decoding', 'async');
        }
      },
    },
  };
}
