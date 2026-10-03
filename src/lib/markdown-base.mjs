// Let Markdown authors use /images/... and /works/... on either Pages URL style.
export function withBase(url, base = '/') {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//'))
    return url;
  const prefix = `/${base.replace(/^\/+|\/+$/g, '')}`;
  if (prefix === '/' || url === prefix || url.startsWith(`${prefix}/`))
    return url;
  return `${prefix}${url}`;
}

export default function markdownBase({ base = '/' } = {}) {
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
      },
    },
  };
}
