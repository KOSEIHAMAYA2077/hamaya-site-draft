import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/tmp/hamaya-browser-qa/node_modules/playwright/index.mjs';
const out = path.dirname(fileURLToPath(import.meta.url));
const base = 'http://127.0.0.1:4360/hamaya-site-draft/';
const report = {
  checks: [],
  errors: [],
  dialogs: [],
  screenshots: [],
  performance: {},
  failure: null,
};
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: 'no-preference',
  acceptDownloads: true,
});
const actions = new WeakMap();
ctx.on('page', (page) => {
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('dialog', async (dialog) => {
    const action = actions.get(page) || 'dismiss';
    report.dialogs.push({ type: dialog.type(), action });
    if (action === 'accept') await dialog.accept();
    else await dialog.dismiss();
  });
});
const page = await ctx.newPage();
const mark = (name) => {
  report.checks.push(name);
  console.log('PASS', name);
};
const goto = async (route) => {
  const response = await page.goto(`${base}${route}`, {
    waitUntil: 'networkidle',
  });
  assert.equal(response.status(), 200);
};
async function open(selector) {
  const el = page.locator(selector).first();
  if (!(await el.evaluate((x) => x.open))) await el.locator('summary').click();
}
async function fillWriter() {
  await page.locator('#write-title').fill('【合成検証】最終確認');
  await page.locator('#write-body').fill('本人の記事ではない合成テストです。');
  await open('.writer-settings');
  await page.locator('#write-description').fill('最終確認用の合成の説明です。');
  await page.locator('#write-slug').fill('synthetic-final-guard');
  await page.locator('#write-category').selectOption('雑記');
}
async function getDownload(selector) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  const result = await pending;
  const file = path.join(
    out,
    'downloads',
    `final-${result.suggestedFilename()}`,
  );
  await result.saveAs(file);
  assert.match(await readFile(file, 'utf8'), /\ndraft: true\n/);
}
async function leave(action, expectedDialog) {
  const count = report.dialogs.length;
  actions.set(page, action);
  const dialogue = expectedDialog ? page.waitForEvent('dialog') : undefined;
  await page
    .locator('[data-workroom-nav] a[href$="/room/notes/"]')
    .click({ noWaitAfter: true });
  if (dialogue) assert.equal((await dialogue).type(), 'beforeunload');
  if (!expectedDialog || action === 'accept')
    await page.waitForURL('**/room/notes/');
  assert.equal(report.dialogs.length - count, expectedDialog ? 1 : 0);
  actions.delete(page);
}
try {
  await goto('');
  const second = await page
    .locator('[data-focus-picker] [data-focus-choice]')
    .nth(1)
    .getAttribute('href');
  await goto('room/settings/');
  await goto(second);
  assert.equal(
    await page.locator('[data-focus-panel]:visible').getAttribute('id'),
    second.slice(1),
  );
  const settings = await ctx.newPage();
  await settings.goto(`${base}room/settings/`, { waitUntil: 'networkidle' });
  await settings.locator('[data-motion-setting]').check();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-focus-motion]')
        .getAttribute('aria-pressed') === 'true',
  );
  await page.locator('[data-focus-motion]').click();
  await settings.waitForFunction(
    () => !document.querySelector('[data-motion-setting]').checked,
  );
  await settings.locator('[data-display-option="timeline"]').uncheck();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-workroom-menu-option="timeline"]').hidden,
  );
  await settings.locator('[data-display-option="timeline"]').check();
  mark(
    'Final assets: initial work hash and two-way motion/menu cross-tab events work',
  );

  await goto('write/');
  await fillWriter();
  await getDownload('[data-download-button]');
  await leave('dismiss', false);
  await goto('write/');
  await fillWriter();
  await getDownload('[data-download-button]');
  await page.locator('#write-title').fill('【合成検証】ダウンロード後の変更');
  await leave('dismiss', true);
  assert.equal(
    await page.locator('#write-title').inputValue(),
    '【合成検証】ダウンロード後の変更',
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(out, 'writer-1280.png') });
  report.screenshots.push('writer-1280.png');
  await leave('accept', true);
  mark(
    'Final writer: downloaded input leaves without a prompt; later edit prompts, cancel retains, accept leaves',
  );

  await goto('write/maker-field/');
  await page
    .locator('#maker-file')
    .setInputFiles(path.join(out, 'fixtures/records.json'));
  await page.waitForFunction(
    () => !document.querySelector('#maker-load').disabled,
  );
  await page.locator('#maker-load').click();
  await page.locator('#maker-choice').selectOption('0');
  await page
    .locator('#maker-description')
    .fill('【合成検証】最終受け渡し確認。');
  await page.locator('#maker-category').selectOption('雑記');
  await page.locator('#maker-slug').fill('synthetic-final-maker');
  await page.locator('#maker-prepare').click();
  await page.waitForFunction(
    () => !document.querySelector('#maker-download').disabled,
  );
  await getDownload('#maker-download');
  await page
    .locator('#maker-description')
    .fill('【合成検証】受け渡し後に変えた入力。');
  await leave('dismiss', true);
  assert.equal(
    await page.locator('#maker-description').inputValue(),
    '【合成検証】受け渡し後に変えた入力。',
  );
  await leave('accept', true);
  mark(
    'Final Maker: edit after download arms native exit guard; cancel retains input',
  );

  await goto('compare/experiments/');
  const card = page.locator('[data-experiment="motion"]');
  await card.locator('[data-open]').click();
  await card.locator('iframe').waitFor();
  const frame = await (
    await card.locator('iframe').elementHandle()
  ).contentFrame();
  await frame.waitForSelector('#replay');
  assert.equal(
    await frame.locator('body').getAttribute('data-running'),
    'false',
  );
  await card.screenshot({ path: path.join(out, 'experiment-open-1280.png') });
  report.screenshots.push('experiment-open-1280.png');
  mark('Open experiment card captured while initially stopped');

  for (const [label, url] of [
    ['integrated', base],
    ['focusBaseline', 'http://127.0.0.1:4358/hamaya-site-draft/compare/focus/'],
  ]) {
    const perfCtx = await browser.newContext({ reducedMotion: 'reduce' });
    const perf = await perfCtx.newPage();
    const responses = [],
      pending = [];
    perf.on('response', (response) =>
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
    await perf.goto(url, { waitUntil: 'networkidle' });
    await Promise.all(pending);
    report.performance[label] = {
      htmlBytes: responses
        .filter((x) => x.type === 'document')
        .reduce((a, x) => a + x.bytes, 0),
      assetBytes: responses
        .filter((x) => x.type !== 'document')
        .reduce((a, x) => a + x.bytes, 0),
      responses,
    };
    if (label === 'integrated')
      assert.ok(
        !responses.some((x) =>
          /maker|adapter|draft-import|Experiment|experiment|candidate-selection|WorkCandidates/i.test(
            x.path,
          ),
        ),
      );
    await perfCtx.close();
  }
  mark(
    'Final asset byte counts captured; optional parser and experiment code absent from initial home',
  );
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await browser.close();
  await writeFile(
    path.join(out, 'final-smoke-evidence.json'),
    JSON.stringify(report, null, 2),
  );
}
