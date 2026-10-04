import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/tmp/hamaya-browser-qa/node_modules/playwright/index.mjs';
import { parse } from '../site-portable/node_modules/yaml/dist/index.js';

const out = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(out, 'writer-fixtures');
const downloads = path.join(out, 'writer-downloads');
const sample = path.resolve(out, '../site-portable/docs/portable-sample');
await Promise.all(
  [fixtures, downloads, sample].map((directory) =>
    mkdir(directory, { recursive: true }),
  ),
);
const origin = 'http://127.0.0.1:4364';
const base = `${origin}/portable-origin/`;
const marker = 'SYNTHETIC_PORTABLE_WRITER_20261004';
const body = `## 持ち運びの検証\n\n日本語と絵文字 🛰️ を含む合成の本文です。本人の記録ではありません。\n\n\`\`\`js\nconst message = "持ち運び 🛰️";\nconsole.log(message);\n\`\`\`\n\n![合成画像](./images/synthetic.png)\n\n${marker}\n`;
const common =
  'title: "持ち運びの検証用"\r\ndescription: "1行目\\r\\n2行目: # 値"\r\ndate: "2026-10-04"\r\ntags: ["a,b", " a ", "a,b", "日本語 🛰️"]\r\ndraft: true\r\ncategory: "雑記"\r\n';
const originalBody =
  '\r\n## 元の改行\r\n\r\n日本語 🛰️ と **強調**。  \r\n\r\n```js\r\nconst fixture = "# 値";\r\n```\r\n\r\n![合成画像](./images/synthetic.png)\r\n末尾に改行なし';
const original = `---\r\n${common}---\r\n\r\n${originalBody}`;
await Promise.all([
  writeFile(path.join(fixtures, 'portable-roundtrip-source.md'), original),
  writeFile(
    path.join(fixtures, 'portable-published-source.md'),
    original.replace('draft: true', 'draft: false'),
  ),
  writeFile(
    path.join(fixtures, 'comment.md'),
    original.replace(
      'title: "持ち運びの検証用"',
      'title: "置換しない検証用" # このメモを失わない',
    ),
  ),
  writeFile(
    path.join(fixtures, 'unknown.md'),
    original.replace(
      'category: "雑記"',
      'category: "雑記"\r\nextraPortable: "失わない設定"',
    ),
  ),
]);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const unpack = (markdown) => {
  const normalized = markdown.replace(/^\uFEFF/, '');
  const match = normalized.match(
    /^---\r?\n([\s\S]*?)\r?\n---\r?\n(?:\r?\n)?([\s\S]*)$/,
  );
  assert.ok(match, 'frontmatter/body separation');
  return { data: parse(match[1]), body: match[2] };
};
const report = {
  scope:
    'Writer browser verification with synthetic fixtures only; no owner content or public release.',
  checks: [],
  downloads: [],
  screenshots: [],
  requests: [],
  blockedRequests: [],
  pageErrors: [],
  consoleErrors: [],
  storageWrites: [],
  fixtureHashes: {},
  failure: null,
};
for (const name of [
  'portable-roundtrip-source.md',
  'portable-published-source.md',
  'comment.md',
  'unknown.md',
])
  report.fixtureHashes[name] = sha(await readFile(path.join(fixtures, name)));
