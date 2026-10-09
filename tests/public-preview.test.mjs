import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { decodeHTML, decodeHTMLAttribute } from 'entities';
import { parse as parseYaml } from 'yaml';
import {
  assertPublicPreviewMode,
  localBuildEnabled,
  localFeatures,
  publicPreviewEnabled,
} from '../src/lib/build-mode.mjs';
import {
  PUBLIC_PREVIEW_NOTE_ID,
  PUBLIC_PREVIEW_NOTE_TITLE,
  PUBLIC_PREVIEW_WORKS,
  publicPreviewNotes,
  publicPreviewWorks,
} from '../src/lib/public-preview.mjs';
import { noteTopics } from '../src/lib/note-topics.mjs';
import { checkPublicPreviewSource } from '../scripts/check-public-preview-source.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const enabled = publicPreviewEnabled(process.env.PUBLIC_PREVIEW);
const base = (process.env.BASE_PATH || '/').replace(/\/+$/, '');
const origin = 'https://preview-boundary.invalid';
const siteOrigin =
  process.env.SITE_ORIGIN || 'https://koseihamaya2077.github.io/';
const evidence = await checkPublicPreviewSource();
const articleFile = `notes/${PUBLIC_PREVIEW_NOTE_ID}/index.html`;
const aliasFile = `notes/${PUBLIC_PREVIEW_NOTE_ID}.html`;
const expectedPages = [
  '404.html',
  'about/index.html',
  'index.html',
  aliasFile,
  articleFile,
  'notes/index.html',
  'works/index.html',
].sort();
const allowedExternalLinks = new Set([
  'https://github.com/KOSEIHAMAYA2077',
  ...PUBLIC_PREVIEW_WORKS.map((entry) => entry.repository),
]);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const plain = (html) =>
  decodeHTML(html.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
const attributes = (tag) =>
  Object.fromEntries(
    [
      ...tag.matchAll(
        /\s([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
      ),
    ].map((match) => [
      match[1].toLowerCase(),
      decodeHTMLAttribute(match[2] ?? match[3] ?? match[4] ?? ''),
    ]),
  );

async function filesIn(directory) {
  return (
    await Promise.all(
      (await readdir(directory, { withFileTypes: true })).map((entry) => {
        const filename = path.join(directory, entry.name);
        return entry.isDirectory() ? filesIn(filename) : [filename];
      }),
    )
  ).flat();
}

let outputPromise;
function output() {
  outputPromise ??= (async () => {
    const files = await filesIn(dist).catch(() => {
      throw new Error(
        '先に同じBASE_PATHで npm run build:public-preview を実行してください。',
      );
    });
    return new Map(
      await Promise.all(
        files.map(async (filename) => [
          path.relative(dist, filename).split(path.sep).join('/'),
          await readFile(filename, 'utf8'),
        ]),
      ),
    );
  })();
  return outputPromise;
}

function sourceWorks() {
  return PUBLIC_PREVIEW_WORKS.map((source) => ({
    id: source.id,
    data: {
      ...source,
      description: source.description ?? 'PRIVATE FALLBACK DESCRIPTION',
      draft: true,
      date: '2026-10-05',
      status: '記録',
      roles: ['PRIVATE ROLE'],
      privateMemo: 'PRIVATE MEMO',
    },
    body: 'PRIVATE WORK BODY',
  }));
}

test('PUBLIC_PREVIEWは明示値1だけで有効になり、開発serverでもlocal機能を注入しない', () => {
  for (const value of [undefined, '', '0', 'true', true, 1])
    assert.equal(publicPreviewEnabled(value), false);
  assert.equal(publicPreviewEnabled('1'), true);
  assert.equal(localBuildEnabled({ PUBLIC_PREVIEW: '1' }, true), false);
  assert.deepEqual(localFeatures({ PUBLIC_PREVIEW: '1' }), {
    workroom: false,
    comparison: false,
    experiments: false,
    candidates: false,
    timeline: false,
  });
  for (const flag of [
    'LOCAL_WORKROOM',
    'LOCAL_STUDIO',
    'LOCAL_COMPARISON',
    'LOCAL_EXPERIMENTS',
    'LOCAL_CANDIDATES',
    'LOCAL_TIMELINE',
    'LOCAL_FUTURE_FEATURE',
  ]) {
    const env = { PUBLIC_PREVIEW: '1', [flag]: '1' };
    assert.throws(() => assertPublicPreviewMode(env), /同時に指定できません/);
    assert.throws(() => localFeatures(env), /同時に指定できません/);
    assert.throws(() => localBuildEnabled(env), /同時に指定できません/);
  }
});

test('作品は6件の公開出典フィールドのみへ射影し、unknownや私的な本文・日付を持ち出さない', () => {
  const entries = sourceWorks();
  entries.push({ id: 'unknown', data: { title: 'PRIVATE UNKNOWN' } });
  const before = structuredClone(entries);
  const selected = publicPreviewWorks(entries);
  assert.deepEqual(selected, PUBLIC_PREVIEW_WORKS);
  assert.deepEqual(entries, before);
  for (const entry of selected)
    assert.deepEqual(Object.keys(entry).sort(), [
      'description',
      'id',
      'repository',
      'title',
    ]);
  assert.ok(!JSON.stringify(selected).includes('PRIVATE'));
  selected[0].title = 'changed copy';
  assert.equal(PUBLIC_PREVIEW_WORKS[0].title, 'TypeAndSummon');
  for (const key of ['title', 'repository', 'description']) {
    const changed = sourceWorks();
    changed[0].data[key] = 'changed';
    assert.throws(() => publicPreviewWorks(changed), /作品出典/);
  }
  assert.throws(() => publicPreviewWorks(entries.slice(1)), /作品出典/);
});

test('公開記事は専用collectionの固定IDだけを選び、原本のdraftを変更しない', () => {
  const article = {
    id: PUBLIC_PREVIEW_NOTE_ID,
    data: {
      title: PUBLIC_PREVIEW_NOTE_TITLE,
      date: '2026-07-30',
      draft: true,
      category: '雑記',
      tags: ['Cyberpunk2077'],
    },
  };
  assert.deepEqual(publicPreviewNotes([{ id: 'unknown', data: {} }, article]), [
    article,
  ]);
  assert.equal(article.data.draft, true);
  assert.deepEqual(noteTopics(article), ['ゲーム', '感想']);
  for (const [key, value] of [
    ['title', 'changed'],
    ['date', '2026-10-09'],
    ['draft', false],
  ])
    assert.throws(
      () =>
        publicPreviewNotes([
          { ...article, data: { ...article.data, [key]: value } },
        ]),
      /記事出典/,
    );
  assert.throws(
    () => publicPreviewNotes([{ ...article, id: 'legacy-cyberpunk2077-1' }]),
    /記事出典/,
  );
});

test('公開元の24本文ブロックと複製hashを固定し、既存移行原稿は保護hashのまま', async () => {
  assert.equal(
    evidence.rawHtmlSha256,
    '7945c347aab6649fc5c6c8405eb74fe845025b807576cebace2a5ee6efb3e668',
  );
  assert.equal(
    digest(JSON.stringify(evidence.blocks)),
    '97adc15e57ca39b6598af502a8fddd0e62936137d29afc6fd1adce21278d72bf',
  );
  assert.equal(evidence.blocks.length, 24);
  const legacy = await readFile(
    path.join(root, 'src/content/notes/legacy-cyberpunk2077-1.md'),
  );
  assert.equal(
    digest(legacy),
    'cd173d32ec5de03c81f23188d059ce759a1ca33482edc3caa3d204bf16e48b51',
  );
  for (const filename of await filesIn(path.join(root, 'src/content'))) {
    const raw = await readFile(filename, 'utf8');
    const data = parseYaml(raw.match(/^---\s*\n([\s\S]*?)\n---/)?.[1]);
    assert.equal(data.draft, true, filename);
  }
});

test(
  '公開用出力は6ページと旧記事URLだけで、docs・vendor・作業室・元ソースを含めない',
  { skip: !enabled },
  async () => {
    const files = await output();
    assert.deepEqual(
      [...files.keys()].filter((file) => file.endsWith('.html')).sort(),
      expectedPages,
    );
    for (const file of files.keys()) {
      assert.ok(
        expectedPages.includes(file) ||
          ['.nojekyll', 'favicon.svg', 'third-party-notices.txt'].includes(
            file,
          ) ||
          /^_astro\/[^/]+\.(?:js|css)$/.test(file),
        file,
      );
      assert.doesNotMatch(
        file,
        /(?:room|compare|write|directions|vendor|docs|experiment|maker|return-history|_?example)|\.(?:map|md|json|ts|astro)$/i,
      );
    }
  },
);

test(
  'homeとworksには出典どおりの6リンクだけを表示し、仮の日付・説明や履歴属性を載せない',
  { skip: !enabled },
  async () => {
    const files = await output();
    for (const filename of ['index.html', 'works/index.html']) {
      const html = files.get(filename);
      const list = html.match(
        /<ul class="simple-works"[^>]*>([\s\S]*?)<\/ul>/,
      )?.[1];
      assert.ok(list, filename);
      const rows = [...list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)];
      assert.equal(rows.length, 6);
      rows.forEach((row, index) => {
        const approved = PUBLIC_PREVIEW_WORKS[index];
        assert.equal(
          attributes(row[0].match(/^<li\b[^>]*>/)[0]).id,
          `piece-${approved.id}`,
        );
        assert.equal(
          attributes(row[1].match(/<a\b[^>]*>/)[0]).href,
          approved.repository,
        );
        assert.equal(
          plain(row[1].match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/)[1]),
          approved.title,
        );
        const paragraph = row[1].match(/<p\b[^>]*>([\s\S]*?)<\/p>/)?.[1];
        assert.equal(
          paragraph === undefined ? null : plain(paragraph),
          approved.description === null
            ? null
            : approved.description.replace(/\s+/g, ' ').trim(),
        );
      });
      assert.doesNotMatch(
        list,
        /data-return-|<time\b|PRIVATE|説明未入力|公開済み|制作中/,
      );
    }
  },
);

function authoredBlocks(html) {
  const body = html.match(/<div class="prose"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(body, '本文のproseがありません。');
  return [...body.matchAll(/<(h2|p)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(
    ([, tag, raw]) => {
      const segments = [
        ...raw.matchAll(
          /<strong\b[^>]*>([\s\S]*?)<\/strong>|([^<]+(?:<(?!\/?strong\b)[^>]+>[^<]*)*)/g,
        ),
      ]
        .map((match) => ({
          text: decodeHTML(
            (match[1] ?? match[2]).replace(/<[^>]+>/g, ''),
          ).replace(/\s+/g, ' '),
          strong: match[1] !== undefined,
        }))
        .filter((segment) => segment.text);
      if (segments.length) {
        segments[0].text = segments[0].text.trimStart();
        segments.at(-1).text = segments.at(-1).text.trimEnd();
      }
      return { tag, segments };
    },
  );
}

test(
  '正規記事と旧.htmlは同じ本文24ブロック・強調5箇所を保ち、canonicalは新正規URL',
  { skip: !enabled },
  async () => {
    const files = await output();
    const html = files.get(articleFile);
    assert.equal(files.get(aliasFile), html);
    assert.deepEqual(authoredBlocks(html), evidence.blocks);
    assert.equal(
      plain(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1]),
      PUBLIC_PREVIEW_NOTE_TITLE,
    );
    assert.match(html, /<time datetime="2026-07-30"/);
    const canonical = [...html.matchAll(/<link\b[^>]*>/g)]
      .map(([tag]) => attributes(tag))
      .find((attrs) => attrs.rel === 'canonical');
    assert.equal(
      canonical?.href,
      new URL(`${base}/notes/${PUBLIC_PREVIEW_NOTE_ID}/`, siteOrigin).href,
    );
  },
);

test(
  'notes一覧には公開記事1件とゲーム・感想の検索表示だけを載せ、本文は記事HTML外へ出さない',
  { skip: !enabled },
  async () => {
    const files = await output();
    const list = files.get('notes/index.html');
    assert.equal((list.match(/\bdata-entry(?:\s|>)/g) || []).length, 1);
    assert.match(list, /data-topics="ゲーム\|感想"/);
    assert.ok(list.includes(`href="${base}/notes/${PUBLIC_PREVIEW_NOTE_ID}/"`));
    assert.ok(list.includes(PUBLIC_PREVIEW_NOTE_TITLE));
    for (const [file, source] of files) {
      if ([articleFile, aliasFile].includes(file)) continue;
      const decoded = decodeHTML(source);
      for (const block of evidence.blocks.filter(
        (block) => block.tag === 'p',
      )) {
        const excerpt = block.segments
          .map((segment) => segment.text)
          .join('')
          .slice(0, 60);
        assert.ok(
          !decoded.includes(excerpt),
          `${file}: 記事本文を持ち出しています`,
        );
      }
    }
  },
);

async function checkReference(reference, filename, files, anchor = false) {
  assert.ok(reference, `${filename}: 空の参照`);
  const url = new URL(reference, `${origin}${base}/${filename}`);
  if (url.origin !== origin) {
    assert.ok(
      anchor && allowedExternalLinks.has(url.href),
      `${filename}: 未許可の外部参照 ${reference}`,
    );
    return;
  }
  assert.ok(
    url.pathname.startsWith(`${base}/`),
    `${filename}: BASE_PATH外 ${reference}`,
  );
  const relative = decodeURIComponent(url.pathname.slice(base.length)).replace(
    /^\/+/,
    '',
  );
  assert.ok(!relative.split('/').includes('..'), `${filename}: dist外の参照`);
  const target =
    relative.endsWith('/') || relative === ''
      ? `${relative}index.html`
      : files.has(relative)
        ? relative
        : `${relative}/index.html`;
  assert.ok(files.has(target), `${filename}: 参照先なし ${reference}`);
  if (url.hash && target.endsWith('.html')) {
    const ids = [
      ...files.get(target).matchAll(/\bid=(?:"([^"]*)"|'([^']*)')/g),
    ].map((match) => decodeHTMLAttribute(match[1] ?? match[2]));
    assert.ok(
      ids.includes(decodeURIComponent(url.hash.slice(1))),
      `${filename}: IDなし ${reference}`,
    );
  }
}

test(
  '全HTMLのリンク・画像・script・CSSがBASE_PATH内で解決し、外部リンクは本人GitHubと6作品だけ',
  { skip: !enabled },
  async () => {
    const files = await output();
    for (const [filename, source] of files) {
      if (filename.endsWith('.html')) {
        assert.doesNotMatch(source, /<iframe\b|<form\b|<base\b/);
        for (const [tag] of source.matchAll(
          /<(?:a|link|script|img|source)\b[^>]*>/g,
        )) {
          const attrs = attributes(tag);
          if (attrs.rel === 'canonical') continue;
          if (attrs.href || attrs.src)
            await checkReference(
              attrs.href || attrs.src,
              filename,
              files,
              tag.startsWith('<a '),
            );
          assert.equal(attrs.srcset, undefined, `${filename}: 未検証のsrcset`);
        }
      }
      if (filename.endsWith('.css'))
        for (const [, reference] of source.matchAll(
          /url\(\s*["']?([^"')\s]+)["']?\s*\)/g,
        ))
          await checkReference(reference, filename, files);
    }
  },
);

test(
  '公開出力は私的な操作・保存・送信moduleや候補説明を含まず、main/skipと公開先の検索指示を保つ',
  { skip: !enabled },
  async () => {
    const files = await output();
    const candidates = JSON.parse(
      await readFile(path.join(root, 'src/data/work-candidates.json'), 'utf8'),
    );
    for (const [filename, source] of files) {
      assert.doesNotMatch(
        source,
        /sourceMappingURL|\/Users\/|\/private\/tmp\/|hamaya-workroom-return-v1|workroom:return-|data-return-|data-workroom-|data-local-tool|data-maker-|draft-writer|maker-field-bridge|data-focus-study|data-collection-study|data-experiment-study|data-candidate-study|data-timeline-study|LOCAL_WORKROOM|LOCAL_COMPARISON|PRIVATE MEMO|PRIVATE ROLE/,
      );
      if (filename.endsWith('.js'))
        assert.doesNotMatch(
          source,
          /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|indexedDB|serviceWorker/,
        );
      const decoded = decodeHTML(source);
      for (const candidate of candidates)
        assert.ok(
          !decoded.includes(candidate.summary),
          `${filename}: 確認待ち候補の説明`,
        );
      if (!filename.endsWith('.html')) continue;
      assert.match(source, /<html lang="ja"/);
      assert.equal((source.match(/<h1\b/g) || []).length, 1, filename);
      assert.equal((source.match(/<main\b/g) || []).length, 1, filename);
      assert.match(source, /<main id="main-content"/);
      assert.match(source, /class="skip-link" href="#main-content"/);
      if (filename === '404.html')
        assert.match(source, /name="robots" content="noindex, nofollow"/);
      else assert.doesNotMatch(source, /name="robots"/);
      assert.doesNotMatch(source, /href="[^" ]*atcoder[^" ]*"/i);
    }
    const about = files.get('about/index.html');
    assert.doesNotMatch(about, /未入力|入力してください/);
    assert.ok(about.includes('href="https://github.com/KOSEIHAMAYA2077"'));
  },
);
