import assert from 'node:assert/strict';
import test from 'node:test';
import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';
import markdownBase from '../src/lib/markdown-base.mjs';
import {
  markdownSafety,
  markdownUrlSafety,
} from '../src/lib/markdown-safety.mjs';
import { validHttpsUrl, validImagePath } from '../src/lib/content-safety.mjs';
import { importDraft } from '../src/lib/draft-import.mjs';
import { exportDraft } from '../src/lib/draft-export.mjs';
import { renderDraftPreview } from '../src/lib/draft-preview.mjs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkMarkdownContent } from '../scripts/check-markdown-content.mjs';

const base = '/qa-site';
const processor = await createSatteriMarkdownProcessor({
  syntaxHighlight: false,
  mdastPlugins: [markdownSafety({ base })],
  hastPlugins: [markdownUrlSafety({ base }), markdownBase({ base })],
});

test('取り込みと書き出しが保つ本文も、公開用HTMLにするときは実行可能HTMLを拒否する', async () => {
  const body = '<script>globalThis.syntheticAudit = 1</script>\n';
  const source = `---\ntitle: Synthetic fixture\ndescription: 本人の記事ではない検証用\ndate: "2026-10-04"\ntags: []\ndraft: false\ncategory: 学び\n---\n\n${body}`;
  const imported = importDraft(source, 'synthetic-audit.md');
  const exported = exportDraft(imported.input);
  assert.equal(imported.input.body, body);
  assert.match(exported.markdown, /draft: true/);
  assert.ok(exported.markdown.endsWith(body));
  assert.doesNotMatch(renderDraftPreview(body), /<script/);
  await assert.rejects(processor.render(imported.input.body), /HTML/);
});

test('raw HTML・イベント属性・SVG・iframeを拒否し、コードは安全な文字として保つ', async () => {
  for (const source of [
    '<img src="/images/a.png" onerror="globalThis.syntheticAudit=1">',
    '<svg onload="globalThis.syntheticAudit=1"></svg>',
    '<iframe srcdoc="<script>parent.syntheticAudit=1</script>"></iframe>',
    '<base href="https://example.invalid/">',
    '<style>body{display:none}</style>',
    '<a href="javascript:alert(1)">リンク</a>',
    '<!--><script>globalThis.syntheticAudit=1</script>',
  ])
    await assert.rejects(processor.render(source), /HTML/, source);
  const result = await processor.render(
    '## 記録\n\n`<svg onload="example">`\n\n```html\n<script>example</script>\n```',
  );
  assert.match(result.code, /&lt;svg/);
  assert.match(result.code, /&lt;script/);
  assert.doesNotMatch(result.code, /<(?:script|svg)\b/);
});

test('著者用HTMLコメントは本文ファイルを変えずHTMLから除く', async () => {
  const source = '本文\n\n<!-- synthetic-private-comment-marker -->\n\n続き';
  const result = await processor.render(source);
  assert.doesNotMatch(result.code, /synthetic-private-comment-marker/);
  assert.match(source, /synthetic-private-comment-marker/);
  assert.match(result.code, /本文/);
  assert.match(result.code, /続き/);
});

test('公開リンクの危険scheme・entity偽装・認証情報・外部相対URLを実rendererで拒否する', async () => {
  for (const destination of [
    'javascript:void(0)',
    'java&#x73;cript:void(0)',
    'javascript&colon;void(0)',
    'java&#9;script:void(0)',
    'data:text/html,synthetic',
    'file:///tmp/synthetic.txt',
    'http://example.invalid/',
    '//example.invalid/',
    'https://user:password@example.invalid/',
  ]) {
    await assert.rejects(processor.render(`[資料](${destination})`));
    await assert.rejects(
      processor.render(`[資料][ref]\n\n[ref]: ${destination}`),
    );
  }
});

