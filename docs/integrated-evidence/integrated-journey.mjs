import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/tmp/hamaya-browser-qa/node_modules/playwright/index.mjs';

const out = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(out, 'fixtures');
const downloads = path.join(out, 'downloads');
await mkdir(fixtures, { recursive: true });
await mkdir(downloads, { recursive: true });
const origin = 'http://127.0.0.1:4360';
const base = `${origin}/hamaya-site-draft/`;
const marker = 'SYNTHETIC_INTEGRATED_JOURNEY_20261004';
const record = (id, title) => ({
  id,
  title,
  date: '2026-10-04',
  body: `${marker}\n合成データです。本人の記録ではありません。\n<script>window.__unexpected=true</script>`,
  sample: true,
});
const maker = {
  version: 1,
  logs: [
    record('synthetic-a', '【合成検証】制作ログA'),
    record('synthetic-b', '【合成検証】制作ログB'),
  ],
  experiments: [],
  ideas: [],
};
await writeFile(path.join(fixtures, 'records.json'), JSON.stringify(maker));
await writeFile(
  path.join(fixtures, 'replacement.md'),
  '---\ntitle: "【合成検証】置き換え候補"\ndescription: "合成の取り込みテストです。"\ndate: "2026-10-04"\ntags: ["合成"]\ndraft: false\ncategory: "学び"\n---\n\n置き換え候補の合成本文。\n',
);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const fixtureHashes = Object.fromEntries(
  await Promise.all(
    ['records.json', 'replacement.md'].map(async (name) => [
      name,
      hash(await readFile(path.join(fixtures, name))),
    ]),
  ),
);
const report = {
  scope:
    'Synthetic-data integrated user journey; action verification, not owner preference or human comprehension research.',
  checks: [],
  requests: [],
  blockedRequests: [],
  pageErrors: [],
  consoleErrors: [],
  dialogs: [],
  storageWrites: [],
  screenshots: [],
  downloads: [],
  performance: {},
  failure: null,
};
const mark = (name, details = {}) => {
  report.checks.push({ name, ...details });
  console.log('PASS', name);
};
const browser = await chromium.launch({ headless: true });
report.browser = browser.version();
const decisions = new WeakMap();
const contexts = [];
async function context(options = {}, allowedOrigin = origin) {
  const ctx = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
    ...options,
  });
  contexts.push(ctx);
  await ctx.exposeBinding('__auditWrite', (_, value) =>
    report.storageWrites.push(value),
  );
  await ctx.addInitScript(() => {
    window.__unexpected = false;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      window.__auditWrite({
        key,
        value: String(value),
        storage: this === localStorage ? 'local' : 'session',
        pathname: location.pathname,
      });
      return original.call(this, key, value);
    };
  });
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    report.requests.push({
      url,
      method: req.method(),
      syntheticData: `${url}${req.postData() || ''}`.includes(marker),
    });
    if (new URL(url).origin === allowedOrigin) await route.continue();
    else {
      report.blockedRequests.push(url);
      await route.abort();
    }
  });
  ctx.on('page', (page) => {
    page.setDefaultTimeout(12000);
    page.on('pageerror', (error) =>
      report.pageErrors.push({
        pathname: new URL(page.url()).pathname,
        message: error.message,
      }),
    );
    page.on('console', (message) => {
      if (message.type() === 'error')
        report.consoleErrors.push({ url: page.url(), message: message.text() });
    });
    page.on('dialog', async (dialog) => {
      const action = decisions.get(page) || 'dismiss';
      report.dialogs.push({ url: page.url(), type: dialog.type(), action });
      if (action === 'accept') await dialog.accept();
      else await dialog.dismiss();
    });
  });
  return ctx;
}
async function goto(page, route) {
  const response = await page.goto(`${base}${route}`, {
    waitUntil: 'networkidle',
  });
  assert.equal(response.status(), 200);
}
async function shot(page, name, fullPage = false) {
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage });
  report.screenshots.push(`${name}.png`);
}
async function fits(page) {
  const size = await page.evaluate(() => ({
    viewport: innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(
    size.html <= size.viewport + 1 && size.body <= size.viewport + 1,
    `${page.url()} overflow ${JSON.stringify(size)}`,
  );
  return size;
}
async function details(page, selector, keyboard = false) {
  const el = page.locator(selector).first();
  if (!(await el.evaluate((x) => x.open))) {
    if (keyboard) {
      await el.locator('summary').focus();
      await page.keyboard.press('Enter');
    } else await el.locator('summary').click();
  }
  assert.equal(await el.evaluate((x) => x.open), true);
}
async function nativeExit(page, selector, action) {
  decisions.set(page, action);
  const dialog = page.waitForEvent('dialog', { timeout: 7000 });
  const clicked = page.locator(selector).click({ noWaitAfter: true });
  assert.equal((await dialog).type(), 'beforeunload');
  await clicked;
  decisions.delete(page);
}
async function writerState(page) {
  return page.evaluate(() =>
    Object.fromEntries(
      ['title', 'body', 'date', 'description', 'slug', 'category', 'kind'].map(
        (key) => [key, document.querySelector(`#write-${key}`).value],
      ),
    ),
  );
}
async function fillWriter(page) {
  await page.locator('#write-title').fill('【合成検証】未保存の記録');
  await page
    .locator('#write-body')
    .fill(`${marker}\nこれは横断利用の合成テストです。`);
  await details(page, '.writer-settings', true);
  await page
    .locator('#write-description')
    .fill('本人の記事を含まない合成の説明文です。');
  await page.locator('#write-date').fill('2026-10-04');
  await page.locator('#write-slug').fill('synthetic-integrated-record');
  await page.locator('#write-category').selectOption('雑記');
}
async function download(page, selector, prefix) {
  const event = page.waitForEvent('download');
  await page.locator(selector).click();
  const result = await event;
  const destination = path.join(
    downloads,
    `${prefix}-${result.suggestedFilename()}`,
  );
  await result.saveAs(destination);
  const bytes = await readFile(destination);
  report.downloads.push({
    name: result.suggestedFilename(),
    bytes: bytes.length,
    sha256: hash(bytes),
    fixture: true,
  });
  return { destination, bytes };
}
async function measure(url) {
  const ctx = await context({}, new URL(url).origin);
  const page = await ctx.newPage();
  const responses = [];
  const pending = [];
  page.on('response', (response) =>
    pending.push(
      response
        .body()
        .then((bytes) =>
          responses.push({
            path: new URL(response.url()).pathname,
            type: response.request().resourceType(),
            bytes: bytes.length,
          }),
        )
        .catch(() => {}),
    ),
  );
  await page.goto(url, { waitUntil: 'networkidle' });
  await Promise.all(pending);
  const result = {
    url,
    htmlBytes: responses
      .filter((x) => x.type === 'document')
      .reduce((a, x) => a + x.bytes, 0),
    assetBytes: responses
      .filter((x) => x.type !== 'document')
      .reduce((a, x) => a + x.bytes, 0),
    responses,
    scripts: await page
      .locator('script[src]')
      .evaluateAll((nodes) => nodes.map((el) => el.getAttribute('src'))),
  };
  await ctx.close();
  return result;
}

try {
  const ctx = await context();
  const page = await ctx.newPage();
  await goto(page, '');
  assert.equal(
    await page
      .locator('[data-workroom-nav] .workroom-primary > li > a')
      .count(),
    3,
  );
  assert.equal(
    await page.locator('[data-workroom-tools]').evaluate((el) => el.open),
    false,
  );
  await fits(page);
  await shot(page, 'home-1280');
  await details(page, '[data-workroom-tools]', true);
  await page.keyboard.press('Escape');
  assert.equal(
    await page.locator('[data-workroom-tools]').evaluate((el) => el.open),
    false,
  );
  assert.equal(
    await page
      .locator('[data-workroom-tools] summary')
      .evaluate((el) => el === document.activeElement),
    true,
  );
  mark(
    'Compact three-link navigation; tools open by keyboard and Escape restores focus',
  );

  await details(page, '[data-focus-picker]', true);
  const choice = page.locator('[data-focus-picker] [data-focus-choice]').nth(1);
  const selectedId = await choice.getAttribute('data-focus-choice');
  await choice.click();
  await page.waitForFunction(
    (id) => !document.querySelector(`[data-focus-panel="${id}"]`).hidden,
    selectedId,
  );
  const selectedHash = new URL(page.url()).hash;
  await page.locator('.workroom-record h3 a').click();
  await page.waitForURL('**/room/notes/legacy-cyberpunk2077-1/');
  assert.match(
    await page.locator('.local-record-status').innerText(),
    /下書き・本人確認待ち/,
  );
  await fits(page);
  await shot(page, 'record-1280');
  await page.goBack({ waitUntil: 'networkidle' });
  assert.equal(new URL(page.url()).hash, selectedHash);
  assert.equal(
    await page.locator(`[data-focus-panel="${selectedId}"]`).isVisible(),
    true,
  );
  mark(
    'Choose a work, read the preserved local record, browser Back restores chosen work',
  );

  await page.locator('[data-workroom-nav] a[href$="/write/"]').click();
  await fillWriter(page);
  const originalWriter = await writerState(page);
  await page.locator('[data-reader-button]').click();
  assert.match(
    await page.locator('[data-reader-panel]').innerText(),
    /合成テスト/,
  );
  await page.locator('[data-edit-button]').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'writer-1280');
  const popup = ctx.waitForEvent('page');
  await page.locator('[data-maker-writer-entry]').click();
  const makerPage = await popup;
  await makerPage.waitForLoadState('networkidle');
  assert.match(makerPage.url(), /\/write\/maker-field\/$/);
  assert.deepEqual(await writerState(page), originalWriter);
  mark(
    'Writing/read mode works; Maker opens a new tab with the unsaved writer preserved',
  );

  await makerPage
    .locator('#maker-file')
    .setInputFiles(path.join(fixtures, 'records.json'));
  await makerPage.waitForFunction(
    () => !document.querySelector('#maker-load').disabled,
  );
  assert.equal(await makerPage.locator('#maker-records').isVisible(), false);
  await makerPage.locator('#maker-load').click();
  await makerPage.locator('#maker-choice').selectOption('0');
  assert.match(
    await makerPage.locator('#maker-meta').innerText(),
    /架空のサンプル/,
  );
  await makerPage
    .locator('#maker-description')
    .fill('【合成検証】受け渡しの確認です。');
  await makerPage.locator('#maker-category').selectOption('学び');
  await makerPage.locator('#maker-slug').fill('synthetic-integrated-maker');
  await makerPage.locator('#maker-prepare').click();
  await makerPage.waitForFunction(
    () => !document.querySelector('#maker-download').disabled,
  );
  assert.match(
    await makerPage.locator('#maker-output-preview').textContent(),
    /\ndraft: true\n/,
  );
  await makerPage.locator('#maker-prepare').scrollIntoViewIfNeeded();
  await shot(makerPage, 'maker-1280');
  const makerOutput = await download(makerPage, '#maker-download', 'maker');
  assert.match(makerOutput.bytes.toString('utf8'), /\ndraft: true\n/);
  assert.match(makerOutput.bytes.toString('utf8'), new RegExp(marker));
  mark(
    'Maker file choice needs confirmation; one sample record produces an actual draft:true download',
    report.downloads.at(-1),
  );

  const importedPopup = ctx.waitForEvent('page');
  await makerPage.locator('#maker-next').click();
  const importedPage = await importedPopup;
  await importedPage.waitForLoadState('networkidle');
  assert.equal(await importedPage.locator('#write-body').inputValue(), '');
  await details(importedPage, '.writer-import', true);
  await importedPage
    .locator('#write-import')
    .setInputFiles(makerOutput.destination);
  await importedPage.waitForFunction(
    () =>
      document.querySelector('#write-title').value === '【合成検証】制作ログA',
  );
  assert.match(
    await importedPage.locator('#write-body').inputValue(),
    new RegExp(marker),
  );
  const writerOutput = await download(
    importedPage,
    '[data-download-button]',
    'roundtrip',
  );
  assert.deepEqual(writerOutput.bytes, makerOutput.bytes);
  assert.deepEqual(await writerState(page), originalWriter);
  mark(
    'Maker download explicitly imports in a new writer; byte-exact re-download and original writer retained',
  );

  await importedPage
    .locator('#write-title')
    .fill('【合成検証】取り込み後に編集');
  const edited = await writerState(importedPage);
  await importedPage
    .locator('#write-import')
    .setInputFiles(path.join(fixtures, 'replacement.md'));
  await importedPage
    .locator('[data-import-confirm]')
    .waitFor({ state: 'visible' });
  assert.deepEqual(await writerState(importedPage), edited);
  await importedPage.locator('[data-import-cancel]').click();
  assert.deepEqual(await writerState(importedPage), edited);
  await nativeExit(
    importedPage,
    '[data-workroom-nav] a[href$="/room/notes/"]',
    'dismiss',
  );
  assert.match(importedPage.url(), /\/write\//);
  assert.deepEqual(await writerState(importedPage), edited);
  await nativeExit(
    importedPage,
    '[data-workroom-nav] a[href$="/room/notes/"]',
    'accept',
  );
  await importedPage.waitForURL('**/room/notes/');
  mark(
    'Import cancel retains every field; actual native unsaved-exit cancel stays, accept leaves',
  );

  await importedPage.locator('#note-search').fill('Cyberpunk');
  await importedPage.locator('[data-filter="雑記"]').click();
  assert.equal(await importedPage.locator('[data-entry]:visible').count(), 1);
  const query = new URL(importedPage.url()).search;
  await shot(importedPage, 'search-1280');
  await importedPage.locator('[data-entry]:visible a').click();
  await importedPage.waitForLoadState('networkidle');
  assert.equal(new URL(importedPage.url()).search, query);
  assert.equal(
    await importedPage
      .locator('[data-note-back]')
      .first()
      .evaluate((el) => el.href),
    `${origin}/hamaya-site-draft/room/notes/${query}`,
  );
  await importedPage.locator('[data-note-back]').first().click();
  await importedPage.waitForURL('**/room/notes/?*');
  assert.equal(
    await importedPage.locator('#note-search').inputValue(),
    'Cyberpunk',
  );
  assert.equal(
    await importedPage
      .locator('[data-filter="雑記"]')
      .getAttribute('aria-pressed'),
    'true',
  );
  await importedPage.locator('#note-search').fill('SYNTHETIC_NO_MATCH');
  assert.equal(
    await importedPage.locator('[data-no-results]').isVisible(),
    true,
  );
  await importedPage.locator('[data-no-results] [data-reset]').click();
  assert.equal(await importedPage.locator('#note-search').inputValue(), '');
  assert.equal(new URL(importedPage.url()).search, '');
  assert.equal(await importedPage.locator('[data-entry]:visible').count(), 1);
  assert.equal(
    await importedPage
      .locator('#note-search')
      .evaluate((el) => el === document.activeElement),
    true,
  );
  mark(
    'Search/category propagate into reading and Back; no results reset restores list and search focus',
  );

  await goto(
    importedPage,
    'room/notes/legacy-cyberpunk2077-1/?q=Cyberpunk&category=雑記&return=https://example.invalid/',
  );
  const backHref = await importedPage
    .locator('[data-note-back]')
    .first()
    .evaluate((el) => el.href);
  assert.ok(backHref.startsWith(`${base}room/notes/?`));
  assert.ok(
    !backHref.includes('return') && !backHref.includes('example.invalid'),
  );
  mark(
    'Article Back sanitizes query and always returns to the local record list',
  );

  await details(importedPage, '[data-workroom-tools]', true);
  await importedPage
    .locator('[data-workroom-menu-option="experiments"] a')
    .click();
  await importedPage.waitForURL('**/compare/experiments/');
  assert.equal(await importedPage.locator('iframe').count(), 0);
  assert.match(await importedPage.locator('main').innerText(), /シド/);
  const card = importedPage.locator('[data-experiment="motion"]');
  await card.locator('[data-open]').click();
  await card.locator('iframe').waitFor();
  const frame = await (
    await card.locator('iframe').elementHandle()
  ).contentFrame();
  await frame.waitForSelector('#replay');
  await frame.locator('#replay').scrollIntoViewIfNeeded();
  assert.equal(
    await frame.locator('body').getAttribute('data-running'),
    'false',
  );
  await frame.locator('#replay').click();
  await frame.waitForFunction(() => document.body.dataset.running === 'true');
  await card.locator('[data-pause]').click();
  await frame.waitForFunction(() => document.body.dataset.running === 'false');
  const stopped = await frame.locator('body').getAttribute('data-frame-count');
  await importedPage.waitForTimeout(150);
  assert.equal(
    await frame.locator('body').getAttribute('data-frame-count'),
    stopped,
  );
  await frame.locator('#pause').click();
  await frame.waitForFunction(() => document.body.dataset.running === 'true');
  await frame.locator('#pause').click();
  await frame.waitForFunction(() => document.body.dataset.running === 'false');
  await card.locator('.experiment-copy').scrollIntoViewIfNeeded();
  await shot(importedPage, 'experiment-1280');
  await card.screenshot({ path: path.join(out, 'experiment-open-1280.png') });
  report.screenshots.push('experiment-open-1280.png');
  await frame.locator('#pause').click();
  await frame.waitForFunction(() => document.body.dataset.running === 'true');
  await importedPage
    .locator('[data-workroom-nav] a[href$="/room/notes/"]')
    .click();
  await importedPage.waitForURL('**/room/notes/');
  await importedPage.goBack({ waitUntil: 'networkidle' });
  const returnedFrames = importedPage.locator('iframe');
  if (await returnedFrames.count()) {
    const returned = await (
      await returnedFrames.first().elementHandle()
    ).contentFrame();
    assert.equal(
      await returned.locator('body').getAttribute('data-running'),
      'false',
    );
  }
  mark(
    'Experiment starts stopped, replay/stop/continue respond; page navigation never auto-resumes',
  );

  // Settings, comparison, responsive and loading checks run after the continuous journey.
  await goto(importedPage, 'room/settings/');
  await shot(importedPage, 'settings-1280');
  report.settingsControls = await importedPage
    .locator('main input')
    .evaluateAll((nodes) =>
      nodes.map((x) => ({
        id: x.id,
        type: x.type,
        name: x.name,
        data: { ...x.dataset },
      })),
    );

  await importedPage.locator('[data-display-option="timeline"]').uncheck();
  await importedPage.locator('[data-display-option="experiments"]').uncheck();
  for (const key of ['timeline', 'experiments'])
    assert.equal(
      await importedPage
        .locator(`[data-workroom-menu-option="${key}"]`)
        .evaluate((el) => el.hidden),
      true,
    );
  await importedPage.reload({ waitUntil: 'networkidle' });
  for (const key of ['timeline', 'experiments'])
    assert.equal(
      await importedPage.locator(`[data-display-option="${key}"]`).isChecked(),
      false,
    );
  await importedPage
    .locator('[data-workroom-nav] a[href$="/room/notes/"]')
    .click();
  for (const key of ['timeline', 'experiments'])
    assert.equal(
      await importedPage
        .locator(`[data-workroom-menu-option="${key}"]`)
        .evaluate((el) => el.hidden),
      true,
    );
  await goto(importedPage, 'room/settings/');
  await details(importedPage, '.settings-details', true);
  const directToolLinks = await importedPage
    .locator('.settings-details a')
    .evaluateAll((nodes) => nodes.map((a) => a.href));
  for (const url of directToolLinks)
    assert.equal((await ctx.request.get(url)).status(), 200);
  await importedPage.locator('[data-display-option="timeline"]').check();
  await importedPage.locator('[data-display-option="experiments"]').check();
  assert.match(
    await importedPage.locator('[data-settings-status]').innerText(),
    /下書きは保存しません/,
  );
  assert.match(
    await importedPage.locator('main').innerText(),
    /採用は決まりません/,
  );
  mark(
    'Tool menu toggles persist across pages/reload; hidden tools remain explicitly reachable without adopting or publishing',
  );

  const motionCtx = await context({ reducedMotion: 'no-preference' });
  const homeMotion = await motionCtx.newPage();
  const settingsMotion = await motionCtx.newPage();
  await goto(homeMotion, '');
  await goto(settingsMotion, 'room/settings/');
  await settingsMotion.locator('[data-motion-setting]').check();
  await homeMotion.waitForFunction(
    () =>
      document.documentElement.dataset.motion === 'off' &&
      document
        .querySelector('[data-focus-motion]')
        .getAttribute('aria-pressed') === 'true',
  );
  await homeMotion.locator('[data-focus-motion]').click();
  await settingsMotion.waitForFunction(
    () => !document.querySelector('[data-motion-setting]').checked,
  );
  assert.equal(
    await homeMotion.locator('html').getAttribute('data-motion'),
    'on',
  );
  await settingsMotion.locator('[data-motion-setting]').check();
  await homeMotion.reload({ waitUntil: 'networkidle' });
  assert.equal(
    await homeMotion
      .locator('[data-focus-motion]')
      .getAttribute('aria-pressed'),
    'true',
  );
  await homeMotion.emulateMedia({ reducedMotion: 'reduce' });
  await homeMotion.locator('[data-focus-motion]').waitFor({ state: 'hidden' });
  assert.equal(
    await homeMotion.locator('html').getAttribute('data-motion'),
    'off',
  );
  assert.equal(
    await homeMotion.locator('[data-focus-motion]').isVisible(),
    false,
  );
  mark(
    'Settings and Focus synchronize motion across tabs and reload; reduced motion overrides visual animation',
  );

  await goto(importedPage, 'room/compare/');
  const comparisonLinks = await importedPage
    .locator('main a')
    .evaluateAll((nodes) => [...new Set(nodes.map((a) => a.href))]);
  report.comparisonLinks = [];
  for (const url of comparisonLinks) {
    assert.equal(new URL(url).origin, origin);
    assert.ok(new URL(url).pathname.startsWith('/hamaya-site-draft/'));
    const response = await ctx.request.get(url);
    assert.equal(response.status(), 200, url);
    report.comparisonLinks.push({ url, status: response.status() });
  }
  assert.ok(comparisonLinks.some((url) => url.endsWith('/compare/focus/')));
  assert.ok(
    comparisonLinks.some((url) => url.endsWith('/compare/collection/')),
  );
  assert.ok(comparisonLinks.some((url) => url.endsWith('/room/archive/')));
  assert.ok(comparisonLinks.some((url) => url.endsWith('/directions/')));
  await goto(importedPage, 'directions/');
  const appearanceLinks = await importedPage
    .locator('main a')
    .evaluateAll((nodes) => [...new Set(nodes.map((a) => a.href))]);
  for (const url of appearanceLinks.filter(
    (url) => new URL(url).origin === origin,
  ))
    assert.equal((await ctx.request.get(url)).status(), 200, url);
  mark(
    'Comparison hub retains focus/collection/archive and all visual alternatives; every internal target returns 200',
  );

  const responsive = await context();
  const responsivePage = await responsive.newPage();
  const surfaces = [
    ['', 'home'],
    ['room/notes/legacy-cyberpunk2077-1/', 'record'],
    ['room/notes/?q=Cyberpunk', 'search'],
    ['room/settings/', 'settings'],
    ['write/', 'writer'],
    ['write/maker-field/', 'maker'],
    ['compare/experiments/', 'experiment'],
    ['compare/timeline/', 'timeline'],
    ['room/compare/', 'comparison'],
  ];
  for (const width of [375, 320]) {
    await responsivePage.setViewportSize({
      width,
      height: width === 375 ? 812 : 640,
    });
    for (const [route, name] of surfaces) {
      await goto(responsivePage, route);
      await fits(responsivePage);
      if (width === 375) await shot(responsivePage, `${name}-${width}`);
      await details(responsivePage, '[data-workroom-tools]', true);
      await fits(responsivePage);
      const menu = await responsivePage
        .locator('.workroom-tool-list')
        .boundingBox();
      assert.ok(menu.x >= 0 && menu.x + menu.width <= width + 1);
      await responsivePage.keyboard.press('Escape');
    }
    mark(
      `Nine integrated surfaces and open tools fit ${width}px without horizontal scrolling`,
    );
  }
  await goto(responsivePage, '');
  await responsivePage.keyboard.press('Tab');
  const focused = await responsivePage.evaluate(() => {
    const el = document.activeElement;
    const css = getComputedStyle(el);
    return {
      text: el.textContent.trim(),
      outlineStyle: css.outlineStyle,
      outlineWidth: css.outlineWidth,
      outlineColor: css.outlineColor,
    };
  });
  assert.notEqual(focused.outlineStyle, 'none');
  assert.notEqual(focused.outlineWidth, '0px');
  await responsivePage.keyboard.press('Enter');
  assert.equal(new URL(responsivePage.url()).hash, '#main-content');
  mark(
    'Keyboard first Tab shows a visible focus ring and skip link reaches main content',
    focused,
  );

  const nojs = await context({
    javaScriptEnabled: false,
    viewport: { width: 375, height: 812 },
  });
  const nojsPage = await nojs.newPage();
  await goto(nojsPage, '');
  assert.ok(
    (await nojsPage.locator('[data-focus-panel]:visible').count()) >= 6,
  );
  await fits(nojsPage);
  await details(nojsPage, '[data-workroom-tools]', true);
  assert.equal(
    await nojsPage
      .locator('[data-workroom-menu-option="timeline"] a')
      .isVisible(),
    true,
  );
  await goto(nojsPage, 'room/notes/');
  assert.equal(await nojsPage.locator('[data-entry]:visible').count(), 1);
  assert.equal(await nojsPage.locator('[data-note-tools]').isVisible(), false);
  await nojsPage.locator('[data-entry] a').click();
  assert.equal(await nojsPage.locator('.prose').isVisible(), true);
  await goto(nojsPage, 'room/settings/');
  assert.equal(
    await nojsPage.locator('[data-workroom-settings]').isVisible(),
    false,
  );
  assert.match(await nojsPage.locator('noscript').innerText(), /JavaScript/);
  await goto(nojsPage, 'write/');
  assert.equal(
    await nojsPage.locator('[data-download-button]').isDisabled(),
    true,
  );
  assert.match(await nojsPage.locator('noscript').innerText(), /JavaScript/);
  await goto(nojsPage, 'compare/experiments/');
  assert.equal(await nojsPage.locator('iframe').count(), 0);
  assert.equal(
    await nojsPage.locator('[data-open]').first().isDisabled(),
    true,
  );
  mark(
    'Without JavaScript, work choices and original record remain readable; unavailable tools explain their state',
  );

  report.performance.integrated = await measure(base);
  report.performance.focusBaseline = await measure(
    'http://127.0.0.1:4358/hamaya-site-draft/compare/focus/',
  );
  const homeResponses = report.performance.integrated.responses;
  assert.ok(
    !homeResponses.some((x) =>
      /maker|adapter|draft-import|Experiment|experiment|candidate-selection|WorkCandidates/i.test(
        x.path,
      ),
    ),
  );
  mark(
    'Initial home loads no Maker/import parser or experiment runtime; actual response byte counts recorded',
    {
      integrated: {
        htmlBytes: report.performance.integrated.htmlBytes,
        assetBytes: report.performance.integrated.assetBytes,
      },
      baseline: {
        htmlBytes: report.performance.focusBaseline.htmlBytes,
        assetBytes: report.performance.focusBaseline.assetBytes,
      },
    },
  );

  assert.equal(report.requests.filter((req) => req.method !== 'GET').length, 0);
  assert.equal(report.requests.filter((req) => req.syntheticData).length, 0);
  assert.deepEqual(report.blockedRequests, []);
  for (const write of report.storageWrites) {
    assert.equal(write.storage, 'local');
    if (write.key === 'archive-motion')
      assert.ok(['off', 'on'].includes(write.value));
    else {
      assert.equal(write.key, 'hamaya-workroom-display-v1');
      const value = JSON.parse(write.value);
      assert.deepEqual(Object.keys(value).sort(), [
        'experiments',
        'timeline',
        'version',
      ]);
      assert.equal(value.version, 1);
      assert.equal(typeof value.timeline, 'boolean');
      assert.equal(typeof value.experiments, 'boolean');
    }
  }
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.consoleErrors, []);
  mark(
    'No external requests/POST/content persistence; storage writes limited to boolean display/motion preferences',
  );
  for (const [name, expected] of Object.entries(fixtureHashes))
    assert.equal(hash(await readFile(path.join(fixtures, name))), expected);
  assert.equal(await page.evaluate(() => window.__unexpected), false);
  assert.equal(await importedPage.evaluate(() => window.__unexpected), false);
  mark(
    'Synthetic input files remain byte-identical and script-like source text stays inert',
  );
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  for (const ctx of contexts) await ctx.close().catch(() => {});
  await browser.close();
  await writeFile(
    path.join(out, 'browser-evidence.json'),
    JSON.stringify(report, null, 2),
  );
}
