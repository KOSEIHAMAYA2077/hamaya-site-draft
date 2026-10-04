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
const marker = 'SYNTHETIC_UI_COPY_QA_20261004';
const record = (id, title) => ({
  id,
  title,
  date: '2026-10-04',
  body: `${marker}\n合成データです。本人の制作内容や実績ではありません。\n<script>window.__unexpected=true</script>`,
  sample: true,
});
const maker = {
  version: 1,
  logs: [
    record('synthetic-a', '【合成検証】記録A'),
    record('synthetic-b', '【合成検証】記録B'),
  ],
  experiments: [],
  ideas: [],
};
const replacement = {
  version: 1,
  logs: [record('synthetic-c', '【合成検証】記録C')],
  experiments: [],
  ideas: [],
};
for (const [name, content] of Object.entries({
  'records.json': JSON.stringify(maker),
  'replacement.json': JSON.stringify(replacement),
  'empty.json': JSON.stringify({
    version: 1,
    logs: [],
    experiments: [],
    ideas: [],
  }),
  'bad.json': '{"version":1,',
}))
  await writeFile(path.join(fixtures, name), content);
const importedMd =
  '---\ntitle: "【合成検証】取り込み後の題"\ndescription: "QA用の合成文です。"\ndate: "2026-10-04"\ntags: ["合成"]\ndraft: false\ncategory: "学び"\n---\n\n取り込み後の本文。本人の記録ではありません。\n';
await writeFile(path.join(fixtures, 'replacement.md'), importedMd);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hashesBefore = Object.fromEntries(
  await Promise.all(
    ['records.json', 'replacement.json', 'replacement.md'].map(async (name) => [
      name,
      hash(await readFile(path.join(fixtures, name))),
    ]),
  ),
);
const report = {
  scope:
    'UI-label/action correspondence with synthetic data only; not a human comprehension study.',
  checks: [],
  screenshots: [],
  labels: {},
  pageErrors: [],
  consoleErrors: [],
  blockedRequests: [],
  requests: [],
  downloads: [],
  storageWrites: [],
  dialogs: [],
  failure: null,
};
const mark = (name, details = {}) => {
  report.checks.push({ name, ...details });
  console.log('PASS', name);
};
const browser = await chromium.launch({ headless: true });
report.browser = browser.version();
let activeContext;
async function context(port, options = {}) {
  const origin = `http://127.0.0.1:${port}`;
  const ctx = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
    ...options,
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await ctx.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    report.requests.push({
      url,
      method: request.method(),
      hasSyntheticData: `${url}${request.postData() || ''}`.includes(marker),
    });
    if (new URL(url).origin === origin) await route.continue();
    else {
      report.blockedRequests.push(url);
      await route.abort();
    }
  });
  await ctx.addInitScript(() => {
    window.__storageWrites = [];
    window.__unexpected = false;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      window.__storageWrites.push({ key, length: String(value).length });
      return original.call(this, key, value);
    };
  });
  ctx.on('page', (page) => {
    page.setDefaultTimeout(12000);
    page.on('pageerror', (error) =>
      report.pageErrors.push({ url: page.url(), message: error.message }),
    );
    page.on('console', (message) => {
      if (message.type() === 'error')
        report.consoleErrors.push({ url: page.url(), message: message.text() });
    });
    page.on('dialog', async (dialog) => {
      report.dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    page.on('download', (download) =>
      report.downloads.push({
        url: page.url(),
        name: download.suggestedFilename(),
      }),
    );
  });
  ctx.base = `${origin}/hamaya-site-draft/`;
  return ctx;
}
async function close(ctx) {
  for (const page of ctx.pages()) {
    const state = await page
      .evaluate(() => ({
        writes: window.__storageWrites || [],
        unexpected: window.__unexpected,
      }))
      .catch(() => ({ writes: [] }));
    report.storageWrites.push(...state.writes);
    assert.ok(!state.unexpected, 'synthetic script stays literal text');
  }
  await ctx.close();
}
async function goto(ctx, page, route) {
  const response = await page.goto(`${ctx.base}${route}`, {
    waitUntil: 'networkidle',
  });
  assert.equal(response.status(), 200);
}
async function screenshot(page, name, fullPage = false) {
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage });
  report.screenshots.push(`${name}.png`);
}
async function assertFits(page) {
  const widths = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(
    widths.document <= widths.viewport + 1 &&
      widths.body <= widths.viewport + 1,
    `horizontal overflow ${page.url()} ${JSON.stringify(widths)}`,
  );
  return widths;
}
async function openDetails(page, selector, keyboard = false) {
  const details = page.locator(selector).first();
  if (!(await details.evaluate((el) => el.open))) {
    if (keyboard) {
      await details.locator('summary').focus();
      await page.keyboard.press('Enter');
    } else await details.locator('summary').click();
  }
  assert.equal(await details.evaluate((el) => el.open), true);
}
async function loadMaker(page, filename = 'records.json') {
  await page
    .locator('#maker-file')
    .setInputFiles(path.join(fixtures, filename));
  await page.waitForFunction(
    () => !document.querySelector('#maker-load').disabled,
  );
  await page.locator('#maker-load').click();
  await page.locator('#maker-pending').waitFor({ state: 'hidden' });
}
async function makerFields(page) {
  return page.evaluate(() =>
    Object.fromEntries(
      ['description', 'category', 'slug'].map((id) => [
        id,
        document.querySelector(`#maker-${id}`).value,
      ]),
    ),
  );
}
const aInputs = {
  description: '【合成検証】Aの要約です。',
  category: '雑記',
  slug: 'synthetic-ui-copy-a',
};
const bInputs = {
  description: '【合成検証】Bの要約です。',
  category: '学び',
  slug: 'synthetic-ui-copy-b',
};
const emptyInputs = { description: '', category: '', slug: '' };
async function fillMaker(page, values = aInputs) {
  await page.locator('#maker-description').fill(values.description);
  await page.locator('#maker-category').selectOption(values.category);
  await page.locator('#maker-slug').fill(values.slug);
}
async function fillWriter(page) {
  await page.locator('#write-title').fill('【合成検証】保存前の題');
  await page
    .locator('#write-body')
    .fill(`${marker}\n合成の本文です。本人の記事ではありません。`);
  await openDetails(page, 'details.writer-settings', true);
  await page
    .locator('#write-description')
    .fill('合成データで下書きの操作を確かめます。');
  await page.locator('#write-date').fill('2026-10-04');
  await page.locator('#write-slug').fill('synthetic-ui-copy-writer');
  await page.locator('#write-category').selectOption('雑記');
}
async function writerState(page) {
  return page.evaluate(() =>
    Object.fromEntries(
      ['title', 'body', 'description', 'date', 'slug', 'category', 'kind'].map(
        (id) => [id, document.querySelector(`#write-${id}`).value],
      ),
    ),
  );
}
async function importWriter(page, filepath) {
  await openDetails(page, 'details.writer-import', true);
  await page.locator('#write-import').setInputFiles(filepath);
}

