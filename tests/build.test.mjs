import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(projectRoot, 'dist');
const base = (process.env.BASE_PATH || '/').replace(/\/+$/, '');
const origin = 'https://local-preview.invalid';
const site = JSON.parse(
  await readFile(path.join(projectRoot, 'src/data/site.json'), 'utf8'),
);

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(
    entries.map((entry) => {
      const filename = path.join(directory, entry.name);
      return entry.isDirectory() ? filesIn(filename) : [filename];
    }),
  );
  return groups.flat().sort();
}

async function exists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

const builtFiles = await filesIn(dist).catch(() => {
  throw new Error('dist がありません。先に npm run build を実行してください。');
});
const htmlFiles = builtFiles.filter((filename) => filename.endsWith('.html'));
const pages = new Map(
  await Promise.all(
    htmlFiles.map(async (filename) => [
      filename,
      await readFile(filename, 'utf8'),
    ]),
  ),
);
const contentFiles = (
  await filesIn(path.join(projectRoot, 'src/content'))
).filter((filename) => filename.endsWith('.md'));
const published = [];
const approvedExternalLinks = new Set(
  Object.values(site.links)
    .filter(Boolean)
    .map((url) => new URL(url).href),
);

for (const filename of contentFiles) {
  const content = await readFile(filename, 'utf8');
  const header = content.match(/^---\s*\n([\s\S]*?)\n---(?:\n|$)/)?.[1] || '';
  if (!/^draft:\s*false\s*$/m.test(header)) continue;
  published.push(filename);
  for (const match of content.matchAll(/\[[^\]]*\]\((https:\/\/[^\s)]+)\)/g))
    approvedExternalLinks.add(new URL(match[1]).href);
  for (const match of header.matchAll(
    /^(?:url|repository):\s*["']?(https:\/\/[^\s"']+)["']?\s*$/gm,
  )) {
    approvedExternalLinks.add(new URL(match[1]).href);
  }
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(
    /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
  )) {
    result[match[1].toLowerCase()] = (
      match[2] ??
      match[3] ??
      match[4]
    ).replaceAll('&amp;', '&');
  }
  return result;
}

async function checkLocalReference(reference, page, { anchor = false } = {}) {
  if (!reference) return;
  if (reference.startsWith('data:')) {
    assert.ok(!anchor, 'data URL をリンクに使わないでください。');
    return;
  }
  const relative = path.relative(dist, page).split(path.sep).join('/');
  const resolved = new URL(reference, `${origin}${base}/${relative}`);
  if (resolved.origin !== origin) {
    assert.equal(
      resolved.protocol,
      'https:',
      `外部URLはHTTPSのみ: ${reference}`,
    );
    assert.ok(
      anchor && approvedExternalLinks.has(resolved.href),
      `未確認の外部URL: ${reference}`,
    );
    return;
  }
  assert.ok(
    base === '' ||
      resolved.pathname === base ||
      resolved.pathname.startsWith(`${base}/`),
    `BASE_PATH ${base} の外へ出るURL: ${reference} (${relative})`,
  );
  const pathname = decodeURIComponent(resolved.pathname.slice(base.length));
  const target = path.resolve(dist, `.${pathname}`);
  assert.ok(
    target === dist || target.startsWith(`${dist}${path.sep}`),
    `dist の外へ出るURL: ${reference}`,
  );
  const candidates = pathname.endsWith('/')
    ? [path.join(target, 'index.html')]
    : [target, path.join(target, 'index.html')];
  let found;
  for (const candidate of candidates) {
    if (builtFiles.includes(candidate)) {
      found = candidate;
      break;
    }
  }
  assert.ok(found, `参照先が生成されていません: ${reference} (${relative})`);
  if (resolved.hash && found.endsWith('.html')) {
    const id = decodeURIComponent(resolved.hash.slice(1));
    const targetHtml = pages.get(found);
    const ids = [...targetHtml.matchAll(/\bid=(?:"([^"]*)"|'([^']*)')/g)].map(
      (match) => match[1] ?? match[2],
    );
    assert.ok(
      ids.includes(id),
      `リンク先のIDがありません: ${reference} (${relative})`,
    );
  }
}

