import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import test from 'node:test';
import { convertMakerField } from '../src/maker/adapter.mjs';
import {
  createMakerPortablePackage,
  checkRasterSignature,
  decodeRasterImage,
} from '../src/maker/portable.mjs';
import { createStoredZip } from '../src/maker/stored-zip.mjs';
import { importDraft } from '../src/lib/draft-import.mjs';
import { exportDraft } from '../src/lib/draft-export.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
const pngBytes = Uint8Array.from(Buffer.from(png.split(',')[1], 'base64'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const options = {
  collection: 'experiments',
  id: 'portable-selected',
  slug: 'portable-maker',
  description: '合成データによる持ち運び確認。',
  category: '学び',
};
const record = (extra = {}) => ({
  id: 'portable-selected',
  title: '合成・持ち運び確認 🌱',
  date: '2026-10-04',
  body: '合成の本文。実績ではありません。\r\n<script>example</script>\n```\n終わり。',
  tags: ['合成', ' a,b ', '合成'],
  related: [],
  logId: 'missing-synthetic-log',
  beforeImage: png,
  afterImage: '',
  sample: true,
  ...extra,
});
const state = (selected = record(), extra = {}) => ({
  version: 1,
  logs: [],
  experiments: [selected],
  ideas: [],
  ...extra,
});
const bytes = (value) => encoder.encode(JSON.stringify(value));
// Unit tests exercise byte and archive contracts. Real decoding uses the browser.
const unitDecoder = { decodeImage: async () => ({ width: 1, height: 1 }) };

function readZip(zip) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  const count = view.getUint16(end + 10, true);
  assert.equal(view.getUint16(end + 8, true), count);
  const centralStart = view.getUint32(end + 16, true);
  assert.equal(centralStart + view.getUint32(end + 12, true), end);
  let cursor = centralStart;
  const files = new Map();
  for (let index = 0; index < count; index += 1) {
    assert.equal(view.getUint32(cursor, true), 0x02014b50);
    assert.equal(view.getUint16(cursor + 10, true), 0, 'STORE, not compressed');
    const expectedCrc = view.getUint32(cursor + 16, true);
    const size = view.getUint32(cursor + 24, true);
    assert.equal(view.getUint32(cursor + 20, true), size);
    const nameLength = view.getUint16(cursor + 28, true);
    const name = decoder.decode(
      zip.slice(cursor + 46, cursor + 46 + nameLength),
    );
    const local = view.getUint32(cursor + 42, true);
    assert.equal(view.getUint32(local, true), 0x04034b50);
    assert.equal(view.getUint16(local + 8, true), 0);
    assert.equal(view.getUint16(local + 12, true), 33);
    assert.equal(view.getUint32(local + 14, true), expectedCrc);
    assert.equal(view.getUint32(local + 22, true), size);
    assert.equal(view.getUint16(local + 26, true), nameLength);
    assert.equal(
      decoder.decode(zip.slice(local + 30, local + 30 + nameLength)),
      name,
    );
    const body = zip.slice(
      local + 30 + nameLength,
      local + 30 + nameLength + size,
    );
    assert.equal(crc32(body), expectedCrc, `${name}: independent Node CRC32`);
    files.set(name, body);
    cursor += 46 + nameLength;
  }
  assert.equal(cursor, end);
  return files;
}

test('Maker ZIPは選択した1件・元画像bytes・reportを保持しwriterでMDが完全往復する', async () => {
  const source = bytes(
    state(record(), {
      logs: [
        {
          id: 'other',
          title: '未選択の合成',
          date: '2026-10-04',
          body: '未選択だけの合成語',
          beforeImage: png,
        },
      ],
    }),
  );
  const before = source.slice();
  let decodedImages = 0;
  const result = await createMakerPortablePackage(source, options, {
    decodeImage: async (image, mime) => {
      decodedImages += 1;
      assert.deepEqual(image, pngBytes);
      assert.equal(mime, 'image/png');
      return { width: 1, height: 1 };
    },
  });
  assert.equal(decodedImages, 1, '選択外の画像を同梱しない');
  assert.deepEqual(source, before);
  assert.equal(result.filename, 'portable-maker.zip');
  const files = readZip(result.bytes);
  assert.deepEqual(
    [...files.keys()],
    ['portable-maker.md', 'images/portable-maker-before.png', 'report.json'],
  );
  assert.deepEqual(files.get('images/portable-maker-before.png'), pngBytes);
  const markdown = decoder.decode(files.get('portable-maker.md'));
  assert.equal(markdown, result.markdown);
  assert.match(
    markdown,
    /!\[変更前の画像\]\(\.\/images\/portable-maker-before\.png\)/,
  );
  assert.doesNotMatch(
    markdown,
    /画像データは含めていません|data:image\/|未選択だけの合成語/,
  );
  const imported = importDraft(markdown, 'portable-maker.md');
  assert.equal(exportDraft(imported.input).markdown, markdown);
  assert.deepEqual(imported.input.tags, ['合成', ' a,b ', '合成']);
  assert.equal(imported.originalDraft, true);
  assert.match(markdown, /```text\n\[\]\n```/);
  assert.match(markdown, /```text\nmissing-synthetic-log\n```/);
  const report = JSON.parse(decoder.decode(files.get('report.json')));
  assert.deepEqual(report, result.report);
  assert.equal(report.package.originalJsonIncluded, false);
  assert.equal(report.source.inputSha256, hash(source));
  assert.equal(report.output.sha256, hash(markdown));
  assert.equal(report.exportedImages[0].sha256, hash(pngBytes));
  assert.deepEqual(report.omittedImages, []);
  assert.ok(report.normalizations.some((item) => item.field === 'body'));
  assert.doesNotMatch(
    JSON.stringify(report),
    /未選択だけの合成語|Image bytes excluded|画像のバイト列は含みません/,
  );
  const legacy = await convertMakerField(source, options);
  const relativeSection = `![変更前の画像](./images/portable-maker-before.png)\n\n${pngBytes.length} bytes / SHA-256: ${hash(pngBytes)}`;
  const omittedSection = `画像データは含めていません。元のJSONを保管してください。\n\n${pngBytes.length} bytes / SHA-256: ${hash(pngBytes)}`;
  assert.equal(
    markdown.replace(relativeSection, omittedSection),
    legacy.markdown,
    '画像の節以外は既定出力と同じ',
  );
});

test('2画像のZIPも元byteを維持し、画像なしならデコーダー不要でMDとreportだけを渡す', async () => {
  const two = await createMakerPortablePackage(
    bytes(state(record({ afterImage: png }))),
    options,
    unitDecoder,
  );
  assert.equal(readZip(two.bytes).size, 4);
  assert.deepEqual(
    two.report.exportedImages.map((image) => image.path),
    ['images/portable-maker-before.png', 'images/portable-maker-after.png'],
  );
  const empty = await createMakerPortablePackage(
    bytes(state(record({ beforeImage: '', afterImage: '', sample: false }))),
    options,
    {
      decodeImage: async () => assert.fail('画像が空なら呼ばない'),
    },
  );
  assert.equal(readZip(empty.bytes).size, 2);
  assert.deepEqual(empty.report.exportedImages, []);
  assert.match(empty.markdown, /## サンプルの指定\n\n```text\nfalse\n```/);
});

test('ZIP処理中に呼出側の入力や選択が変わっても開始時の記録を使う', async () => {
  const source = bytes(state());
  const sourceHash = hash(source);
  const selection = { ...options };
  const pending = createMakerPortablePackage(source, selection, unitDecoder);
  source.fill(0x20);
  selection.slug = 'changed';
  selection.description = '変更された要約';
  const result = await pending;
  assert.equal(result.filename, 'portable-maker.zip');
  assert.equal(result.report.source.inputSha256, sourceHash);
  assert.doesNotMatch(result.markdown, /変更された要約/);
});

test('未知設定と選択外の未知項目はZIPを作らず停止する', async () => {
  const noDecode = {
    decodeImage: async () => assert.fail('JSON検査より前に画像を扱わない'),
  };
  for (const source of [
    state(record({ unknown: '残すべき値' })),
    state(record(), { ideas: [{ id: 'unselected', unknown: '残すべき値' }] }),
    state(record(), { unexpected: true }),
  ])
    await assert.rejects(
      createMakerPortablePackage(bytes(source), options, noDecode),
    );
  await assert.rejects(
    createMakerPortablePackage(
      bytes(state()),
      { ...options, draft: false },
      noDecode,
    ),
  );
});

test('画像の宣言とmagic不一致・decode失敗・大きすぎる寸法はZIP出力を止める', async () => {
  for (const image of [
    'data:image/png;base64,AA==',
    png.replace('image/png', 'image/jpeg'),
    'data:image/svg+xml;base64,PHN2Zy8+',
  ]) {
    const source = bytes(state(record({ beforeImage: image })));
    const before = source.slice();
    await assert.rejects(
      createMakerPortablePackage(source, options, unitDecoder),
    );
    assert.deepEqual(source, before);
  }
  await assert.rejects(
    createMakerPortablePackage(bytes(state()), options, {
      decodeImage: async () => {
        throw new Error('合成decode失敗');
      },
    }),
    /合成decode失敗/,
  );
  for (const dimensions of [
    { width: 0, height: 1 },
    { width: 8193, height: 1 },
    { width: 8192, height: 8192 },
  ]) {
    await assert.rejects(
      createMakerPortablePackage(bytes(state()), options, {
        decodeImage: async () => dimensions,
      }),
      /画像の大きさ/,
    );
  }
  const huge = pngBytes.slice();
  new DataView(huge.buffer).setUint32(16, 9000);
  await assert.rejects(
    createMakerPortablePackage(
      bytes(
        state(
          record({
            beforeImage: `data:image/png;base64,${Buffer.from(huge).toString('base64')}`,
          }),
        ),
      ),
      options,
      {
        decodeImage: async () => assert.fail('PNGの寸法上限はdecode前に止める'),
      },
    ),
    /画像の大きさ/,
  );
});

test('対応形式の宣言とmagicを確認し、未対応の形式は拒否する', () => {
  checkRasterSignature(pngBytes, 'image/png');
  checkRasterSignature(Uint8Array.from([255, 216, 255, 217]), 'image/jpeg');
  const webp = Uint8Array.from([
    82, 73, 70, 70, 12, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 32, 0, 0, 0, 0,
  ]);
  checkRasterSignature(webp, 'image/webp');
  assert.throws(() => checkRasterSignature(pngBytes, 'image/gif'));
  assert.throws(() => checkRasterSignature(pngBytes, 'image/webp'));
  assert.throws(() =>
    checkRasterSignature(new Uint8Array(1024 * 1024 + 1), 'image/png'),
  );
});

test('browser decoderは画像資源を閉じ、利用不可やdecode失敗を明示する', async () => {
  const original = globalThis.createImageBitmap;
  try {
    delete globalThis.createImageBitmap;
    await assert.rejects(
      decodeRasterImage(pngBytes, 'image/png'),
      /このブラウザでは画像を確認できません/,
    );
    let closed = 0;
    globalThis.createImageBitmap = async (blob) => {
      assert.equal(blob.type, 'image/png');
      assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), pngBytes);
      return {
        width: 1,
        height: 1,
        close: () => {
          closed += 1;
        },
      };
    };
    assert.deepEqual(await decodeRasterImage(pngBytes, 'image/png'), {
      width: 1,
      height: 1,
    });
    assert.equal(closed, 1);
    globalThis.createImageBitmap = async () => {
      throw new Error('decode');
    };
    await assert.rejects(
      decodeRasterImage(pngBytes, 'image/png'),
      /画像を読み取れません/,
    );
  } finally {
    if (original === undefined) delete globalThis.createImageBitmap;
    else globalThis.createImageBitmap = original;
  }
});

