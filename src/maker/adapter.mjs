import { exportDraft } from '../lib/draft-export.mjs';

// Independent browser adaptation of the local Maker Field adapter and validation
// contract. Source hashes, scope and licensing notes are in source-manifest.json.
export const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_FRONTMATTER_BYTES = 64 * 1024;
const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_ENTRIES = 5000;
const COLLECTIONS = ['logs', 'experiments', 'ideas'];
export const COLLECTION_LABELS = Object.freeze({
  logs: '制作ログ',
  experiments: '実験',
  ideas: 'アイデア',
});
export const RECORD_FIELDS = Object.freeze([
  'id',
  'title',
  'date',
  'type',
  'project',
  'body',
  'tags',
  'related',
  'experimentId',
  'ideaId',
  'logId',
  'status',
  'hypothesis',
  'change',
  'observation',
  'next',
  'verdict',
  'beforeImage',
  'afterImage',
  'sample',
]);
export const LABELS = Object.freeze({
  id: '元の記録ID',
  title: '題',
  date: '日付',
  tags: 'タグ',
  type: '記録の種類',
  project: '作品・テーマ',
  body: '記録の本文',
  next: '次に試すこと',
  related: '関連ログID',
  experimentId: '旧形式の関連実験ID',
  ideaId: '旧形式の関連アイデアID',
  logId: '関連ログID',
  status: 'アイデアの段階',
  hypothesis: '仮説',
  change: '変えたこと',
  observation: '見えたこと',
  verdict: '判断',
  beforeImage: '変更前の画像',
  afterImage: '変更後の画像',
  sample: 'サンプルの指定',
});
const STRING_FIELDS = RECORD_FIELDS.filter(
  (key) => !['id', 'tags', 'related', 'sample'].includes(key),
);
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const has = (object, key) => Object.hasOwn(object, key);
const byteLength = (value) => new TextEncoder().encode(value).byteLength;

export class AdapterError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AdapterError';
  }
}
function fail(message) {
  throw new AdapterError(message);
}

function checkText(value) {
  // Check UTF-16 explicitly, including JSON escapes, without replacing characters.
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff))
        fail('不正なUnicode文字列です。単独サロゲートは変換できません。');
    } else if (code >= 0xdc00 && code <= 0xdfff)
      fail('不正なUnicode文字列です。単独サロゲートは変換できません。');
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value))
    fail('扱えない制御文字が含まれています。');
}

