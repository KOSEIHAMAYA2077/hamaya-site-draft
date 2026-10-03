import assert from 'node:assert/strict';
import test from 'node:test';
import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';
import { decodeHTMLAttribute } from 'entities';
import { articleHeadings } from '../src/lib/article-headings.mjs';

test('短い記事は目次を出さず、h1・h3は長さの判定に含めない', () => {
  assert.deepEqual(
    articleHeadings([
      { depth: 1, slug: 'title', text: '記事タイトル' },
      { depth: 2, slug: 'one', text: 'ひとつめ' },
      { depth: 2, slug: 'two', text: 'ふたつめ' },
      { depth: 2, slug: 'three', text: 'みっつめ' },
      { depth: 3, slug: 'more', text: '詳しく' },
    ]),
    [],
  );
});

test('日本語・重複・装飾を含む目次のリンクが実際の見出しIDと一致する', async () => {
  const renderer = await createSatteriMarkdownProcessor({
    syntaxHighlight: false,
  });
  const { code, metadata } = await renderer.render(
    '# 記事タイトル\n\n## はじめに\n\n## 記録 *メモ*\n\n## 記録 *メモ*\n\n## C++ の試行\n\n```md\n## コード内\n```\n\n### 詳しく\n',
  );
  const sections = articleHeadings(metadata.headings);
  assert.equal(sections.length, 4);
  assert.deepEqual(
    sections.map(({ text }) => text),
    ['はじめに', '記録 メモ', '記録 メモ', 'C++ の試行'],
  );
  const ids = [...code.matchAll(/<h2\b[^>]*\bid="([^"]*)"/g)].map((match) =>
    decodeHTMLAttribute(match[1]),
  );
  assert.equal(new Set(ids).size, 4);
  assert.deepEqual(
    sections.map(({ href }) => decodeURIComponent(href.slice(1))),
    ids,
  );
  assert.ok(ids[2].endsWith('-1'));
  assert.doesNotMatch(code, /id="コード内"/);
});

test('生成済みIDの予約文字も安全なフラグメントへ変換する', () => {
  const sections = articleHeadings(
    ['本文 & メモ', '100%', 'path/section', '引用#見出し'].map((slug) => ({
      depth: 2,
      slug,
      text: slug,
    })),
  );
  for (const { href, text } of sections) {
    assert.equal(decodeURIComponent(href.slice(1)), text);
    assert.equal(
      new URL(href, 'https://local-preview.invalid/notes/').pathname,
      '/notes/',
    );
  }
});
