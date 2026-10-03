import assert from 'node:assert/strict';
import test from 'node:test';
import markdownBase, { withBase } from '../src/lib/markdown-base.mjs';

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