const mark = (name, details = {}) => {
  report.checks.push({ name, ...details });
  console.log('PASS', name);
};
if (process.argv.includes('--prepare-only')) {
  await writeFile(
    path.join(out, 'writer-prepared.json'),
    JSON.stringify(
      { fixtureHashes: report.fixtureHashes, target: base, sample },
      null,
      2,
    ),
  );
  console.log('Prepared writer fixtures; no browser or server started.');
  process.exit(0);
}
const browser = await chromium.launch({ headless: true });
report.browser = browser.version();
const contexts = new Set();
async function context(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({
    acceptDownloads: true,
    viewport,
    reducedMotion: 'reduce',
  });
  contexts.add(ctx);
  await ctx.exposeBinding('__portableStorageWrite', (_, detail) =>
    report.storageWrites.push(detail),
  );
  await ctx.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      window.__portableStorageWrite({
        key,
        value: String(value),
        pathname: location.pathname,
        storage: this === localStorage ? 'local' : 'session',
      });
      return setItem.call(this, key, value);
    };
  });
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    report.requests.push({
      url,
      method: req.method(),
      containsFixture: `${url}${req.postData() || ''}`.includes(marker),
    });
    if (new URL(url).origin === origin) await route.continue();
    else {
      report.blockedRequests.push(url);
      await route.abort();
    }
  });
  ctx.on('page', (page) => {
    page.setDefaultTimeout(12000);
    page.on('pageerror', (error) => report.pageErrors.push(error.message));
    page.on('console', (event) => {
      if (event.type() === 'error') report.consoleErrors.push(event.text());
    });
    page.on('dialog', (dialog) => dialog.dismiss());
  });
  return ctx;
}
async function newWriter(ctx, kind = 'note') {
  const page = await ctx.newPage();
  const response = await page.goto(
    `${base}write/${kind === 'work' ? '?kind=work' : ''}`,
    { waitUntil: 'networkidle' },
  );
  assert.equal(response.status(), 200);
  await page.waitForFunction(
    () => !document.querySelector('[data-download-button]').disabled,
  );
  return page;
}
async function openDetails(page, selector, keyboard = false) {
  const el = page.locator(selector);
  if (!(await el.evaluate((node) => node.open))) {
    await el.locator('summary').focus();
    if (keyboard) await page.keyboard.press('Enter');
    else await el.locator('summary').click();
  }
  assert.equal(await el.evaluate((node) => node.open), true);
}
async function screenshot(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot({ path: path.join(out, name), fullPage: true });
  report.screenshots.push(name);
}
async function fit(page) {
  const size = await page.evaluate(() => ({
    viewport: innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(
    size.html <= size.viewport + 1 && size.body <= size.viewport + 1,
    JSON.stringify(size),
  );
  return size;
}
async function state(page) {
  return page.evaluate(() => ({
    fields: Object.fromEntries(
      Array.from(
        document.querySelectorAll(
          '#draft-writer input:not([type=file]), #draft-writer textarea, #draft-writer select',
        ),
      ).map((el) => [
        el.id,
        {
          value: el.value,
          disabled: el.disabled,
          hidden: el.hidden,
          invalid: el.getAttribute('aria-invalid'),
        },
      ]),
    ),
    previewHidden: document.querySelector('[data-preview-panel]').hidden,
    destination: document.querySelector('[data-destination]').textContent,
    readerHidden: document.querySelector('[data-reader-panel]').hidden,
  }));
}
async function actualDownload(
  page,
  destinationDirectory = downloads,
  expectedName,
) {
  const pending = page.waitForEvent('download');
  await page.locator('[data-download-button]').click();
  const download = await pending;
  if (expectedName) assert.equal(download.suggestedFilename(), expectedName);
  const destination = path.join(
    destinationDirectory,
    expectedName || download.suggestedFilename(),
  );
  await download.saveAs(destination);
  const bytes = await readFile(destination);
  const data = unpack(bytes.toString('utf8'));
  assert.equal(data.data.draft, true);
  report.downloads.push({
    filename: path.basename(destination),
    bytes: bytes.length,
    sha256: sha(bytes),
    fixture: true,
    location: path.relative(path.resolve(out, '..'), destination),
  });
  return { destination, bytes, ...data };
}
async function fill(page, kind) {
  const slug = `portable-writer-${kind}`;
  await page
    .locator('#write-title')
    .fill(`持ち運びの検証用・${kind === 'note' ? '記事' : '作品'}`);
  await page
    .locator('#write-body')
    .fill(kind === 'work' ? body.replace('./images/', 'images/') : body);
  await openDetails(page, '.writer-settings', true);
  await page
    .locator('#write-description')
    .fill('持ち運びの検証用の合成データです。本人の実績ではありません。');
  await page.locator('#write-date').fill('2026-10-04');
  await page.locator('#write-slug').fill(slug);
  await page.locator('#write-tags').fill('合成, 持ち運び, 日本語');
  if (kind === 'work') {
    await page.locator('#write-status').selectOption('記録');
    await page.locator('#write-coverSrc').fill('images/synthetic.png');
    await page.locator('#write-coverAlt').fill('持ち運び検証用の合成画像');
  } else await page.locator('#write-category').selectOption('雑記');
}
async function rejectWithoutChange(page, name, pattern) {
  const before = await state(page);
  await openDetails(page, '.writer-import', true);
  await page.locator('#write-import').setInputFiles(path.join(fixtures, name));
  await page.waitForFunction(() =>
    /は取り込めません/.test(
      document.querySelector('[data-import-status]').textContent,
    ),
  );
  assert.match(await page.locator('[data-import-status]').innerText(), pattern);
  assert.deepEqual(await state(page), before);
  assert.equal(await page.locator('[data-import-confirm]').isVisible(), false);
}
async function importFile(page, filename) {
  await openDetails(page, '.writer-import', true);
  await page.locator('#write-import').setInputFiles(filename);
  await page.waitForFunction(() =>
    /を取り込みました/.test(
      document.querySelector('[data-import-status]').textContent,
    ),
  );
}
try {
  const ctx = await context();
  const notePage = await newWriter(ctx);
  await fill(notePage, 'note');
  await notePage.locator('[data-preview-button]').focus();
  await notePage.keyboard.press('Enter');
  assert.equal(
    await notePage.locator('[data-preview-panel]').isVisible(),
    true,
  );
  assert.match(
    await notePage.locator('[data-image-handoff-hint]').innerText(),
    /\.md に画像本体は入りません/,
  );
  const note = await actualDownload(
    notePage,
    sample,
    'portable-writer-note.md',
  );
  assert.equal(note.body, body);
  assert.deepEqual(note.data.tags, ['合成', '持ち運び', '日本語']);
  assert.match(note.data.title, /記事/);
  mark(
    'Write, keyboard-confirm and download a note with Japanese, code, emoji, tags and relative image source',
    report.downloads.at(-1),
  );
  await rejectWithoutChange(
    notePage,
    'comment.md',
    /コメント.*元の \.md.*本文へ/,
  );
  await rejectWithoutChange(notePage, 'unknown.md', /extraPortable/);
  mark(
    'Rejected YAML comments and unknown settings preserve every existing input and downloaded preview',
  );
  await screenshot(notePage, 'writer-note-desktop.png');
  await notePage.close();

  const workPage = await newWriter(ctx, 'work');
  await fill(workPage, 'work');
  await workPage.locator('[data-preview-button]').click();
  const work = await actualDownload(
    workPage,
    sample,
    'portable-writer-work.md',
  );
  assert.deepEqual(work.data.cover, {
    src: 'images/synthetic.png',
    alt: '持ち運び検証用の合成画像',
  });
  assert.equal(work.data.status, '記録');
  assert.equal(work.body, body.replace('./images/', 'images/'));
  assert.ok(
    !Object.hasOwn(work.data, 'url') && !Object.hasOwn(work.data, 'repository'),
  );
  mark(
    'Write and download a work with cover metadata and body image; no invented external work link',
    report.downloads.at(-1),
  );
  await screenshot(workPage, 'writer-work-desktop.png');
  await workPage.close();

  const roundPage = await newWriter(ctx);
  await importFile(
    roundPage,
    path.join(fixtures, 'portable-roundtrip-source.md'),
  );
  assert.equal(await roundPage.locator('#write-kind').isDisabled(), true);
  await roundPage.locator('[data-reader-button]').click();
  assert.match(
    await roundPage.locator('[data-reader-panel]').innerText(),
    /画像: 合成画像/,
  );
  assert.equal(await roundPage.locator('[data-reader-panel] img').count(), 0);
  await roundPage.locator('[data-edit-button]').click();
  const round = await actualDownload(
    roundPage,
    downloads,
    'portable-roundtrip-source.md',
  );
  assert.equal(round.body, originalBody);
  assert.deepEqual(round.data, unpack(original).data);
  mark(
    'Import/read/export preserves CRLF body, final newline state and YAML values including duplicate or comma-bearing tags',
    {
      bodyBytes: Buffer.byteLength(round.body),
      bodySha256: sha(round.body),
      fullFileByteEqualityClaimed: false,
    },
  );
  await rejectWithoutChange(roundPage, 'comment.md', /コメント/);
  await rejectWithoutChange(roundPage, 'unknown.md', /extraPortable/);
  const afterReject = await actualDownload(
    roundPage,
    downloads,
    'portable-roundtrip-source.md',
  );
  assert.deepEqual(afterReject.bytes, round.bytes);
  mark(
    'After a valid import, rejected files leave form data and byte-identical exported output intact',
  );
  await roundPage.close();

  const draftPage = await newWriter(ctx);
  await importFile(
    draftPage,
    path.join(fixtures, 'portable-published-source.md'),
  );
  assert.match(
    await draftPage.locator('[data-import-status]').innerText(),
    /元の設定は draft: false.*draft: true/,
  );
  const draft = await actualDownload(
    draftPage,
    downloads,
    'portable-published-source.md',
  );
  assert.equal(draft.body, originalBody);
  mark(
    'Imported draft:false is explicitly explained and downloaded as draft:true without changing its body',
  );
  await draftPage.close();
  await ctx.close();
  contexts.delete(ctx);

  const mobile = await context({ width: 375, height: 812 });
  const mobilePage = await newWriter(mobile);
  assert.equal(
    await mobilePage.evaluate(
      () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
    true,
  );
  await mobilePage.locator('#write-title').focus();
  await mobilePage.keyboard.press('Tab');
  assert.equal(
    await mobilePage
      .locator('[data-edit-button]')
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await mobilePage.keyboard.press('Tab');
  assert.equal(
    await mobilePage
      .locator('[data-reader-button]')
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await mobilePage.keyboard.press('Enter');
  assert.equal(
    await mobilePage
      .locator('[data-reader-button]')
      .getAttribute('aria-pressed'),
    'true',
  );
  await mobilePage.locator('[data-edit-button]').focus();
  await mobilePage.keyboard.press('Enter');
  assert.equal(
    await mobilePage
      .locator('#write-body')
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await fill(mobilePage, 'note');
  await mobilePage.locator('[data-preview-button]').focus();
  await mobilePage.keyboard.press('Enter');
  await rejectWithoutChange(mobilePage, 'comment.md', /コメント/);
  const size = await fit(mobilePage);
  assert.equal(
    await mobilePage.evaluate(
      () =>
        document
          .getAnimations()
          .filter((animation) => animation.playState === 'running').length,
    ),
    0,
  );
  await screenshot(mobilePage, 'writer-mobile-375.png');
  mark(
    '375px mobile, reduced motion and keyboard editor/preview/import controls work without overflow',
    size,
  );
  await mobile.close();
  contexts.delete(mobile);

  assert.equal(report.blockedRequests.length, 0);
  assert.ok(
    report.requests.every(
      (request) => request.method === 'GET' && !request.containsFixture,
    ),
  );
  assert.equal(report.storageWrites.length, 0);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.consoleErrors, []);
  for (const [name, expected] of Object.entries(report.fixtureHashes))
    assert.equal(sha(await readFile(path.join(fixtures, name))), expected);
  mark(
    'No external requests, input transmission, browser storage writes or console/page errors; source fixtures unchanged',
    {
      requestCount: report.requests.length,
      storageWrites: report.storageWrites.length,
    },
  );
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const ctx of contexts) await ctx.close();
  await browser.close();
  await writeFile(
    path.join(out, 'writer-browser-evidence.json'),
    JSON.stringify(report, null, 2),
  );
}