// Check the original token stream before JSON.parse can discard duplicate keys.
// Keys are decoded with the native JSON string parser, so escaped equivalents
// compare equal. Depth, size and node limits also apply to unselected records.
function inspectJSON(text) {
  let position = 0;
  let nodes = 0;
  const scalar =
    /(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/y;
  const syntax = () => fail('JSONを読み取れませんでした。');
  const whitespace = () => {
    while (position < text.length && /[ \t\n\r]/.test(text[position]))
      position += 1;
  };
  function string() {
    const start = position;
    if (text[position++] !== '"') syntax();
    while (position < text.length) {
      const character = text[position++];
      if (character === '\\') {
        position += 1;
        continue;
      }
      if (character !== '"') continue;
      let value;
      try {
        value = JSON.parse(text.slice(start, position));
      } catch {
        syntax();
      }
      if (value.length > 4 * 1024 * 1024) fail('データの文字列が長すぎます。');
      checkText(value);
      return value;
    }
    syntax();
  }
  function value(depth) {
    if (++nodes > 250000 || depth > 32)
      fail('データの構造が大きすぎるか、深すぎます。');
    whitespace();
    const character = text[position];
    if (character === '"') {
      string();
      return;
    }
    if (character === '{' || character === '[') {
      const object = character === '{';
      const closing = object ? '}' : ']';
      const keys = new Set();
      let entries = 0;
      position += 1;
      whitespace();
      if (text[position] === closing) {
        position += 1;
        return;
      }
      while (position < text.length) {
        if (++entries > (object ? 200 : MAX_ENTRIES))
          fail('データの項目が多すぎます。');
        whitespace();
        if (object) {
          const key = string();
          if (key.length > 200) fail('データのキーが長すぎます。');
          if (FORBIDDEN_KEYS.has(key)) fail('安全でないキーが含まれています。');
          if (keys.has(key))
            fail(
              'JSONに同じキーが重複しています。元のデータを確認してください。',
            );
          keys.add(key);
          whitespace();
          if (text[position++] !== ':') syntax();
        }
        value(depth + 1);
        whitespace();
        if (text[position] === closing) {
          position += 1;
          return;
        }
        if (text[position++] !== ',') syntax();
      }
      syntax();
    }
    scalar.lastIndex = position;
    const token = scalar.exec(text);
    if (!token) syntax();
    position = scalar.lastIndex;
    if (/[-\d]/.test(token[0][0]) && !Number.isFinite(Number(token[0])))
      fail('有限の数値だけを読み込めます。');
  }
  value(0);
  whitespace();
  if (position !== text.length) syntax();
}

function validateImage(value) {
  if (value === '') return;
  if (value.length > 4 * Math.ceil(MAX_IMAGE_BYTES / 3) + 23)
    fail('画像は1 MiB以内にしてください。');
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  if (!match || !match[2].length || match[2].length % 4 !== 0)
    fail('画像は空、またはPNG・JPEG・WebPのbase64にしてください。');
  const padding = match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0;
  if ((match[2].length / 4) * 3 - padding > MAX_IMAGE_BYTES)
    fail('画像は1 MiB以内にしてください。');
}

function validateState(state) {
  if (
    !state ||
    Array.isArray(state) ||
    typeof state !== 'object' ||
    state.version !== 1
  )
    fail('version: 1 のMaker Field JSONを選んでください。');
  const expected = ['version', ...COLLECTIONS];
  if (
    Object.keys(state).length !== expected.length ||
    Object.keys(state).some((key) => !expected.includes(key))
  )
    fail('データにはversion・logs・experiments・ideasだけを指定してください。');
  let count = 0;
  for (const collection of COLLECTIONS) {
    if (!Array.isArray(state[collection]))
      fail('3種類の記録は配列にしてください。');
    count += state[collection].length;
    const ids = new Set();
    for (const record of state[collection]) {
      if (
        !record ||
        Array.isArray(record) ||
        typeof record !== 'object' ||
        typeof record.id !== 'string' ||
        !record.id.trim() ||
        record.id.length > 160
      )
        fail('各記録には1〜160文字のIDが必要です。');
      if (ids.has(record.id)) fail(`${collection} に同じIDの記録があります。`);
      ids.add(record.id);
      if (Object.keys(record).some((key) => !RECORD_FIELDS.includes(key)))
        fail(
          `${collection} に未対応の項目があります。変換規則を確認するまで書き出しません。`,
        );
      for (const key of STRING_FIELDS)
        if (has(record, key) && typeof record[key] !== 'string')
          fail('記録の文章は文字列にしてください。');
      if (has(record, 'title') && record.title.length > 240)
        fail('題は240文字以内にしてください。');
      if (has(record, 'date') && record.date !== '') {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(record.date)
          ? new Date(`${record.date}T00:00:00.000Z`)
          : null;
        if (
          !date ||
          !Number.isFinite(date.getTime()) ||
          date.toISOString().slice(0, 10) !== record.date
        )
          fail('日付は空、または実在する日をYYYY-MM-DDで指定してください。');
      }
      for (const key of ['tags', 'related']) {
        if (!has(record, key)) continue;
        const maxItems = key === 'tags' ? 100 : MAX_ENTRIES;
        const maxLength = key === 'tags' ? 40 : 160;
        if (
          !Array.isArray(record[key]) ||
          record[key].length > maxItems ||
          record[key].some(
            (item) => typeof item !== 'string' || item.length > maxLength,
          )
        )
          fail(
            `${key} は${maxItems}件以内、各${maxLength}文字以内の文字列の配列にしてください。`,
          );
      }
      for (const key of ['beforeImage', 'afterImage'])
        if (has(record, key)) validateImage(record[key]);
      if (has(record, 'sample') && typeof record.sample !== 'boolean')
        fail('sampleはtrueまたはfalseにしてください。');
    }
  }
  if (count > MAX_ENTRIES)
    fail('記録は3種類の合計で5000件以内にしてください。');
  if (byteLength(JSON.stringify(state)) > MAX_INPUT_BYTES)
    fail('JSONは8 MiB以内にしてください。');
  return state;
}

/** Validate all records without modifying bytes, storing data or rendering HTML. */
export function parseMakerField(bytes) {
  if (!(bytes instanceof Uint8Array))
    fail('入力はUTF-8のJSONファイルのバイト列で渡してください。');
  if (bytes.byteLength > MAX_INPUT_BYTES)
    fail('JSONは8 MiB以内にしてください。');
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('JSONファイルが正しいUTF-8ではありません。');
  }
  inspectJSON(text);
  let state;
  try {
    state = JSON.parse(text);
  } catch {
    fail('JSONを読み取れませんでした。');
  }
  return validateState(state);
}

