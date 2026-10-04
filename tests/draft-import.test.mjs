import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from 'yaml';
import {
  DraftImportError,
  importDraft,
  MAX_DRAFT_BYTES,
} from '../src/lib/draft-import.mjs';
import { exportDraft } from '../src/lib/draft-export.mjs';

const shared =
  'title: "題"\ndescription: "要約"\ndate: "2026-10-03"\ntags: []\ndraft: true\n';
const note = (settings = '', body = '本人の**言葉**。\n') =>
  `---\n${shared}category: "雑記"\n${settings}---\n\n${body}`;
const unpack = (markdown) => {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/);
  assert.ok(match);
  return { data: parse(match[1]), body: match[2] };
};
function reject(source, message, filename = 'selected.md') {
  assert.throws(
    () => importDraft(source, filename),
    (error) => {
      assert.ok(error instanceof DraftImportError);
      if (message) assert.match(error.message, message);
      return true;
    },
  );
}

test('既存の旧記事を往復しても原文・強調・題と設定を変えない', async () => {
  const filename = 'legacy-cyberpunk2077-1.md';
  const source = await readFile(
    new URL(`../src/content/notes/${filename}`, import.meta.url),
    'utf8',
  );
  const imported = importDraft(source, filename);
  const original = unpack(source);
  const result = unpack(exportDraft(imported.input).markdown);
  assert.equal(imported.filename, filename);
  assert.equal(imported.input.kind, 'note');
  assert.equal(result.body, original.body);
  assert.deepEqual(result.data, original.data);
  assert.ok(result.body.includes('**2つの作品**'));
  assert.ok(result.body.includes('**攻殻機動隊（原作と押井版映画の２つ）**'));
});

test('作品の表紙・URL・要約・タグの文字列値と本文を保ち、公開設定だけ下書きにする', () => {
  const source = `---\ntitle: "  自分の題  "\ndescription: "a\\r\\nb: # 説明"\ndate: 2026-10-03\ntags: ["a,b", " a ", "a,b", "true", "2026-01-01"]\ndraft: false\nstatus: 完成\nurl: https://example.com/works?q=1\nrepository: https://github.com/example/work\ncover:\n  src: images/selected-cover.webp\n  alt: "表紙の説明\\n次の行"\n---\n\n# 本文の題\r\n\r\n**本人の言葉**  \r\n末尾に改行なし`;
  const imported = importDraft(source, 'owner-work.md');
  const { data, body } = unpack(exportDraft(imported.input).markdown);
  assert.equal(imported.input.kind, 'work');
  assert.equal(imported.originalDraft, false);
  assert.equal(data.draft, true);
  assert.equal(data.title, '  自分の題  ');
  assert.equal(data.description, 'a\r\nb: # 説明');
  assert.deepEqual(data.tags, ['a,b', ' a ', 'a,b', 'true', '2026-01-01']);
  assert.deepEqual(data.cover, {
    src: 'images/selected-cover.webp',
    alt: '表紙の説明\n次の行',
  });
  assert.equal(data.status, '完成');
  assert.equal(data.url, 'https://example.com/works?q=1');
  assert.equal(data.repository, 'https://github.com/example/work');
  assert.equal(body, '# 本文の題\r\n\r\n**本人の言葉**  \r\n末尾に改行なし');
});

test('YAMLの引用・複数行スカラーを本物の設定として読み、値を解釈し直さない', () => {
  const source = `---\ntitle: 'true: # 題'\ndescription: |\n  本人の1行目\n  2行目: # 文字\ndate: 2026-10-03\ntags: ['false', 'null', '1e3']\ncategory: 学び\n---\n\n本文\n`;
  const imported = importDraft(source, 'yaml-scalars.md');
  const result = unpack(exportDraft(imported.input).markdown);
  assert.equal(result.data.title, 'true: # 題');
  assert.equal(result.data.description, '本人の1行目\n2行目: # 文字\n');
  assert.deepEqual(result.data.tags, ['false', 'null', '1e3']);
  assert.equal(result.data.draft, true);
  for (const scalar of ['true', 'null', '42', '.inf', '[題]', '{a: 題}']) {
    reject(note().replace('title: "題"', `title: ${scalar}`), /title/);
  }
});

test('不明な設定名を示して取り込みを止め、黙って省かない', () => {
  reject(note('ownerExtra: "残すべき値"\n'), /ownerExtra/);
  reject(
    `---\n${shared}status: 記録\ncover:\n  src: images/a.webp\n  alt: 表紙\n  credit: 作者\n---\n\n本文`,
    /cover.credit/,
  );
  reject(note('__proto__: "value"\n'), /__proto__/);
});

test('設定内のコメントは位置を問わず明示停止し、元ファイルとメモの救済方法を示す', () => {
  const sources = [
    note('# 残したい設定メモ\n'),
    note('#\n'),
    note().replace('title: "題"', '# 題の前のメモ\ntitle: "題"'),
    note().replace('title: "題"', 'title: "題" # 題のメモ'),
    note().replace('tags: []', 'tags: ["タグ"] # タグのメモ'),
    note().replace('tags: []', 'tags: ["タグ", # 配列中のメモ\n "別タグ"]'),
    note().replace('tags: []', 'tags: # 値の前のメモ\n  - "タグ"'),
    `---\n${shared}status: 記録\ncover:\n  src: images/a.png\n  alt: 表紙 # 画像のメモ\n---\n\n本文`,
    `---\n${shared}status: 記録\ncover: # 画像のメモ\n  src: images/a.png\n  alt: 表紙\n---\n\n本文`,
  ];
  for (const source of sources)
    reject(source, /コメント.*取り込みを止め.*元の \.md.*本文へ/);
});