test('トップ・作品・記事・自己紹介・404と.nojekyllが生成される', async () => {
  for (const filename of [
    'index.html',
    'works/index.html',
    'notes/index.html',
    'about/index.html',
    '404.html',
    '.nojekyll',
  ]) {
    assert.ok(await exists(path.join(dist, filename)), filename);
  }
});

test('下書き見本は一覧にも詳細ルートにも含まれない', () => {
  for (const filename of builtFiles) {
    assert.doesNotMatch(
      path.relative(dist, filename),
      /(?:^|\/)_?example(?:\/|\.)/,
    );
  }
  for (const html of pages.values()) {
    assert.doesNotMatch(html, /作品のタイトル|記事のタイトル/);
  }
});

test('各ページに単一h1・main・スキップリンク・noindexがある', () => {
  assert.ok(pages.size >= 5);
  for (const [filename, html] of pages) {
    const relative = path.relative(dist, filename);
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, relative);
    assert.equal((html.match(/<main(?:\s|>)/g) || []).length, 1, relative);
    const main = html.match(/<main\b[^>]*>/)?.[0];
    assert.equal(attributes(main).id, 'main-content', relative);
    assert.ok(
      [...html.matchAll(/<a\b[^>]*>/g)].some(
        (match) => attributes(match[0]).href === '#main-content',
      ),
      relative,
    );
    const robots = [...html.matchAll(/<meta\b[^>]*>/g)]
      .map((match) => attributes(match[0]))
      .find((meta) => meta.name === 'robots');
    assert.ok(robots?.content?.split(/[,\s]+/).includes('noindex'), relative);
    assert.match(html, /<html\b[^>]*\blang="ja"/, relative);
  }
});

test('HTMLのリンク・画像・CSS・スクリプトとCSS内参照がBASE_PATH配下で解決する', async () => {
  for (const [filename, html] of pages) {
    for (const match of html.matchAll(/<(a|link|img|script|source)\b[^>]*>/g)) {
      const attrs = attributes(match[0]);
      const reference = attrs.href ?? attrs.src;
      if (reference)
        await checkLocalReference(reference, filename, {
          anchor: match[1] === 'a',
        });
      if (attrs.srcset) {
        for (const image of attrs.srcset.split(',')) {
          await checkLocalReference(image.trim().split(/\s+/)[0], filename);
        }
      }
    }
  }
  for (const filename of builtFiles.filter((file) => file.endsWith('.css'))) {
    const css = await readFile(filename, 'utf8');
    for (const match of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) {
      if (!match[1].startsWith('#'))
        await checkLocalReference(match[1], filename);
    }
  }
});

test('未入力のAtCoder URLはアンカーにならず、プロフィールと空状態が明示される', () => {
  if (site.links.atcoder === null) {
    for (const html of pages.values()) {
      for (const anchor of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)) {
        assert.doesNotMatch(anchor[0], /atcoder/i);
      }
    }
    assert.match(pages.get(path.join(dist, 'about/index.html')), /URL未入力/);
  }
  if (site.bio === null) {
    assert.match(
      pages.get(path.join(dist, 'about/index.html')),
      /自己紹介文は未入力です。/,
    );
  }
  if (
    !published.some((filename) =>
      filename.includes(`${path.sep}works${path.sep}`),
    )
  ) {
    assert.match(
      pages.get(path.join(dist, 'works/index.html')),
      /まだ公開している作品はありません。/,
    );
  }
  if (
    !published.some((filename) =>
      filename.includes(`${path.sep}notes${path.sep}`),
    )
  ) {
    assert.match(
      pages.get(path.join(dist, 'notes/index.html')),
      /まだ公開している記事はありません。/,
    );
  }
});
