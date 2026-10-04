import assert from 'node:assert/strict';
import test from 'node:test';
import markdownBase, { withBase } from '../src/lib/markdown-base.mjs';
import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';

test('Markdownの内部リンクと画像はbaseを付け、相対/外部/アンカーを保つ', () => {
  assert.equal(
    withBase('/images/note.svg', '/qa-site/'),
    '/qa-site/images/note.svg',
  );
  assert.equal(
    withBase('/works/?tag=test#main-content', '/qa-site'),
    '/qa-site/works/?tag=test#main-content',
  );
  assert.equal(withBase('/qa-site/works/', '/qa-site'), '/qa-site/works/');
  for (const url of [
    '../next/',
    '#chapter',
    'https://example.com/',
    '//example.com/image.jpg',
    'images/note.svg',
  ])
    assert.equal(withBase(url, '/qa-site'), url);
  assert.equal(withBase('/images/note.svg', '/'), '/images/note.svg');
});

test('ASTの画像とアンカーだけを変換し、本文を変更しない', () => {
  const tree = {
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'a',
        properties: { href: '/works/' },
        children: [{ type: 'text', value: '作品' }],
      },
      {
        type: 'element',
        tagName: 'img',
        properties: { src: '/images/note.svg', alt: 'テスト用の図' },
      },
    ],
  };
  const plugin = markdownBase({ base: '/qa-site/' });
  for (const node of tree.children)
    plugin.element.visit(node, {
      setProperty(node, key, value) {
        node.properties[key] = value;
      },
    });
  assert.equal(tree.children[0].properties.href, '/qa-site/works/');
  assert.equal(tree.children[1].properties.src, '/qa-site/images/note.svg');
  assert.equal(tree.children[0].children[0].value, '作品');
});

test('本文画像は実寸を予約し、root/baseとも遅延読込と非同期decodeを使う', async () => {
  for (const base of ['/', '/qa-site/']) {
    const processor = await createSatteriMarkdownProcessor({
      syntaxHighlight: false,
      hastPlugins: [
        markdownBase({
          base,
          imageMetadata: {
            'images/portrait.png': { width: 450, height: 900 },
          },
        }),
      ],
    });
    const { code } = await processor.render(
      '## 記録\n\n本文\n\n![縦の図](/images/portrait.png)\n\n![同じ図](' +
        withBase('/images/portrait.png', base) +
        ')\n\n![未採用](/images/missing.png)',
    );
    const images = [...code.matchAll(/<img\b[^>]*>/g)].map(([tag]) => tag);
    assert.equal(images.length, 3);
    for (const tag of images) {
      assert.match(tag, /loading="lazy"/);
      assert.match(tag, /decoding="async"/);
    }
    for (const tag of images.slice(0, 2)) {
      assert.match(tag, /width="450"/);
      assert.match(tag, /height="900"/);
      assert.ok(
        tag.includes(`src="${withBase('/images/portrait.png', base)}"`),
      );
    }
    assert.doesNotMatch(images[2], /(?:width|height)=/);
    assert.match(code, /本文/);
  }
});