test('引用・複数行スカラー・本文中の#はコメントと誤認せず原文の値を保つ', () => {
  const source = `---\ntitle: '題 # 値の一部'\ndescription: |\n  # スカラー内の文字\n  行末 # 文字列\ndate: 2026-10-04\ntags: ["#tag", "a#b", "文字 # 文字"]\ndraft: true\ncategory: 雑記\n---\n\n# 本文の見出し\r\n\r\n<!-- 元のメモ -->\r\n![図](./images/check.png)\r\n`;
  const imported = importDraft(source, 'literal-hash.md');
  const output = unpack(exportDraft(imported.input).markdown);
  assert.equal(output.data.title, '題 # 値の一部');
  assert.equal(output.data.description, '# スカラー内の文字\n行末 # 文字列\n');
  assert.deepEqual(output.data.tags, ['#tag', 'a#b', '文字 # 文字']);
  assert.equal(
    output.body,
    '# 本文の見出し\r\n\r\n<!-- 元のメモ -->\r\n![図](./images/check.png)\r\n',
  );
});

test('壊れたYAML・重複キー・配列・エイリアス・独自タグは受け入れない', () => {
  for (const source of [
    note('title: "重複"\n'),
    note('tags: ["重複"]\n'),
    note().replace('title: "題"', 'title: [unclosed'),
    '---\n- title\n- description\n---\n\n本文',
    note()
      .replace('title: "題"', 'title: &title "題"')
      .replace('description: "要約"', 'description: *title'),
    note().replace('title: "題"', 'title: !owner "題"'),
    note().replace('title: "題"', '? [a, b]\n: "題"'),
    note().replace('tags: []', `tags: ${'['.repeat(40)}"tag"${']'.repeat(40)}`),
    `---\n${shared}status: 記録\ncover:\n  src: images/a.webp\n  src: images/b.webp\n  alt: 表紙\n---\n\n本文`,
  ])
    reject(source);
});

test('種類があいまい・必要な設定不足・schemaに合わない値を拒否する', () => {
  reject(`---\n${shared}---\n\n本文`, /記事か作品/);
  reject(note('status: 記録\n'), /記事か作品/);
  reject(note().replace('description: "要約"\n', ''), /要約/);
  reject(note().replace('date: "2026-10-03"', 'date: "2026-02-30"'), /日付/);
  reject(note().replace('tags: []', 'tags: [1, true]'), /tags/);
  reject(note().replace('draft: true', 'draft: "false"'), /draft/);
  reject(
    `---\n${shared}status: 記録\nurl: javascript:alert(1)\n---\n\n本文`,
    /HTTPS/,
  );
  reject(
    `---\n${shared}status: 記録\ncover:\n  src: images/../a.webp\n  alt: 表紙\n---\n\n本文`,
    /images/,
  );
});

test('選択したMarkdownだけを扱い、容量制限と安全な書き出し名を別に確認する', () => {
  reject(note(), /\.md/, '/arbitrary/path.md');
  reject(note(), /\.md/, 'not-markdown.txt');
  reject(note('', 'a'.repeat(MAX_DRAFT_BYTES)), /1 MiB/);
  const imported = importDraft(note(), '旧記事.MD');
  assert.equal(imported.input.slug, '旧記事');
  assert.throws(() => exportDraft(imported.input), /入力/);
  assert.equal(
    exportDraft({ ...imported.input, slug: 'new-name' }).filename,
    'new-name.md',
  );
});

test('CRLFの設定区切りと余分な空行・本文末尾を取り込み後も保つ', () => {
  const source = note('', '\n本文\r\n\r\n').replace(
    /^(---\n[\s\S]*?---\n\n)/,
    (match) => match.replace(/\n/g, '\r\n'),
  );
  const imported = importDraft(source, 'line-endings.md');
  assert.equal(imported.input.body, '\n本文\r\n\r\n');
  assert.equal(
    unpack(exportDraft(imported.input).markdown).body,
    '\n本文\r\n\r\n',
  );
});

test('Unicodeの行・段落区切りを設定の閉じ線と誤認せず、不明な設定を本文へ逃がさない', () => {
  for (const separator of ['\u2028', '\u2029']) {
    const description = `prefix${separator}---`;
    const known = note().replace(
      'description: "要約"',
      `description: ${description}`,
    );
    const imported = importDraft(known, 'unicode-separator.md');
    const result = unpack(exportDraft(imported.input).markdown);
    assert.equal(imported.input.description, description);
    assert.equal(result.data.description, description);
    assert.equal(result.body, '本人の**言葉**。\n');
    const unknown = known.replace(
      'category: "雑記"',
      'ownerExtra: 保持する値\ncategory: "雑記"',
    );
    reject(unknown, /ownerExtra/);
  }
});

test('作品に明示された空のURL設定は落とさず拒否し、未設定は引き続き許可する', () => {
  const source = `---\n${shared}status: 記録\n---\n\n本文`;
  for (const key of ['url', 'repository']) {
    reject(
      source.replace('status: 記録', `status: 記録\n${key}: ""`),
      new RegExp(key),
    );
  }
  const imported = importDraft(source, 'without-urls.md');
  const result = unpack(exportDraft(imported.input).markdown);
  assert.ok(!Object.hasOwn(result.data, 'url'));
  assert.ok(!Object.hasOwn(result.data, 'repository'));
});