test('無圧縮ZIPのCRC・central directoryを独立に読み、同じ入力なら同じbyteを得る', () => {
  const files = [
    { path: 'note.md', bytes: encoder.encode('日本語 🌱\n') },
    { path: 'report.json', bytes: encoder.encode('{}\n') },
  ];
  const first = createStoredZip(files);
  assert.deepEqual(createStoredZip(files), first);
  const unpacked = readZip(first);
  for (const file of files)
    assert.deepEqual(unpacked.get(file.path), file.bytes);
});

test('ZIPは危険path・重複・予約名・ファイル数と容量超過で明示停止する', () => {
  const file = { path: 'valid.md', bytes: encoder.encode('test') };
  for (const path of [
    '../outside.md',
    '/absolute.md',
    './here.md',
    'images//bad.png',
    'images/../bad.png',
    'image\\bad.png',
    'C:/bad.md',
    '日本語.md',
    'trailing.',
    'con.md',
    'images/nul.png',
  ]) {
    assert.throws(() => createStoredZip([{ ...file, path }]), /ファイル名/);
  }
  assert.throws(() => createStoredZip([file, file]), /重複/);
  assert.throws(() => createStoredZip([]), /ファイル/);
  assert.throws(
    () =>
      createStoredZip(
        Array.from({ length: 5 }, (_, i) => ({
          ...file,
          path: `file-${i}.md`,
        })),
      ),
    /ファイル/,
  );
  assert.throws(
    () =>
      createStoredZip([{ ...file, bytes: new Uint8Array(1024 * 1024 + 1) }]),
    /1 MiB/,
  );
  assert.throws(
    () =>
      createStoredZip(
        Array.from({ length: 4 }, (_, i) => ({
          path: `file-${i}.md`,
          bytes: new Uint8Array(1024 * 1024),
        })),
      ),
    /4 MiB/,
  );
});