async function hash(bytes) {
  if (!globalThis.crypto?.subtle)
    fail('このブラウザでは下書きの確認処理を利用できません。');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function literalBlock(value) {
  const runs = value.match(/`+/g) || [];
  const fence = '`'.repeat(
    runs.reduce((length, run) => Math.max(length, run.length + 1), 3),
  );
  return `${fence}text\n${value}\n${fence}`;
}

/** Produce exactly one draft in memory. No filesystem, storage or network API. */
export async function convertMakerField(bytes, options) {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    fail('変換する記録を指定してください。');
  const optionKeys = ['collection', 'id', 'slug', 'description', 'category'];
  if (Object.keys(options).some((key) => !optionKeys.includes(key)))
    fail('未対応の変換設定です。draftや公開先は指定できません。');
  for (const key of optionKeys) {
    if (typeof options[key] !== 'string' || !options[key].trim())
      fail(`変換設定 ${key} が必要です。`);
    checkText(options[key]);
  }
  // Copy inputs before the first await, so a caller cannot change the selection
  // or bytes while WebCrypto is working.
  const settings = Object.fromEntries(
    optionKeys.map((key) => [key, options[key]]),
  );
  if (!COLLECTIONS.includes(settings.collection))
    fail('記録の種類を選んでください。');
  const state = parseMakerField(bytes);
  const sourceBytes = new Uint8Array(bytes);
  const selected = state[settings.collection].find(
    (record) => record.id === settings.id,
  );
  if (!selected) fail('指定した記録が見つかりません。');
  if (!selected.title || !selected.date)
    fail('選択した記録に題と日付が必要です。自動補完はしません。');
  const report = {
    adapterVersion: 1,
    draft: true,
    source: {
      collection: settings.collection,
      id: settings.id,
      version: state.version,
      inputSha256: await hash(sourceBytes),
      sample: selected.sample === true,
    },
    selection: {
      exportedRecords: 1,
      inputCounts: Object.fromEntries(
        COLLECTIONS.map((key) => [key, state[key].length]),
      ),
    },
    mappings: [],
    normalizations: [],
    omittedImages: [],
    limitations: [
      '画像のバイト列は含みません。元のMaker Field JSONを保管してください。',
      '関連IDは文字として保持し、サイトの作品・記事やURLへ自動対応させません。',
      '元の文章はコード枠内の文字です。Markdown記法やHTMLとして解釈しません。',
      'この出力は選択した1件の下書きであり、Maker Field全体のバックアップではありません。',
    ],
  };
  if (
    sourceBytes.length >= 3 &&
    sourceBytes[0] === 0xef &&
    sourceBytes[1] === 0xbb &&
    sourceBytes[2] === 0xbf
  )
    report.normalizations.push({
      field: '$input',
      action: 'UTF-8 BOM removed',
    });
  const normalize = (value, field) => {
    if (/\r/.test(value))
      report.normalizations.push({ field, action: 'CRLF/CR converted to LF' });
    return value.replace(/\r\n?/g, '\n');
  };
  const title = normalize(selected.title, 'title');
  const description = normalize(settings.description, '$description');
  const tags = (selected.tags || []).map((tag, index) =>
    normalize(tag, `tags[${index}]`),
  );
  report.mappings.push(
    { field: 'title', target: 'frontmatter.title' },
    { field: 'date', target: 'frontmatter.date' },
  );
  if (has(selected, 'tags'))
    report.mappings.push({ field: 'tags', target: 'frontmatter.tags' });
  const sections = [
    selected.sample === true
      ? '架空の検証用データです。本人の制作実績ではありません。'
      : 'Maker Fieldから手動で書き出した下書きです。',
    '元の文章は文字列として配置しています。関連IDはサイトのリンクに変換していません。',
    '## 元データの種類',
    literalBlock(settings.collection),
  ];
  for (const key of RECORD_FIELDS) {
    if (!has(selected, key) || ['title', 'date', 'tags'].includes(key))
      continue;
    const value = selected[key];
    sections.push(`## ${LABELS[key]}`);
    if (['beforeImage', 'afterImage'].includes(key) && value !== '') {
      const decoded = Uint8Array.from(
        atob(value.slice(value.indexOf(',') + 1)),
        (character) => character.charCodeAt(0),
      );
      const image = {
        field: key,
        decodedBytes: decoded.byteLength,
        sha256: await hash(decoded),
        reason: 'Image bytes excluded from Markdown',
      };
      report.omittedImages.push(image);
      report.mappings.push({
        field: key,
        target: 'body.image-omission-and-report',
      });
      sections.push(
        `画像データは含めていません。元のJSONを保管してください。\n\n${decoded.byteLength} bytes / SHA-256: ${image.sha256}`,
      );
    } else {
      const literal =
        typeof value === 'string'
          ? normalize(value, key)
          : JSON.stringify(value, null, 2);
      sections.push(literalBlock(literal));
      report.mappings.push({ field: key, target: 'body.literal' });
    }
  }
  let output;
  try {
    output = exportDraft({
      kind: 'note',
      slug: settings.slug,
      title,
      description,
      date: selected.date,
      tags,
      category: settings.category,
      body: sections.join('\n\n') + '\n',
      verbatimBody: true,
      verbatimMetadata: true,
    });
  } catch (error) {
    fail(
      `サイト下書き形式を確認してください。${Object.values(error.issues || {}).join(' ')}`,
    );
  }
  const end = output.markdown.indexOf('\n---\n', 4);
  if (
    end < 0 ||
    byteLength(output.markdown.slice(0, end + 5)) > MAX_FRONTMATTER_BYTES
  )
    fail('frontmatterが64 KiBを超えます。書き出しません。');
  const outputBytes = new TextEncoder().encode(output.markdown);
  if (outputBytes.byteLength > MAX_OUTPUT_BYTES)
    fail('Markdownが1 MiBを超えます。書き出しません。');
  report.output = {
    filename: output.filename,
    bytes: outputBytes.byteLength,
    sha256: await hash(outputBytes),
    frontmatterDraft: true,
  };
  return { filename: output.filename, markdown: output.markdown, report };
}
