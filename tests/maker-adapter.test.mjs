import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { parse } from 'yaml';
import {
  convertMakerField,
  MAX_INPUT_BYTES,
  parseMakerField,
} from '../src/maker/adapter.mjs';
import { exportDraft } from '../src/lib/draft-export.mjs';
import { importDraft } from '../src/lib/draft-import.mjs';
import { renderDraftPreview } from '../src/lib/draft-preview.mjs';

const MiB = 1024 * 1024;
const encoder = new TextEncoder();
const bytes = (value) => encoder.encode(JSON.stringify(value));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
const options = {
  collection: 'logs',
  id: 'selected',
  slug: 'selected-draft',
  description: '合成データを使った変換試験。',
  category: '雑記',
};
const record = (overrides = {}) => ({
  id: 'selected',
  title: '合成の題 🌱',
  date: '2026-10-04',
  body: '合成の本文。',
  ...overrides,
});
const state = (overrides = {}) => ({
  version: 1,
  logs: [record()],
  experiments: [],
  ideas: [],
  ...overrides,
});
const convertRecord = (overrides = {}, settings = {}) =>
  convertMakerField(bytes(state({ logs: [record(overrides)] })), {
    ...options,
    ...settings,
  });
function unpack(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/);
  assert.ok(match, 'frontmatterと本文を分けられる');
  return { data: parse(match[1]), body: match[2], frontmatter: match[1] };
}
function rejectState(value) {
  assert.throws(() => parseMakerField(bytes(value)), Error);
}

test('制作ログをゲーム・感想の記事へ変換しても種類と下書き設定を保つ', async () => {
  for (const category of ['ゲーム', '感想']) {
    const result = await convertRecord({}, { category });
    const { data } = unpack(result.markdown);
    assert.equal(data.category, category);
    assert.equal(data.draft, true);
    const imported = importDraft(result.markdown, result.filename);
    assert.equal(imported.input.category, category);
    assert.equal(exportDraft(imported.input).markdown, result.markdown);
  }
});

// Independent synthetic data and SHA-256 expectations transcribed from the
// standalone adapter's supplied example/exports on 2026-10-04. No test reads
// that checkout, its implementation, or any owner records at runtime.
const synthetic = {
  version: 1,
  logs: [
    {
      id: 'synthetic-log',
      title: '合成サンプルの制作ログ 🌱',
      date: '2026-10-04',
      type: '制作ログ',
      project: '変換検証用の架空プロジェクト',
      body: '一行目。日本語と絵文字 🌱\r\n二行目。\n<script>globalThis.syntheticMarker = true</script>\n```\n[実行しない](javascript:alert(1))\n![取得しない](https://example.invalid/image.png)\n~~~\n</code><svg onload="example"></svg>',
      tags: ['合成検証', '日本語'],
      related: ['synthetic-peer', 'missing-log'],
      sample: true,
    },
    {
      id: 'synthetic-peer',
      title: '関連先の合成記録',
      date: '2026-10-03',
      type: '雑記',
      body: '自動的にサイトのリンクには変換しません。',
      related: [],
      sample: true,
    },
  ],
  experiments: [
    {
      id: 'synthetic-experiment',
      title: '合成サンプルの比較実験',
      date: '2026-10-04',
      project: '変換検証',
      hypothesis: '画像を移さずに観察を残せるか。',
      change: '架空の1ピクセル画像を指定。',
      observation: '省略した画像を件数とhashで確認する。',
      next: '元のJSONを手元に残す。',
      verdict: '未判断',
      beforeImage: png,
      afterImage: '',
      logId: 'synthetic-log',
      sample: true,
    },
  ],
  ideas: [
    {
      id: 'synthetic-idea',
      title: '合成サンプルのアイデア',
      date: '2026-10-04',
      body: '下書きとして手動で持ち出す。',
      next: '本文を確認する。',
      status: '試作',
      logId: 'synthetic-log',
      sample: true,
    },
  ],
};
const goldenCases = [
  {
    collection: 'logs',
    id: 'synthetic-log',
    description:
      '合成データの手動変換を確認する下書き。本人の記事ではありません。',
    category: '雑記',
    sha256: '1d25b31e0688fbd07910232aecaf95c883b52949ca7e486ae96906675b189116',
    size: 1064,
  },
  {
    collection: 'experiments',
    id: 'synthetic-experiment',
    description: '合成画像の省略を確認する架空の下書き。',
    category: '学び',
    sha256: '73122e253a15582f296d8621d820069919a6dc7b26fb12b93eb2520a4c7afb8b',
    size: 1192,
  },
  {
    collection: 'ideas',
    id: 'synthetic-idea',
    description: 'アイデアの手動変換を確認する架空の下書き。',
    category: '雑記',
    sha256: '38b1df246eb8ea3da81dc7373b744ff22fb1679f552a62860a550c7706e9ce82',
    size: 758,
  },
];

