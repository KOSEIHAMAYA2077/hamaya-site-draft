import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { decodeHTMLAttribute } from 'entities';
import { parse as parseYaml } from 'yaml';
import { workroomEnabled } from '../src/lib/build-mode.mjs';
import { comparisonSources } from '../src/lib/collection-study.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const enabled = workroomEnabled(process.env.LOCAL_WORKROOM);
const base = (process.env.BASE_PATH || '/').replace(/\/+$/, '');
const origin = 'https://return-boundary.invalid';
// These owner-content hashes were checked before the independent return-entry
// experiment. The simple layout may change about.astro, while the biography and
// profile settings in site.json and every original content file remain unchanged.
const protectedHashes = {
  'src/content/notes/_example.md':
    '362da201db6d72c4d78334b1698a4eafaca29bc42d1f81e6226a8ab51d26b344',
  'src/content/notes/legacy-cyberpunk2077-1.md':
    'cd173d32ec5de03c81f23188d059ce759a1ca33482edc3caa3d204bf16e48b51',
  'src/content/works/_example.md':
    '411013da78d509acf8c839a957fd3acd1f6acb6e0c187b5eebaab5de5810ec4f',
  'src/content/works/import-de10-nano-riscv-invader.md':
    'bb49a6e939a10cdb4b7c24e08a18a69d5887a22811df3e470d512e76d6ac7afe',
  'src/content/works/import-de10-nano-voice-changer.md':
    'a2eaa1488d0100505fe0db00370ce301d364b27a5f88694f27e6c6c5630a6ae8',
  'src/content/works/import-game-ai-search-puzzles.md':
    '3fb5a0041e48385a1f197a82ab28b8b18222153d59d322ed2deb94ae6b05b151',
  'src/content/works/import-one-board-incremental.md':
    '6a71b6dd44f30e52ca06422f5a42e20ff7fb32f41e7719d04cdb60db5744123e',
  'src/content/works/import-pong-study-raylib.md':
    'a66cb9d1e5b9d87481e5ad77a3f7e2d92fac61ffb061797931b87ce4ef4d7a00',
  'src/content/works/import-typeandsummon.md':
    'ce1690bd7fc9ecff1826411ad574293cad179560b155c70269c7c918a0f0adbd',
  'src/data/creation-dates.json':
    'ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356',
  'src/data/public-assets.json':
    '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570',
  'src/data/site.json':
    'be95d1e49dd8a22fffe174abb0eb083e7f8b8b9e8c11cfda19fe46de7e5d7392',
  'src/data/work-candidates.json':
    'f4a25b0c66b225819b126df6321b3aa5e1e78dbc3f01c8c4b3551b5c919f1a96',
  'src/data/work-records.json':
    'ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356',
};
const integratedPages = [
  '404.html',
  'about/index.html',
  'compare/candidates/index.html',
  'compare/collection/index.html',
  'compare/experiments/index.html',
  'compare/focus/index.html',
  'compare/timeline/index.html',
  'directions/desk/index.html',
  'directions/field/index.html',
  'directions/index.html',
  'directions/orbit/index.html',
  'directions/paper/index.html',
  'directions/signal/index.html',
  'index.html',
  'notes/index.html',
  'room/archive/index.html',
  'room/compare/index.html',
  'room/notes/index.html',
  'room/notes/legacy-cyberpunk2077-1/index.html',
  'room/settings/index.html',
  'works/index.html',
  'write/index.html',
  'write/maker-field/index.html',
].sort();

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

let artifactsPromise;
function artifacts() {
  artifactsPromise ??= (async () => {
    const files = await filesIn(dist).catch(() => {
      throw new Error('対象modeでbuildし、同じ環境変数でテストしてください。');
    });
    return new Map(
      await Promise.all(
        files
          .filter((filename) =>
            /\.(?:html|js|mjs|css|json|txt|map)$/.test(filename),
          )
          .map(async (filename) => [
            path.relative(dist, filename).split(path.sep).join('/'),
            await readFile(filename, 'utf8'),
          ]),
      ),
    );
  })();
  return artifactsPromise;
}