test('Markdown画像はpublic/imagesのrasterだけにし、参照記法も相対importや外部取得を許さない', async () => {
  for (const source of [
    '![検証](../../private.png)',
    '![検証](images/local.png)',
    '![検証](file:///tmp/private.png)',
    '![検証](https://example.invalid/image.png)',
    '![検証](/images/../private.png)',
    '![検証](/images/a.svg)',
    '![検証](/images/a.html)',
    '![検証][pic]\n\n[pic]: ../../private.png',
    '![検証][pic]\n\n[pic]: https://example.invalid/image.png',
  ])
    await assert.rejects(processor.render(source), undefined, source);

  const result = await processor.render(
    '[資料](https://example.com/docs?q=1&v=2)\n\n[一覧](/notes/)\n\n[節](#記録)\n\n![図](/images/diagram.png)\n\n![参照図][pic]\n\n[pic]: /qa-site/images/figure.webp',
  );
  assert.match(result.code, /href="https:\/\/example.com\/docs\?q=1&amp;v=2"/);
  assert.match(result.code, /href="\/qa-site\/notes\/"/);
  assert.match(result.code, /href="#%E8%A8%98%E9%8C%B2"/);
  assert.match(result.code, /src="\/qa-site\/images\/diagram.png"/);
  assert.match(result.code, /src="\/qa-site\/images\/figure.webp"/);
  assert.deepEqual(result.metadata.localImagePaths, []);
  assert.deepEqual(result.metadata.remoteImagePaths, []);
});

test('schemaと書き出し共通のHTTPS・画像境界はcredentials/制御文字/SVGを許さない', () => {
  for (const value of [
    'https://user:password@example.invalid/',
    'https://example.invalid/\tfoo',
    'https://example.invalid/\u0085foo',
    'https://example.invalid\\@other.invalid/',
    'https://example.invalid/\n',
  ])
    assert.equal(validHttpsUrl(value), false, value);
  assert.equal(validHttpsUrl('https://example.com/記事?q=1&v=2'), true);
  for (const value of [
    '/images/a.png',
    'images/../a.png',
    'images//a.png',
    'images/%2e%2e/a.png',
    'images/a.svg',
    'images/a.html',
  ])
    assert.equal(validImagePath(value), false, value);
  for (const extension of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'])
    assert.equal(validImagePath(`images/synthetic.${extension}`), true);
});

test('独立preflightは下書きも検証し、rendererの失敗を握りつぶさず拒否する', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hamaya-markdown-audit-'));
  const note = (body, extra = '') =>
    `---\ntitle: Synthetic fixture\ndescription: 検証専用\ndate: "2026-10-04"\ntags: []\ndraft: true\ncategory: 学び\n${extra}---\n\n${body}\n`;
  try {
    await mkdir(path.join(root, 'notes'));
    await mkdir(path.join(root, 'works'));
    const file = path.join(root, 'notes/synthetic.md');
    await writeFile(file, note('## 記録\n\n本文 <!-- author-only -->'));
    assert.deepEqual(await checkMarkdownContent({ root }), { checked: 1 });
    for (const body of [
      '<script>globalThis.syntheticAudit=1</script>',
      '[危険](javascript:void(0))',
      '![検証](../../synthetic-private.png)',
    ]) {
      await writeFile(file, note(body));
      await assert.rejects(checkMarkdownContent({ root }), /synthetic.md/);
    }
    await writeFile(file, note('本文', '__proto__: synthetic\n'));
    await assert.rejects(checkMarkdownContent({ root }), /__proto__/);
    await writeFile(file, note('本文', 'title: 重複\n'));
    await assert.rejects(checkMarkdownContent({ root }), /YAML/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('preflightはcontent内symlinkを辿らず、公開前のローカルファイルを読まない', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hamaya-markdown-link-'));
  try {
    await mkdir(path.join(root, 'notes'));
    await mkdir(path.join(root, 'works'));
    await writeFile(path.join(root, 'synthetic-private.md'), 'synthetic only');
    await symlink('../synthetic-private.md', path.join(root, 'notes/link.md'));
    await assert.rejects(checkMarkdownContent({ root }), /symlink/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