for (const golden of goldenCases) {
  test(`${golden.collection}の出力は独立アダプターの合成Markdownとバイト一致し、writerで往復できる`, async () => {
    const input = bytes(synthetic);
    const result = await convertMakerField(input, {
      collection: golden.collection,
      id: golden.id,
      slug: golden.id,
      description: golden.description,
      category: golden.category,
    });
    assert.equal(result.filename, `${golden.id}.md`);
    assert.equal(sha256(result.markdown), golden.sha256);
    assert.equal(encoder.encode(result.markdown).byteLength, golden.size);
    assert.equal(result.report.source.inputSha256, sha256(input));
    assert.equal(result.report.output.sha256, golden.sha256);
    assert.equal(result.report.output.bytes, golden.size);
    assert.equal(result.report.draft, true);
    assert.equal(result.report.output.frontmatterDraft, true);
    assert.deepEqual(result.report.selection, {
      exportedRecords: 1,
      inputCounts: { logs: 2, experiments: 1, ideas: 1 },
    });
    const imported = importDraft(result.markdown, result.filename);
    assert.equal(imported.input.kind, 'note');
    assert.equal(exportDraft(imported.input).markdown, result.markdown);
    const { data } = unpack(result.markdown);
    assert.deepEqual(Object.keys(data), [
      'title',
      'description',
      'date',
      'tags',
      'draft',
      'category',
    ]);
    assert.equal(data.draft, true);
  });
}

test('入力を変更せず、選択したIDの1件だけを下書きにする', async () => {
  const input = bytes(
    state({
      logs: [
        record(),
        record({ id: 'other', body: '未選択だけの秘密の合成語' }),
      ],
      ideas: [record({ id: 'idea-other', body: '別種類の未選択合成語' })],
    }),
  );
  const before = Uint8Array.from(input);
  const result = await convertMakerField(input, options);
  assert.deepEqual(input, before);
  assert.doesNotMatch(
    result.markdown,
    /未選択だけの秘密の合成語|別種類の未選択合成語/,
  );
  assert.doesNotMatch(
    JSON.stringify(result.report),
    /未選択だけの秘密の合成語|別種類の未選択合成語/,
  );
  assert.equal(result.report.source.id, 'selected');
  assert.equal(result.report.selection.exportedRecords, 1);
  assert.deepEqual(
    parseMakerField(input),
    JSON.parse(new TextDecoder().decode(input)),
  );
});

test('明示的な空文字・空配列・falseと未解決の関連IDを残す', async () => {
  const result = await convertRecord({
    body: '',
    project: '',
    tags: [],
    related: [],
    logId: 'missing-log',
    sample: false,
  });
  const { data, body } = unpack(result.markdown);
  assert.deepEqual(data.tags, []);
  assert.ok(body.includes('## 記録の本文\n\n```text\n\n```'));
  assert.ok(body.includes('## 作品・テーマ\n\n```text\n\n```'));
  assert.ok(body.includes('```text\n[]\n```'));
  assert.ok(body.includes('```text\nfalse\n```'));
  assert.ok(body.includes('```text\nmissing-log\n```'));
  assert.doesNotMatch(body, /架空の検証用データです/);
  assert.equal(result.report.source.sample, false);
  for (const field of [
    'body',
    'project',
    'tags',
    'related',
    'logId',
    'sample',
  ]) {
    assert.ok(
      result.report.mappings.some((entry) => entry.field === field),
      field,
    );
  }
});