function decoded(source) {
  return decodeHTMLAttribute(source).replace(
    /\\u([a-f0-9]{4})|\\x([a-f0-9]{2})/gi,
    (_, unicode, ascii) => String.fromCharCode(parseInt(unicode || ascii, 16)),
  );
}

function attributes(tag) {
  return Object.fromEntries(
    [
      ...tag.matchAll(
        /\s([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
      ),
    ].map((match) => [
      match[1].toLowerCase(),
      decodeHTMLAttribute(match[2] ?? match[3] ?? match[4] ?? ''),
    ]),
  );
}

function localAsset(reference, parent) {
  const url = new URL(reference, `${origin}${base}/${parent}`);
  assert.equal(url.origin, origin, `${parent}: 外部asset`);
  assert.ok(url.pathname.startsWith(`${base}/`), `${parent}: base外のasset`);
  return decodeURIComponent(url.pathname.slice(base.length)).replace(
    /^\/+/,
    '',
  );
}

test('簡素な表示への変更でも本人の原文・プロフィール・素材設定14ファイルを変更しない', async () => {
  const protectedFiles = [
    ...(await filesIn(path.join(root, 'src/content'))),
    ...(await filesIn(path.join(root, 'src/data'))),
  ].map((filename) => path.relative(root, filename).split(path.sep).join('/'));
  assert.deepEqual(protectedFiles.sort(), Object.keys(protectedHashes).sort());
  for (const [filename, expected] of Object.entries(protectedHashes)) {
    const buffer = await readFile(path.join(root, filename));
    const actual = createHash('sha256').update(buffer).digest('hex');
    assert.equal(
      actual,
      expected,
      `${filename}: 比較前の内容から変更されています`,
    );
  }
});

test('再開入口・保存キー・操作bundleはLOCAL_WORKROOM以外の全生成物へ混ぜない', async () => {
  if (enabled) return;
  for (const [filename, source] of await artifacts()) {
    assert.doesNotMatch(
      filename,
      /(?:ReturnEntry|ReturnSettings|ReturnBridge|return-(?:state|controller))/i,
    );
    assert.ok(
      !/hamaya-workroom-return-v1|workroom:return-|data-return-|data-workroom-return|ReturnEntry|ReturnSettings|ReturnBridge/.test(
        decoded(source),
      ),
      `${filename}: 再開機能が統合mode以外へ出力されています`,
    );
  }
});

test('再開入口は統合候補の既存23ページを利用し、新しい配布routeを増やさない', async () => {
  if (!enabled) return;
  const output = await artifacts();
  assert.deepEqual(
    [...output.keys()].filter((filename) => filename.endsWith('.html')).sort(),
    integratedPages,
  );
});

test('再開欄・設定・記録IDは必要なページだけに置き、共通bridgeへ内容を持たせない', async () => {
  if (!enabled) return;
  const output = await artifacts();
  for (const [filename, html] of output) {
    if (!filename.endsWith('.html')) continue;
    const tags = [...html.matchAll(/<[a-z][^>]*>/gi)].map(([tag]) => ({
      tag,
      attrs: attributes(tag),
    }));
    const marked = (name) =>
      tags.filter(({ attrs }) => Object.hasOwn(attrs, name));
    assert.equal(
      marked('data-return-panel').length,
      filename === 'index.html' ? 1 : 0,
      filename,
    );
    assert.equal(
      marked('data-return-catalog').length,
      filename === 'index.html' ? 1 : 0,
      filename,
    );
    assert.equal(
      marked('data-return-controls').length,
      filename === 'room/settings/index.html' ? 1 : 0,
      filename,
    );
    const noteMarkers = marked('data-return-note-id');
    assert.equal(
      noteMarkers.length,
      filename === 'room/notes/legacy-cyberpunk2077-1/index.html' ? 1 : 0,
      filename,
    );
    for (const { attrs } of noteMarkers)
      assert.equal(attrs['data-return-note-id'], 'legacy-cyberpunk2077-1');
    const bridges = marked('data-return-error');
    assert.equal(bridges.length, 1, `${filename}: 共通bridgeの個数`);
    assert.ok(/\bhidden(?:\s|>)/.test(bridges[0].tag), filename);
    const bridge = html.match(
      /<p\b[^>]*data-return-error[^>]*>([\s\S]*?)<\/p>/,
    );
    assert.ok(
      bridge && bridge[1].trim() === '',
      `${filename}: bridgeの初期内容`,
    );
  }

  const home = output.get('index.html');
  const main = home.match(/<main\b[^>]*>[\s\S]*?<\/main>/)?.[0];
  assert.ok(main);
  assert.doesNotMatch(
    main,
    /data-return-panel/,
    '再開欄が主コンテンツへ戻っています',
  );
  const footer = home.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/)?.[0];
  assert.ok(footer, '再開欄を置くfooterがありません');
  const details = [];
  let behindClosedDetails = false;
  for (const [tag] of footer.matchAll(/<\/?details\b[^>]*>/g)) {
    if (tag.startsWith('</')) details.pop();
    else {
      if (Object.hasOwn(attributes(tag), 'data-return-panel')) {
        behindClosedDetails = details.some(
          (attrs) => !Object.hasOwn(attrs, 'open'),
        );
        break;
      }
      details.push(attributes(tag));
    }
  }
  assert.ok(
    behindClosedDetails,
    '初回の再開欄が閉じた編集欄に収まっていません',
  );
  for (const name of ['enabled', 'work-link', 'note-link']) {
    const tag = home.match(
      new RegExp(`<[^>]+data-return-${name}(?:[\\s=>])[^>]*>`),
    )?.[0];
    assert.ok(
      tag && /\bhidden(?:\s|>)/.test(tag),
      `初回 ${name} が表示されています`,
    );
    if (name.endsWith('-link'))
      assert.equal(
        attributes(tag).href,
        undefined,
        `${name}: 初回の架空リンク`,
      );
  }
  const settings = output.get('room/settings/index.html');
  const enable = settings.match(/<input\b[^>]*data-return-enable[^>]*>/)?.[0];
  assert.ok(enable, '明示的な保存ONの操作がありません');
  assert.ok(!/\bchecked(?:\s|>)/.test(enable), '初回から保存がONです');
  assert.ok(
    /<button\b[^>]*data-return-clear/.test(settings),
    '履歴の削除操作がありません',
  );
});

test('ホームの再開catalogは既存6制作と記録1件のID・題名だけを渡す', async () => {
  if (!enabled) return;
  const home = (await artifacts()).get('index.html');
  const catalogTag = [
    ...home.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g),
  ].find(([tag]) =>
    Object.hasOwn(
      attributes(tag.slice(0, tag.indexOf('>') + 1)),
      'data-return-catalog',
    ),
  );
  assert.ok(catalogTag, 'ホームの再開catalogがありません');
  assert.equal(
    attributes(catalogTag[0].slice(0, catalogTag[0].indexOf('>') + 1)).type,
    'application/json',
  );
  const catalog = JSON.parse(catalogTag[1]);
  const expectedWork = await Promise.all(
    comparisonSources.map(async ({ id }) => {
      const source = await readFile(
        path.join(root, `src/content/works/${id}.md`),
        'utf8',
      );
      const data = parseYaml(
        source.match(/^---\s*\n([\s\S]*?)\n---(?:\n|$)/)[1],
      );
      return { id, title: data.title };
    }),
  );
  const note = await readFile(
    path.join(root, 'src/content/notes/legacy-cyberpunk2077-1.md'),
    'utf8',
  );
  const noteData = parseYaml(note.match(/^---\s*\n([\s\S]*?)\n---(?:\n|$)/)[1]);
  assert.deepEqual(catalog, {
    work: expectedWork,
    note: [{ id: 'legacy-cyberpunk2077-1', title: noteData.title }],
  });
});