try {
  // The two snapshots use the same viewport, synthetic input and UI state.
  for (const [version, port] of [
    ['before', 4357],
    ['after', 4358],
  ]) {
    const ctx = (activeContext = await context(port));
    const page = await ctx.newPage();
    report.labels[version] = {};
    for (const [route, name] of [
      ['compare/candidates/', 'candidates'],
      ['write/', 'writer'],
      ['write/maker-field/', 'maker'],
    ]) {
      await goto(ctx, page, route);
      await assertFits(page);
      await screenshot(page, `${version}-${name}-1280`);
      report.labels[version][name] = await page.locator('main').innerText();
    }
    await goto(ctx, page, 'write/');
    await fillWriter(page);
    const count = report.downloads.length;
    await page.locator('[data-preview-button]').click();
    assert.equal(report.downloads.length, count);
    assert.equal(await page.locator('[data-preview-panel]').isVisible(), true);
    await page.locator('[data-preview-button]').scrollIntoViewIfNeeded();
    await screenshot(page, `${version}-writer-confirm-1280`);
    mark(`${version}: writer confirmation shows preview without download`);
    await goto(ctx, page, 'write/maker-field/');
    await loadMaker(page);
    await page.locator('#maker-choice').selectOption('0');
    await fillMaker(page);
    await page.locator('#maker-records').scrollIntoViewIfNeeded();
    await screenshot(page, `${version}-maker-record-1280`);
    await page.locator('#maker-prepare').click();
    await page.waitForFunction(
      () => !document.querySelector('#maker-download').disabled,
    );
    await page.locator('#maker-prepare').scrollIntoViewIfNeeded();
    await screenshot(page, `${version}-maker-confirm-1280`);
    mark(`${version}: maker confirmation has separate download action`);
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 640 });
      for (const [route, name] of [
        ['compare/candidates/', 'candidates'],
        ['write/', 'writer'],
        ['write/maker-field/', 'maker'],
      ]) {
        await goto(ctx, page, route);
        await assertFits(page);
        await screenshot(page, `${version}-${name}-${width}`);
      }
      mark(`${version}: initial candidate/writer/maker views fit ${width}px`);
    }
    await close(ctx);
    activeContext = null;
  }

  const ctx = (activeContext = await context(4358));
  const page = await ctx.newPage();
  await goto(ctx, page, 'compare/candidates/');
  const checks = page.locator('[data-select]');
  assert.equal(await checks.count(), 9);
  assert.equal(await page.locator('[data-copy]').isDisabled(), true);
  assert.match(await page.locator('.selection-hint').innerText(), /保存/);
  assert.match(await page.locator('.selection-hint').innerText(), /再読み込み/);
  assert.match(
    await page.locator('.reading-boundary').innerText(),
    /実行していません/,
  );
  await checks.nth(0).check();
  await checks.nth(2).check();
  const expectedCopy = await page
    .locator('[data-candidate]')
    .evaluateAll((cards) =>
      cards
        .filter((card) => card.querySelector('[data-select]').checked)
        .map(
          (card) =>
            `${card.dataset.repository}\n${card.dataset.title}\n${card.dataset.url}`,
        )
        .join('\n\n'),
    );
  await page.locator('[data-copy]').click();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    expectedCopy,
  );
  assert.equal(await page.locator('[data-select]:checked').count(), 2);
  assert.ok(!expectedCopy.includes('コードは実行'));
  mark(
    'candidate copy contains exactly repository, title and URL; selection remains temporary',
  );
  await page.locator('[data-clear]').click();
  assert.equal(await page.locator('[data-select]:checked').count(), 0);
  assert.equal(await page.locator('[data-copy]').isDisabled(), true);
  await page.locator('input[name=scope][value=selected]').check();
  assert.equal(await page.locator('[data-empty]').isVisible(), true);
  await page.locator('input[name=scope][value=all]').check();
  await checks.nth(0).check();
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('[data-select]:checked').count(), 0);
  mark(
    'candidate deselect and reload clear checkboxes; empty chosen-filter is explained',
  );
  const detail = page.locator('.candidate-details').first();
  assert.equal(await detail.evaluate((el) => el.open), false);
  await openDetails(page, '.candidate-details', true);
  assert.equal(await detail.locator('.unknown-panel').isVisible(), true);
  await detail.locator('summary').focus();
  await page.keyboard.press('Space');
  assert.equal(await detail.evaluate((el) => el.open), false);
  mark(
    'candidate technical detail opens with Enter and closes with Space; pending scope remains outside',
  );

  await goto(ctx, page, 'write/');
  assert.match(
    await page.locator('.page-heading').innerText(),
    /自動保存されません/,
  );
  assert.match(
    await page.locator('[data-feedback]').innerText(),
    /draft:\s*true/,
  );
  assert.match(
    await page.locator('[data-feedback]').innerText(),
    /公開はしません/,
  );
  await fillWriter(page);
  const state = await writerState(page);
  const beforeConfirmDownloads = report.downloads.length;
  await page.locator('[data-preview-button]').click();
  assert.equal(report.downloads.length, beforeConfirmDownloads);
  assert.match(
    await page.locator('[data-feedback]').innerText(),
    /確認だけでは保存されません/,
  );
  const downloadEvent = page.waitForEvent('download');
  await page.locator('[data-download-button]').click();
  const writerDownload = await downloadEvent;
  const writerFile = path.join(downloads, writerDownload.suggestedFilename());
  await writerDownload.saveAs(writerFile);
  const writerMd = await readFile(writerFile, 'utf8');
  assert.match(writerMd, /\ndraft: true\n/);
  assert.match(writerMd, new RegExp(marker));
  assert.match(
    await page.locator('[data-feedback]').innerText(),
    /ダウンロードを開始/,
  );
  mark(
    'writer confirmation does not save; download yields draft:true with original input',
  );
  await importWriter(page, path.join(fixtures, 'replacement.md'));
  await page.locator('[data-import-confirm]').waitFor({ state: 'visible' });
  assert.deepEqual(await writerState(page), state);
  assert.match(
    await page.locator('[data-import-confirm-message]').innerText(),
    /失われます/,
  );
  await page.locator('[data-import-cancel]').click();
  assert.deepEqual(await writerState(page), state);
  mark(
    'writer import awaits replace decision; cancel preserves all edited fields',
  );
  await importWriter(page, path.join(fixtures, 'replacement.md'));
  await page.locator('[data-import-confirm]').waitFor({ state: 'visible' });
  await page.locator('[data-import-replace]').click();
  assert.equal(
    await page.locator('#write-title').inputValue(),
    '【合成検証】取り込み後の題',
  );
  assert.match(
    await page.locator('[data-import-status]').innerText(),
    /draft: false/,
  );
  assert.match(
    await page.locator('[data-import-status]').innerText(),
    /draft: true/,
  );
  const replacedDownload = page.waitForEvent('download');
  await page.locator('[data-download-button]').click();
  const replacementDownload = await replacedDownload;
  const replacedFile = path.join(
    downloads,
    `writer-${replacementDownload.suggestedFilename()}`,
  );
  await replacementDownload.saveAs(replacedFile);
  assert.match(await readFile(replacedFile, 'utf8'), /\ndraft: true\n/);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('#write-title').inputValue(), '');
  assert.equal(await page.locator('#write-body').inputValue(), '');
  mark(
    'writer explicit replace imports source; draft:false is converted to true and reload clears unsaved form',
  );

  await goto(ctx, page, 'write/maker-field/');
  assert.match(
    await page.locator('.maker-heading').innerText(),
    /元のJSONは変更せず/,
  );
  assert.match(
    await page.locator('.maker-heading').innerText(),
    /自動保存されず/,
  );
  await page
    .locator('#maker-file')
    .setInputFiles(path.join(fixtures, 'records.json'));
  await page.waitForFunction(
    () => !document.querySelector('#maker-load').disabled,
  );
  assert.equal(await page.locator('#maker-records').isHidden(), true);
  assert.match(await page.locator('#maker-pending-info').innerText(), /2件/);
  await page.locator('#maker-load').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#maker-output-fields').isHidden(), true);
  await page.locator('#maker-choice').selectOption('0');
  assert.match(await page.locator('#maker-meta').innerText(), /サンプル/);
  await fillMaker(page);
  await page.locator('#maker-choice').selectOption('1');
  assert.deepEqual(await makerFields(page), emptyInputs);
  await fillMaker(page, bInputs);
  await page.locator('#maker-choice').selectOption('0');
  assert.deepEqual(await makerFields(page), aInputs);
  mark(
    'Maker choose JSON shows counts before opening; choose one record restores only its own edits and sample notice',
  );
  await page
    .locator('#maker-file')
    .setInputFiles(path.join(fixtures, 'replacement.json'));
  await page.waitForFunction(
    () => !document.querySelector('#maker-load').disabled,
  );
  assert.match(await page.locator('#maker-pending-info').innerText(), /消去/);
  await page.locator('#maker-cancel').click();
  assert.deepEqual(await makerFields(page), aInputs);
  await page
    .locator('#maker-file')
    .setInputFiles(path.join(fixtures, 'bad.json'));
  await page.waitForFunction(
    () => document.querySelector('#maker-pending').hidden,
  );
  assert.deepEqual(await makerFields(page), aInputs);
  await page.locator('#maker-choice').selectOption('1');
  assert.deepEqual(await makerFields(page), bInputs);
  await page.locator('#maker-choice').selectOption('0');
  mark(
    'Maker pending cancel and malformed JSON preserve current and other-record inputs',
  );
  assert.notEqual(
    (await page.locator('#maker-reset').innerText()).trim(),
    (await page.locator('#maker-cancel').innerText()).trim(),
  );
  const countBeforePrepare = report.downloads.length;
  await page.locator('#maker-prepare').click();
  await page.waitForFunction(
    () => !document.querySelector('#maker-download').disabled,
  );
  assert.equal(report.downloads.length, countBeforePrepare);
  assert.match(
    await page.locator('#maker-output-summary').innerText(),
    /draft: true/,
  );
  await openDetails(page, '.maker-output-details', true);
  assert.match(
    await page.locator('#maker-output-preview').innerText(),
    /SYNTHETIC_UI_COPY_QA/,
  );
  assert.equal(await page.locator('#maker-next').isHidden(), true);
  const makerDownloadEvent = page.waitForEvent('download');
  await page.locator('#maker-download').click();
  const makerDownload = await makerDownloadEvent;
  const makerFile = path.join(downloads, makerDownload.suggestedFilename());
  await makerDownload.saveAs(makerFile);
  const makerMd = await readFile(makerFile, 'utf8');
  assert.match(makerMd, /\ndraft: true\n/);
  assert.match(makerMd, /サンプルの指定/);
  assert.match(makerMd, /本人の制作実績ではありません/);
  assert.equal(await page.locator('#maker-next').isVisible(), true);
  assert.equal(await page.locator('#maker-download').isDisabled(), true);
  mark(
    'Maker preview performs no download; separate download yields one draft:true file and reveals next step',
  );
  const popupEvent = ctx.waitForEvent('page');
  await page.locator('#maker-next').click();
  const writerPopup = await popupEvent;
  await writerPopup.waitForLoadState('networkidle');
  assert.ok(writerPopup.url().endsWith('/write/#write-import'));
  assert.equal(await writerPopup.locator('#write-title').inputValue(), '');
  await importWriter(writerPopup, makerFile);
  await writerPopup.waitForFunction(
    () => document.querySelector('#write-title').value === '【合成検証】記録A',
  );
  const roundtripEvent = writerPopup.waitForEvent('download');
  await writerPopup.locator('[data-download-button]').click();
  const roundtripDownload = await roundtripEvent;
  const roundtripFile = path.join(
    downloads,
    `roundtrip-${roundtripDownload.suggestedFilename()}`,
  );
  await roundtripDownload.saveAs(roundtripFile);
  assert.equal(await readFile(roundtripFile, 'utf8'), makerMd);
  await writerPopup.close();
  mark(
    'Maker next opens a blank writer tab; explicit imported download round-trips byte-for-byte',
  );
  await loadMaker(page, 'replacement.json');
  await page.locator('#maker-choice').selectOption('0');
  assert.deepEqual(await makerFields(page), emptyInputs);
  await fillMaker(page, { ...aInputs, slug: 'synthetic-ui-copy-reset' });
  await page.locator('#maker-reset').click();
  assert.equal(await page.locator('#maker-records').isHidden(), true);
  assert.deepEqual(await makerFields(page), emptyInputs);
  assert.match(await page.locator('#maker-file-status').innerText(), /消去/);
  await loadMaker(page, 'records.json');
  await page.locator('#maker-choice').selectOption('0');
  assert.deepEqual(await makerFields(page), emptyInputs);
  mark(
    'Maker opening another JSON and explicit reset clear prior per-record input',
  );
  await loadMaker(page, 'empty.json');
  assert.equal(await page.locator('#maker-choice').isDisabled(), true);
  assert.match(
    await page.locator('#maker-selection-status').innerText(),
    /記録がありません/,
  );
  await screenshot(page, 'after-maker-empty-1280');
  mark(
    'Maker empty JSON has explicit empty state and no enabled record action',
  );

  await goto(ctx, page, 'compare/experiments/');
  assert.match(
    await page.locator('.experiment-provenance').innerText(),
    /シドの試作（AI）/,
  );
  assert.match(
    await page.locator('.experiment-provenance').innerText(),
    /未定|未確定/,
  );
  assert.equal(await page.locator('iframe').count(), 0);
  for (const id of ['motion', 'clock']) {
    const card = page.locator(`[data-experiment="${id}"]`);
    await card.locator('[data-open]').click();
    await page.waitForFunction(
      (id) =>
        document
          .querySelector(`[data-experiment="${id}"] [data-open]`)
          .textContent.includes('閉じる'),
      id,
    );
    const frameElement = card.locator('iframe');
    assert.equal(await frameElement.getAttribute('sandbox'), 'allow-scripts');
    const frame = await (await frameElement.elementHandle()).contentFrame();
    await frameElement.scrollIntoViewIfNeeded();
    assert.equal(
      await frame.locator('body').getAttribute('data-running'),
      'false',
    );
    assert.equal(
      await frame.locator('body').getAttribute('data-frame-count'),
      '0',
    );
    await frame.locator('#replay').click();
    await frame.waitForFunction(
      () =>
        document.body.dataset.running === 'true' &&
        Number(document.body.dataset.frameCount) > 0,
    );
    await card.locator('[data-pause]').click();
    await frame.waitForFunction(
      () => document.body.dataset.running === 'false',
    );
    assert.equal((await frame.locator('#pause').innerText()).trim(), '続ける');
    await frame.locator('#pause').click();
    await frame.waitForFunction(() => document.body.dataset.running === 'true');
    await frame.locator('#pause').click();
    await frame.waitForFunction(
      () => document.body.dataset.running === 'false',
    );
    await card.locator('[data-open]').click();
    assert.equal(await card.locator('iframe').count(), 0);
    assert.equal(await card.locator('[data-preview]').isVisible(), true);
    mark(
      `experiment ${id}: open starts stopped; replay starts, stop preserves, continue resumes, close removes frame`,
    );
  }

  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({
      width,
      height: width === 1280 ? 900 : width === 375 ? 812 : 640,
    });
    for (const route of [
      '',
      'works/',
      'notes/',
      'about/',
      'directions/',
      'directions/desk/',
      'compare/collection/',
      'compare/focus/',
      'compare/timeline/',
      'compare/experiments/',
    ]) {
      await goto(ctx, page, route);
      await assertFits(page);
      assert.equal(
        await page.evaluate(
          () => matchMedia('(prefers-reduced-motion: reduce)').matches,
        ),
        true,
      );
    }
    await goto(ctx, page, 'compare/candidates/');
    await openDetails(page, '.candidate-details', true);
    await assertFits(page);
    await goto(ctx, page, 'write/');
    await fillWriter(page);
    await page.locator('[data-preview-button]').click();
    await openDetails(page, '[data-preview-panel] details', true);
    await assertFits(page);
    await goto(ctx, page, 'write/maker-field/');
    await loadMaker(page);
    await page.locator('#maker-choice').selectOption('0');
    await fillMaker(page);
    await page.locator('#maker-prepare').click();
    await page.waitForFunction(
      () => !document.querySelector('#maker-download').disabled,
    );
    await openDetails(page, '.maker-output-details', true);
    await assertFits(page);
    mark(
      `after: ${width}px navigation, expanded details and populated preview fit viewport under reduced motion`,
    );
  }
  await close(ctx);
  activeContext = null;

  const noJs = (activeContext = await context(4358, {
    javaScriptEnabled: false,
  }));
  const staticPage = await noJs.newPage();
  await goto(noJs, staticPage, 'write/');
  assert.equal(
    await staticPage.locator('[data-preview-button]').isDisabled(),
    true,
  );
  assert.equal(await staticPage.locator('#write-import').isDisabled(), true);
  assert.match(await staticPage.locator('noscript').innerText(), /JavaScript/);
  await openDetails(staticPage, 'details.writer-settings', true);
  await goto(noJs, staticPage, 'write/maker-field/');
  assert.equal(await staticPage.locator('#maker-file').isDisabled(), true);
  assert.match(await staticPage.locator('noscript').innerText(), /JavaScript/);
  await goto(noJs, staticPage, 'compare/candidates/');
  assert.equal(await staticPage.locator('[data-candidate]').count(), 9);
  assert.equal(await staticPage.locator('[data-tools]').isHidden(), true);
  await openDetails(staticPage, '.candidate-details', true);
  mark(
    'without JavaScript: candidate source details stay readable; disabled writer/Maker controls explain requirement',
  );
  await close(noJs);
  activeContext = null;
  for (const [name, expectedHash] of Object.entries(hashesBefore))
    assert.equal(hash(await readFile(path.join(fixtures, name))), expectedHash);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.consoleErrors, []);
  assert.deepEqual(report.blockedRequests, []);
  assert.deepEqual(report.storageWrites, []);
  assert.deepEqual(report.dialogs, []);
  assert.ok(
    report.requests.every(
      (request) => request.method === 'GET' && !request.hasSyntheticData,
    ),
  );
  mark(
    'no JavaScript errors, remote requests, posts, storage writes or source fixture mutation',
  );
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  console.error(error.stack);
  if (activeContext)
    await Promise.all(
      activeContext
        .pages()
        .map((page, index) =>
          screenshot(page, `failure-${index}`, true).catch(() => {}),
        ),
    );
  process.exitCode = 1;
} finally {
  if (activeContext) await activeContext.close();
  await browser.close();
  await writeFile(
    path.join(out, 'browser-evidence.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(
    `${report.checks.length} groups; ${report.screenshots.length} screenshots; failure=${Boolean(report.failure)}`,
  );
}