test('20個の共通draft項目は3種類すべてで受け入れ、空の初期値も残す', async () => {
  const sharedDraft = record({
    type: '',
    project: '',
    body: '',
    tags: [],
    related: [],
    experimentId: '',
    ideaId: '',
    logId: '',
    status: '',
    hypothesis: '',
    change: '',
    observation: '',
    next: '',
    verdict: '',
    beforeImage: '',
    afterImage: '',
    sample: false,
  });
  assert.equal(Object.keys(sharedDraft).length, 20);
  for (const collection of ['logs', 'experiments', 'ideas']) {
    const source = state({ logs: [], [collection]: [sharedDraft] });
    assert.deepEqual(
      parseMakerField(bytes(source))[collection][0],
      sharedDraft,
    );
    const result = await convertMakerField(bytes(source), {
      ...options,
      collection,
    });
    assert.deepEqual(
      result.report.mappings.map((entry) => entry.field).sort(),
      Object.keys(sharedDraft).sort(),
    );
    assert.equal(
      (unpack(result.markdown).body.match(/^## /gm) || []).length,
      18,
    );
    assert.equal(unpack(result.markdown).data.draft, true);
    assert.equal(result.report.omittedImages.length, 0);
  }
});

test('非同期の変換開始後に呼出側が入力や選択を変更しても開始時の内容を使う', async () => {
  const input = bytes(
    state({
      logs: [record(), record({ id: 'other', body: '変更後だけの合成語' })],
    }),
  );
  const inputHash = sha256(input);
  const settings = { ...options };
  const conversion = convertMakerField(input, settings);
  settings.id = 'other';
  settings.slug = 'changed-name';
  settings.description = '変更後だけの説明';
  settings.category = '学び';
  input.fill(0x20);
  const result = await conversion;
  assert.equal(result.filename, 'selected-draft.md');
  assert.equal(result.report.source.id, 'selected');
  assert.equal(result.report.source.inputSha256, inputHash);
  assert.equal(unpack(result.markdown).data.description, options.description);
  assert.equal(unpack(result.markdown).data.category, options.category);
  assert.doesNotMatch(result.markdown, /変更後だけの合成語|変更後だけの説明/);
});

test('日本語・絵文字・タグの値を保ち、CRLFとCRだけをLFへ直して報告する', async () => {
  const result = await convertRecord({
    body: '日本語 🌱\r\n次の行\r最後\t終わり\u2028区切り',
    tags: [' a,b ', '日本語', '日本語', '🌱'],
  });
  const { data, body } = unpack(result.markdown);
  assert.equal(data.title, '合成の題 🌱');
  assert.deepEqual(data.tags, [' a,b ', '日本語', '日本語', '🌱']);
  assert.ok(body.includes('日本語 🌱\n次の行\n最後\t終わり\u2028区切り'));
  assert.doesNotMatch(result.markdown, /\r/);
  assert.ok(
    result.report.normalizations.some((entry) => entry.field === 'body'),
  );
});

test('UTF-8 BOMを許可して報告し、入力hashにはBOMも含める', async () => {
  const plain = bytes(state());
  const input = new Uint8Array(plain.length + 3);
  input.set([0xef, 0xbb, 0xbf]);
  input.set(plain, 3);
  assert.deepEqual(parseMakerField(input), state());
  const result = await convertMakerField(input, options);
  assert.match(JSON.stringify(result.report.normalizations), /BOM/i);
  assert.equal(result.report.source.inputSha256, sha256(input));
  assert.notEqual(result.report.source.inputSha256, sha256(plain));
});

test('長いコードフェンスやHTMLを原文のまま囲み、既存プレビューで要素にしない', async () => {
  for (const fenceLength of [3, 17, 257]) {
    const body = [
      '<script>alert("合成")</script>',
      '`'.repeat(fenceLength),
      '<img src="https://example.invalid/track.png" onerror="alert(1)">',
      '[移動しない](javascript:alert(1))',
      '![取得しない](https://example.invalid/image.png)',
      '</code><svg onload="alert(1)"></svg>',
      '~'.repeat(fenceLength + 1),
      '日本語 🌱'.repeat(500),
    ].join('\n');
    const result = await convertRecord({ body });
    const markdownBody = unpack(result.markdown).body;
    assert.ok(markdownBody.includes(body));
    assert.ok(
      markdownBody.includes(`${'`'.repeat(fenceLength + 1)}text\n${body}`),
    );
    const html = renderDraftPreview(markdownBody);
    assert.doesNotMatch(html, /<(?:script|img|svg|iframe|a)\b/i);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /&lt;img src=/);
    assert.match(html, /\[移動しない\]\(javascript:alert\(1\)\)/);
  }
});

test('画像は元バイト数と独立に算出したhashだけを記録し、画像本体は出さない', async () => {
  const imageBytes = Buffer.from(png.split(',')[1], 'base64');
  const result = await convertRecord({ beforeImage: png, afterImage: '' });
  assert.doesNotMatch(result.markdown, /data:image\/|iVBORw0KGgo/);
  assert.ok(
    result.markdown.includes(
      `${imageBytes.length} bytes / SHA-256: ${sha256(imageBytes)}`,
    ),
  );
  assert.equal(result.report.omittedImages.length, 1);
  assert.equal(result.report.omittedImages[0].field, 'beforeImage');
  assert.equal(result.report.omittedImages[0].decodedBytes, 68);
  assert.equal(result.report.omittedImages[0].sha256, sha256(imageBytes));
  assert.ok(result.markdown.includes('## 変更後の画像\n\n```text\n\n```'));
});

test('未知のroot項目や選択外・別種類の未知項目も入力全体で拒否する', async () => {
  for (const input of [
    state({ unexpected: '失ってはいけない値' }),
    state({ logs: [record({ unexpected: '失ってはいけない値' })] }),
    state({ logs: [record(), record({ id: 'other', unexpected: '別の値' })] }),
    state({ ideas: [record({ id: 'idea', unexpected: '別種類の値' })] }),
  ]) {
    rejectState(input);
    await assert.rejects(convertMakerField(bytes(input), options), Error);
  }
});

test('通常表記とUnicode escape表記の重複JSONキーを全階層で拒否する', () => {
  for (const source of [
    '{"version":1,"version":1,"logs":[],"experiments":[],"ideas":[]}',
    '{"version":1,"logs":[],"lo\\u0067s":[],"experiments":[],"ideas":[]}',
    '{"version":1,"logs":[{"id":"a","id":"b"}],"experiments":[],"ideas":[]}',
    '{"version":1,"logs":[{"id":"a","\\u0069d":"b"}],"experiments":[],"ideas":[]}',
    '{"version":1,"logs":[],"experiments":[],"ideas":[{"id":"a","title":"x","ti\\u0074le":"y"}]}',
  ]) {
    assert.throws(() => parseMakerField(encoder.encode(source)), Error, source);
  }
});

test('別のobjectの同名キーと文字列内のJSON風文字は重複と誤認しない', () => {
  const source = state({
    logs: [
      record({ body: '{"id":"a","id":"b"} \\ " logs' }),
      record({ id: 'other' }),
    ],
  });
  assert.deepEqual(parseMakerField(bytes(source)), source);
});

test('prototype汚染に使えるキーをescape表記でも拒否する', () => {
  for (const key of [
    '__proto__',
    'constructor',
    'prototype',
    '\\u005f_proto__',
  ]) {
    const source = `{"version":1,"logs":[],"experiments":[],"ideas":[],"${key}":{}}`;
    assert.throws(() => parseMakerField(encoder.encode(source)), Error);
  }
  assert.equal(Object.prototype.polluted, undefined);
});

test('不正UTF-8・不正JSON・単独サロゲート・制御文字を置換せず拒否する', () => {
  for (const input of [
    Uint8Array.from([0xc3, 0x28]),
    Uint8Array.from([0xed, 0xa0, 0x80]),
    Uint8Array.from([0xf0, 0x9f, 0x8c]),
    encoder.encode(''),
    encoder.encode('{"version":1,}'),
    encoder.encode('null'),
    encoder.encode('[]'),
    encoder.encode(`${JSON.stringify(state())} trailing`),
  ]) {
    assert.throws(() => parseMakerField(input), Error);
  }
  for (const body of ['\ud800', '\udfff', 'x\u0000y', 'x\u001fy', 'x\u007fy']) {
    rejectState(state({ logs: [record({ body })] }));
  }
  assert.equal(
    parseMakerField(bytes(state({ logs: [record({ body: '\t\n\r🌱' })] })))
      .logs[0].body,
    '\t\n\r🌱',
  );
});

test('collection・IDは完全一致で必要とし、不正な要約・slug・日付・公開指定を拒否する', async () => {
  for (const settings of [
    { collection: 'unknown' },
    { collection: '' },
    { id: '' },
    { id: '合成の題 🌱' },
    { id: 'selected ' },
    { description: '' },
    { category: 'その他' },
    { slug: '../outside' },
    { slug: 'name--part' },
    { slug: 'a'.repeat(65) },
    { draft: false },
  ]) {
    await assert.rejects(
      convertRecord({}, settings),
      Error,
      JSON.stringify(settings),
    );
  }
  for (const date of [
    '',
    '2026-02-29',
    '2026-02-31',
    '2026-13-01',
    '2026-1-01',
  ]) {
    await assert.rejects(convertRecord({ date }), Error, date);
  }
  assert.equal(
    unpack((await convertRecord({ date: '2024-02-29' })).markdown).data.date,
    '2024-02-29',
  );
  assert.equal(
    (await convertRecord({}, { slug: 'a'.repeat(64) })).filename,
    `${'a'.repeat(64)}.md`,
  );
});

test('recordの型、同じ種類のID重複、version違いを拒否する', () => {
  for (const input of [
    state({ version: 2 }),
    state({ version: '1' }),
    state({ logs: {} }),
    state({ logs: [null] }),
    state({ logs: [record(), record()] }),
    state({ logs: [record({ sample: 'false' })] }),
    state({ logs: [record({ tags: [1] })] }),
    state({ logs: [record({ related: [false] })] }),
    state({ logs: [record({ body: {} })] }),
  ]) {
    rejectState(input);
  }
});

test('入力は8MiBちょうどまでを受け入れ、1バイト超過で拒否する', () => {
  assert.equal(MAX_INPUT_BYTES, 8 * MiB);
  const input = new Uint8Array(MAX_INPUT_BYTES).fill(0x20);
  input.set(bytes(state()));
  assert.equal(parseMakerField(input).logs[0].id, 'selected');
  const tooLarge = new Uint8Array(MAX_INPUT_BYTES + 1).fill(0x20);
  tooLarge.set(bytes(state()));
  assert.throws(() => parseMakerField(tooLarge), Error);
});

test('MarkdownはUTF-8で1MiBちょうどまでを受け入れ、1バイト超過で拒否する', async () => {
  const baseline = await convertRecord({ body: 'a' });
  const bodyLength = MiB - encoder.encode(baseline.markdown).length + 1;
  const boundary = await convertRecord({ body: 'a'.repeat(bodyLength) });
  assert.equal(encoder.encode(boundary.markdown).length, MiB);
  assert.equal(boundary.report.output.bytes, MiB);
  await assert.rejects(
    convertRecord({ body: 'a'.repeat(bodyLength + 1) }),
    Error,
  );
  await assert.rejects(
    convertRecord({ body: 'あ'.repeat(Math.ceil(bodyLength / 3) + 1) }),
    Error,
  );
});

test('frontmatterはUTF-8で64KiBちょうどまでを受け入れ、1バイト超過で拒否する', async () => {
  const headerBytes = (markdown) =>
    encoder.encode(markdown.match(/^---\n[\s\S]*?\n---\n/)[0]).length;
  const baseline = await convertRecord({}, { description: 'a' });
  const descriptionLength = 64 * 1024 - headerBytes(baseline.markdown) + 1;
  const accepted = await convertRecord(
    {},
    { description: 'a'.repeat(descriptionLength) },
  );
  assert.equal(headerBytes(accepted.markdown), 64 * 1024);
  await assert.rejects(
    convertRecord({}, { description: 'a'.repeat(descriptionLength + 1) }),
    /64 KiB/,
  );
  await assert.rejects(
    convertRecord(
      {},
      { description: 'あ'.repeat(Math.ceil(descriptionLength / 3) + 1) },
    ),
    /64 KiB/,
  );
});

test('題240・ID160・タグ100個各40文字の境界を検査する', () => {
  const boundary = record({
    title: 'あ'.repeat(240),
    id: 'x'.repeat(160),
    tags: Array.from({ length: 100 }, () => 'あ'.repeat(40)),
  });
  assert.equal(
    parseMakerField(bytes(state({ logs: [boundary] }))).logs.length,
    1,
  );
  for (const overrides of [
    { title: 'あ'.repeat(241) },
    { id: 'x'.repeat(161) },
    { tags: Array.from({ length: 101 }, () => 'tag') },
    { tags: ['あ'.repeat(41)] },
  ]) {
    rejectState(state({ logs: [record(overrides)] }));
  }
});

test('関連IDは5000個・各160文字を上限として検査する', () => {
  const related = Array.from({ length: 5000 }, (_, index) => `r${index}`);
  related[0] = 'x'.repeat(160);
  assert.equal(
    parseMakerField(bytes(state({ logs: [record({ related })] }))).logs[0]
      .related.length,
    5000,
  );
  rejectState(state({ logs: [record({ related: [...related, 'overflow'] })] }));
  rejectState(state({ logs: [record({ related: ['x'.repeat(161)] })] }));
});

test('3種類を合計して5000件までとし、文字列は4Mi UTF-16文字までにする', () => {
  const records = Array.from({ length: 5000 }, (_, index) =>
    record({ id: `record-${index}` }),
  );
  assert.equal(
    parseMakerField(bytes(state({ logs: records }))).logs.length,
    5000,
  );
  rejectState(state({ logs: records, ideas: [record({ id: 'one-more' })] }));
  const longBody = 'a'.repeat(4 * MiB);
  assert.equal(
    parseMakerField(bytes(state({ logs: [record({ body: longBody })] })))
      .logs[0].body.length,
    4 * MiB,
  );
  rejectState(state({ logs: [record({ body: `${longBody}a` })] }));
});

test('画像形式とbase64を検査し、復号後1MiBを超える画像を拒否する', async () => {
  const imageBytes = Buffer.alloc(MiB, 0);
  const boundaryImage = `data:image/png;base64,${imageBytes.toString('base64')}`;
  const result = await convertRecord({ beforeImage: boundaryImage });
  assert.equal(result.report.omittedImages[0].decodedBytes, MiB);
  assert.equal(result.report.omittedImages[0].sha256, sha256(imageBytes));
  const tooLarge = `data:image/png;base64,${Buffer.alloc(MiB + 1).toString('base64')}`;
  rejectState(state({ logs: [record({ beforeImage: tooLarge })] }));
  for (const beforeImage of [
    'https://example.invalid/image.png',
    'data:image/svg+xml;base64,PHN2Zy8+',
    'data:image/gif;base64,R0lGODlh',
    'data:image/png;base64,not base64',
    'data:image/png;base64,AA=A',
  ]) {
    rejectState(state({ logs: [record({ beforeImage })] }));
  }
  for (const mime of ['png', 'jpeg', 'webp']) {
    const beforeImage = `data:image/${mime};base64,AA==`;
    assert.equal(
      parseMakerField(bytes(state({ logs: [record({ beforeImage })] }))).logs[0]
        .beforeImage,
      beforeImage,
    );
  }
});

test('深いJSON・大量のキー・大量のノードは変換前に拒否する', () => {
  const deeplyNested = `${'['.repeat(33)}0${']'.repeat(33)}`;
  assert.throws(
    () => parseMakerField(encoder.encode(deeplyNested)),
    /構造.*深/,
  );
  const manyKeys = {
    ...state(),
    ...Object.fromEntries(
      Array.from({ length: 201 }, (_, index) => [`extra-${index}`, '']),
    ),
  };
  assert.throws(() => parseMakerField(bytes(manyKeys)), /項目が多/);
  assert.throws(
    () => parseMakerField(bytes({ ...state(), ['x'.repeat(201)]: '' })),
    /キーが長/,
  );
  const acceptedNodes = Array.from({ length: 5000 }, (_, index) =>
    record({
      id: `record-${index}`,
      tags: Array.from({ length: 40 }, () => 'tag'),
    }),
  );
  assert.equal(
    parseMakerField(bytes(state({ logs: acceptedNodes }))).logs.length,
    5000,
  );
  const manyNodes = Array.from({ length: 5000 }, (_, index) =>
    record({
      id: `record-${index}`,
      tags: Array.from({ length: 60 }, () => 'tag'),
    }),
  );
  assert.throws(
    () => parseMakerField(bytes(state({ logs: manyNodes }))),
    /構造/,
  );
});