test('再開のclient依存graphに本文・説明・日付・候補metadataや外部送信APIを入れない', async () => {
  if (!enabled) return;
  const output = await artifacts();
  const pageEntries = new Set();
  for (const [filename, html] of output) {
    if (!filename.endsWith('.html')) continue;
    const entries = [...html.matchAll(/<script\b[^>]*>/g)]
      .map(([tag]) => attributes(tag).src)
      .filter(Boolean)
      .map((reference) => localAsset(reference, filename))
      .filter(
        (target) =>
          /^_astro\/page\.[a-zA-Z0-9_-]+\.js$/.test(target) &&
          output.get(target)?.includes('hamaya-workroom-return-v1') &&
          output.get(target)?.includes('[data-return-error]'),
      );
    assert.equal(entries.length, 1, `${filename}: 再開専用page scriptの個数`);
    pageEntries.add(entries[0]);
  }
  assert.equal(pageEntries.size, 1, '再開の共通page entryは1つだけです');
  // Begin with the actual script attached to the generated HTML, then follow
  // imported chunks. An unreferenced matching asset is not proof of attachment.
  const scripts = new Set(pageEntries);
  for (const filename of scripts) {
    const source = output.get(filename);
    assert.ok(source, `${filename}: 依存するscriptがありません`);
    for (const [, reference] of source.matchAll(
      /(?:\bfrom\s*|\bimport\s*|\bimport\s*\(\s*)["']([^"']+\.m?js)["']/g,
    ))
      scripts.add(localAsset(reference, filename));
  }
  const forbidden = [];
  for (const filename of Object.keys(protectedHashes).filter(
    (name) => name.startsWith('src/content/') && name.endsWith('.md'),
  )) {
    const source = await readFile(path.join(root, filename), 'utf8');
    const frontmatter = source.match(/^---\s*\n([\s\S]*?)\n---(?:\n|$)/);
    const data = parseYaml(frontmatter?.[1] || '') || {};
    for (const key of ['title', 'description', 'date', 'repository'])
      if (typeof data[key] === 'string' && data[key].length >= 8)
        forbidden.push({ value: data[key], reason: `${filename} ${key}` });
    const body = source.slice(frontmatter?.[0].length || 0);
    for (const paragraph of body.split(/\n\s*\n/)) {
      const passage = paragraph.trim().split(/\*\*|\n/)[0];
      if (passage.length > 60)
        forbidden.push({
          value: passage.slice(0, 60),
          reason: `${filename} 本文`,
        });
    }
  }
  const candidates = JSON.parse(
    await readFile(path.join(root, 'src/data/work-candidates.json'), 'utf8'),
  );
  for (const candidate of candidates)
    for (const key of [
      'title',
      'summary',
      'commitDate',
      'repositoryUrl',
      'commit',
    ])
      if (typeof candidate[key] === 'string' && candidate[key].length >= 8)
        forbidden.push({
          value: candidate[key],
          reason: `候補 ${candidate.id} ${key}`,
        });
  for (const filename of scripts) {
    const source = decoded(output.get(filename));
    // Some existing titles are suffixes of the allowed IDs. Only those complete
    // IDs are exempt: passing the same title as separate metadata still fails.
    const ids = new Set([
      ...comparisonSources.map(({ id }) => id),
      'legacy-cyberpunk2077-1',
    ]);
    const withoutIds = source.replace(
      /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g,
      (literal) =>
        ids.has(literal.slice(1, -1)) ? `${literal[0]}${literal[0]}` : literal,
    );
    for (const { value, reason } of forbidden)
      assert.ok(
        !withoutIds.includes(value),
        `${filename}: 再開codeに不要な ${reason}`,
      );
    assert.ok(
      !/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/.test(
        source,
      ),
      `${filename}: 再開codeに外部通信API`,
    );
    assert.ok(
      !/YAMLParseError|YAMLWarning|MULTIPLE_DOCS/.test(source),
      `${filename}: 再開codeに取込parser`,
    );
  }
});
