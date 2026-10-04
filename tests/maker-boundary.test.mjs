import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { decodeHTMLAttribute } from 'entities';
import { localBuildEnabled, workroomEnabled } from '../src/lib/build-mode.mjs';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const base = (process.env.BASE_PATH || '/').replace(/\/+$/, '');
const localOn = localBuildEnabled(process.env);
const workroomOn = workroomEnabled(process.env.LOCAL_WORKROOM);
const makerPage = 'write/maker-field/index.html';
const makerHref = `${base}/write/maker-field/`;

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const filename = path.join(directory, entry.name);
        return entry.isDirectory() ? filesIn(filename) : [filename];
      }),
    )
  ).flat();
}

const builtFiles = await filesIn(dist).catch(() => {
  throw new Error('先に対象modeでbuildし、同じ環境変数でテストしてください。');
});
const textFiles = new Map(
  await Promise.all(
    builtFiles
      .filter((filename) => /\.(?:html|js|mjs|css|json|map)$/.test(filename))
      .map(async (filename) => [
        path.relative(dist, filename).split(path.sep).join('/'),
        await readFile(filename, 'utf8'),
      ]),
  ),
);
const pages = new Map(
  [...textFiles].filter(([filename]) => filename.endsWith('.html')),
);

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(
      (match) => [
        match[1].toLowerCase(),
        decodeHTMLAttribute(match[2] ?? match[3] ?? match[4]),
      ],
    ),
  );
}

function entryLinks(html, marker) {
  const links = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)]
    .map(([tag]) => tag)
    .filter((tag) => new RegExp(`\\b${marker}(?:[\\s=>])`).test(tag));
  assert.ok(links.length > 0, `${marker} の入口がありません。`);
  for (const tag of links) {
    const attrs = attributes(tag.slice(0, tag.indexOf('>') + 1));
    assert.equal(attrs.href, makerHref);
    assert.equal(attrs.target, '_blank', '未保存の執筆タブを置き換えない');
    assert.ok(attrs.rel?.split(/\s+/).includes('noopener'));
    assert.match(tag, /制作ログを下書きに/);
    assert.match(tag, /別タブ/);
  }
  return links;
}

test('Maker Field入口は既存のlocal modeに従い、通常buildには生成されない', () => {
  assert.equal(pages.has(makerPage), localOn);
  for (const [filename, html] of pages) {
    assert.equal(html.includes('data-maker-entry'), localOn, filename);
    if (!localOn) continue;
    for (const tag of entryLinks(html, 'data-maker-entry')) {
      if (workroomOn) {
        assert.match(tag, /\bdata-local-tool(?:[\s=>])/);
        assert.doesNotMatch(tag, /\bhidden(?:[\s=>])/);
        const nav = html.match(
          /<nav\b[^>]*data-workroom-nav[\s\S]*?<\/nav>/,
        )?.[0];
        assert.ok(
          nav?.includes(tag),
          `${filename}: 統合navの入口ではありません。`,
        );
      } else {
        assert.match(tag, /\bdata-local-tool(?:[\s=>])/);
        assert.match(tag, /\bhidden(?:[\s=>])/);
      }
    }
    if (!workroomOn) {
      assert.match(html, /localhost/);
      assert.match(html, /127\.0\.0\.1/);
    }
  }
});

test('書く画面のJSON変換入口はbase付き別タブで、既存の明示的なMarkdown取込を残す', () => {
  if (!localOn) return;
  const writer = pages.get('write/index.html');
  assert.ok(writer);
  assert.equal(entryLinks(writer, 'data-maker-writer-entry').length, 1);
  assert.match(writer, /\bid="write-import"/);
  assert.match(writer, /\bdata-import-replace(?:[\s=>])/);
  assert.match(writer, /\bdata-import-cancel(?:[\s=>])/);
});

test('画像付きZIPはMaker画面だけの明示操作で、元JSONの保存を案内する', () => {
  if (!localOn) return;
  const maker = pages.get(makerPage);
  assert.ok(maker);
  assert.match(maker, /id="maker-package"/);
  assert.match(maker, /画像と一緒に持ち出す（ZIP）/);
  assert.match(maker, /report\.json/);
  assert.match(maker, /元のJSONも別に残してください/);
  for (const [filename, html] of pages) {
    if (filename !== makerPage)
      assert.doesNotMatch(html, /id="maker-package"/, filename);
  }
});

test('通常配布の全生成物に変換画面・専用コード・取り込み用parserを混ぜない', () => {
  if (localOn) return;
  for (const [filename, source] of textFiles) {
    assert.doesNotMatch(filename, /maker[-_]field/i);
    const text = decodeHTMLAttribute(source).replace(
      /\\u([a-f0-9]{4})|\\x([a-f0-9]{2})/gi,
      (_, unicode, ascii) =>
        String.fromCharCode(parseInt(unicode || ascii, 16)),
    );
    assert.doesNotMatch(
      text,
      /maker[-_]field|Maker Field|data-maker-|制作ログを下書きに|portablePackageVersion|画像と一緒に持ち出す/i,
      filename,
    );
    // YAML is an existing writer dependency. The new bridge must not pull that
    // authoring-only parser into the ordinary distribution through shared UI.
    assert.doesNotMatch(
      text,
      /YAMLParseError|YAMLWarning|MULTIPLE_DOCS/,
      filename,
    );
  }
});

test('ローカル表示でも変換画面の固有UIを通常ページへ埋め込まない', () => {
  if (!localOn) return;
  for (const [filename, html] of pages) {
    if (filename === makerPage) continue;
    assert.doesNotMatch(
      html,
      /data-maker-field\b|maker-field-bridge/,
      filename,
    );
  }
});
