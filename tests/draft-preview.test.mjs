import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDraftPreview } from '../src/lib/draft-preview.mjs';

test('本文の見出しはh2から始め、h1を生成しない', () => {
  const html = renderDraftPreview('# 大きな題\n\n## 節\n\n###### 小さな節');
  assert.equal(html, '<h2>大きな題</h2>\n<h3>節</h3>\n<h6>小さな節</h6>');
  assert.doesNotMatch(html, /<h1\b/);
  assert.equal(renderDraftPreview('# issue#42 ###'), '<h2>issue#42</h2>');
});

test('段落・強調・コードの語を保ち、元のMarkdown本文を変えない', () => {
  const body =
    '最初の **太字 words** と *斜体 exact*。\r\n続き。\r\n\r\n`**literal** <tag>`\r\n\r\n```js\r\nconst x = "<img onerror=alert(1)>";\r\n```';
  const original = body;
  const html = renderDraftPreview(body);
  assert.equal(body, original);
  assert.match(html, /<strong>太字 words<\/strong>/);
  assert.match(html, /<em>斜体 exact<\/em>/);
  assert.match(html, /<p>最初の .*\n続き。<\/p>/);
  assert.match(html, /<code>\*\*literal\*\* &lt;tag&gt;<\/code>/);
  assert.match(
    html,
    /<pre><code>const x = &quot;&lt;img onerror=alert\(1\)&gt;&quot;;<\/code><\/pre>/,
  );
  assert.equal(
    renderDraftPreview('word_with_underscores'),
    '<p>word_with_underscores</p>',
  );
  assert.equal(
    renderDraftPreview('_first_word_'),
    '<p><em>first_word</em></p>',
  );
  assert.equal(renderDraftPreview('\\*literal\\*'), '<p>*literal*</p>');
});

test('箇条書き・番号付きリスト・引用・閉じていないコードを扱う', () => {
  assert.equal(
    renderDraftPreview(
      '- 一つ\n- **二つ**\n\n1. 三つ\n2. 四つ\n\n> 引用\n> 続き',
    ),
    '<ul><li>一つ</li><li><strong>二つ</strong></li></ul>\n<ol><li>三つ</li><li>四つ</li></ol>\n<blockquote><p>引用\n続き</p></blockquote>',
  );
  assert.equal(
    renderDraftPreview('~~~\n<script>'),
    '<pre><code>&lt;script&gt;</code></pre>',
  );
});

test('HTML・イベント属性・SVG・閉じタグをすべて文字として表示する', () => {
  const html = renderDraftPreview(
    '<script>alert(1)</script>\n<img src="x" onerror="alert(1)">\n<svg onload=alert(1)></svg>\n</p><iframe srcdoc="<script>1</script>">',
  );
  assert.doesNotMatch(html, /<(?:script|img|svg|iframe)\b/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(
    html,
    /&lt;img src=&quot;x&quot; onerror=&quot;alert\(1\)&quot;&gt;/,
  );
  assert.match(html, /&lt;\/p&gt;&lt;iframe/);
  assert.equal(
    renderDraftPreview('&lt;script&gt;'),
    '<p>&amp;lt;script&amp;gt;</p>',
  );
  assert.equal(
    renderDraftPreview(
      '<img alt="**literal** [label](https://example.test/)">',
    ),
    '<p>&lt;img alt=&quot;**literal** [label](https://example.test/)&quot;&gt;</p>',
  );
});

test('通常のHTTP(S)と安全なローカルpath・fragmentだけをリンクにする', () => {
  for (const destination of [
    'https://example.test/記事?q=1&v=2#節',
    'HTTP://example.test/',
    '/notes/example/',
    './local.md',
    '../local.md',
    'notes/local.md',
    '#section',
  ]) {
    const html = renderDraftPreview(`[本文](${destination})`);
    assert.match(html, /^<p><a href="/);
    assert.match(html, /">本文<\/a><\/p>$/);
  }
  assert.equal(
    renderDraftPreview('[query](https://example.test/?a=1&amp;b=2)'),
    '<p><a href="https://example.test/?a=1&amp;b=2">query</a></p>',
  );
  assert.equal(
    renderDraftPreview('[**exact label**](https://example.test/)'),
    '<p><a href="https://example.test/"><strong>exact label</strong></a></p>',
  );
});

test('危険なscheme・entity偽装・制御文字・外部相対URL・認証情報を拒否する', () => {
  const destinations = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,test',
    'vbscript:msgbox(1)',
    'file:///tmp/private',
    'blob:https://example.test/abc',
    '&#106;avascript:alert(1)',
    '&#x6a;avascript:alert(1)',
    'javascript&#58;alert(1)',
    'javascript&colon;alert(1)',
    'java&#9;script:alert(1)',
    'java&#10;script:alert(1)',
    'java&#13;script:alert(1)',
    '&#x20;javascript:alert(1)',
    '&#x0d;javascript:alert(1)',
    '&amp;#106;avascript:alert(1)',
    '//example.test/',
    '&sol;&sol;example.test/',
    '\\\\example.test/',
    '/\\example.test/',
    'https://user:password@example.test/',
    'https:/example.test/',
    'https://',
    'https://example.test/&#10;next',
    'https://example.test/"onmouseover="alert(1)',
  ];
  for (const destination of destinations) {
    assert.equal(
      renderDraftPreview(`[安全なラベル](${destination})`),
      '<p>安全なラベル</p>',
      destination,
    );
  }
});

test('Markdown画像はaltの印だけを表示し、画像もURL属性も生成しない', () => {
  for (const destination of [
    'https://example.test/remote.png',
    '/local.png',
    'data:image/png,example',
  ]) {
    const html = renderDraftPreview(
      `![説明 <img onerror=alert(1)>](${destination})`,
    );
    assert.equal(
      html,
      '<p><span class="draft-preview-image">[画像: 説明 &lt;img onerror=alert(1)&gt;]</span></p>',
    );
    assert.doesNotMatch(html, /<img\b|<[^>]*\b(?:src|href|onerror)=/i);
    assert.ok(!html.includes(destination));
  }
});

test('空の入力・大きな入力・深い構造のプレビュー量を制限する', () => {
  for (const body of ['', ' \n\t', undefined, null, {}])
    assert.equal(renderDraftPreview(body), '');
  const body = '本文'.repeat(60_000);
  const html = renderDraftPreview(body);
  assert.equal(body.length, 120_000);
  assert.match(html, /長い本文のため、プレビューを省略しています。/);
  assert.ok(html.length < 101_000);
  const manyLines = renderDraftPreview('本文\n'.repeat(4_001));
  assert.match(manyLines, /長い本文のため、プレビューを省略しています。/);
  assert.ok(
    (renderDraftPreview('>'.repeat(40) + '本文').match(/<blockquote>/g) || [])
      .length <= 8,
  );
});

test('長い未閉じのインライン構文でも繰り返し検索を打ち切り、残りを安全な文字として保つ', () => {
  for (const body of [
    'prefix ' + '`'.repeat(99_980),
    '*a '.repeat(33_333),
    '<!--' + '<'.repeat(99_980),
  ]) {
    const html = renderDraftPreview(body);
    const escaped = body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    assert.equal(html, `<p>${escaped}</p>`);
  }
});
