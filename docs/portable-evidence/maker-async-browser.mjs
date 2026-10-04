import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/tmp/hamaya-browser-qa/node_modules/playwright/index.mjs';

const qa = path.dirname(fileURLToPath(import.meta.url));
const base = 'http://127.0.0.1:4364/portable-origin/';
const source = JSON.parse(
  await readFile(
    path.join(qa, '../site-portable/docs/portable-sample/maker-source.json'),
    'utf8',
  ),
);
const report = {
  scope:
    'Synthetic Maker ZIP async cancellation and native unsaved-navigation checks only.',
  base,
  checks: [],
  dialogs: [],
  downloads: [],
  errors: [],
  requests: [],
  failure: null,
};
const downloadDirectory = path.join(qa, 'maker-async-downloads');
await mkdir(downloadDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function newCase(name, delayed = false) {
  const context = await browser.newContext({
    acceptDownloads: true,
    reducedMotion: 'reduce',
    viewport: { width: 1280, height: 900 },
  });
  context.on('request', (request) =>
    report.requests.push({
      case: name,
      url: request.url(),
      method: request.method(),
    }),
  );
  if (delayed)
    await context.addInitScript(() => {
      const original = window.createImageBitmap.bind(window);
      const state = {
        waiting: false,
        returned: false,
        closed: false,
        release: undefined,
      };
      window.__portableDecode = state;
      window.createImageBitmap = async (...args) => {
        const bitmap = await original(...args);
        state.waiting = true;
        await new Promise((resolve) => {
          state.release = resolve;
        });
        state.waiting = false;
        state.returned = true;
        return {
          width: bitmap.width,
          height: bitmap.height,
          close() {
            bitmap.close();
            state.closed = true;
          },
        };
      };
    });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  let dialogAction = 'dismiss';
  const caseDialogs = [];
  const caseDownloads = [];
  page.on('pageerror', (error) =>
    report.errors.push({ case: name, message: error.message }),
  );
  page.on('dialog', async (dialog) => {
    const item = { case: name, type: dialog.type(), action: dialogAction };
    caseDialogs.push(item);
    report.dialogs.push(item);
    if (dialogAction === 'accept') await dialog.accept();
    else await dialog.dismiss();
  });
  page.on('download', (download) => {
    caseDownloads.push(download);
    report.downloads.push({
      case: name,
      filename: download.suggestedFilename(),
    });
  });
  assert.equal((await page.goto(`${base}write/maker-field/`)).status(), 200);
  async function load(value = source) {
    await page.locator('#maker-file').setInputFiles({
      name: 'synthetic-maker.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(value)),
    });
    await page.locator('#maker-load:enabled').waitFor();
    await page.locator('#maker-load').click();
    await page.locator('#maker-choice').selectOption('0');
    await fill(`合成・${name}の入力`, `synthetic-${name}`);
    await page.locator('#maker-prepare').click();
    await page.locator('#maker-package:enabled').waitFor();
  }
  async function fill(description, slug) {
    await page.locator('#maker-description').fill(description);
    await page.locator('#maker-category').selectOption('学び');
    await page.locator('#maker-slug').fill(slug);
  }
  async function leave(action, expectedDialog) {
    const before = caseDialogs.length;
    dialogAction = action;
    const dialogPromise = expectedDialog
      ? page.waitForEvent('dialog')
      : undefined;
    await page
      .locator('[data-workroom-nav] a[href$="/room/notes/"]')
      .click({ noWaitAfter: true });
    if (dialogPromise)
      assert.equal((await dialogPromise).type(), 'beforeunload');
    if (!expectedDialog || action === 'accept')
      await page.waitForURL('**/room/notes/');
    else {
      await page.waitForTimeout(100);
      assert.equal(page.url(), `${base}write/maker-field/`);
    }
    assert.equal(caseDialogs.length - before, expectedDialog ? 1 : 0);
  }
  async function releaseAndSettle() {
    await page.evaluate(() => window.__portableDecode.release());
    await page.waitForFunction(
      () => window.__portableDecode.returned && window.__portableDecode.closed,
    );
    // The adapter hashes the final Markdown after decoding. Allow its bounded
    // async completion and the cached import contract to settle before counting.
    await page.waitForTimeout(300);
  }
  async function saveZip() {
    const waiting = page.waitForEvent('download');
    await page.locator('#maker-package').click();
    const download = await waiting;
    await download.saveAs(
      path.join(downloadDirectory, download.suggestedFilename()),
    );
    await page
      .locator('#maker-download-status')
      .filter({ hasText: /ダウンロードを開始しました/ })
      .waitFor();
    assert.equal(caseDownloads.length, 1);
    assert.equal(await page.locator('#maker-package').isDisabled(), true);
  }
  return {
    name,
    context,
    page,
    load,
    fill,
    leave,
    releaseAndSettle,
    saveZip,
    caseDownloads,
  };
}

function mark(name, evidence) {
  report.checks.push({ name, ...evidence });
  console.log(`PASS ${name}`);
}

try {
  {
    const run = await newCase('decode-edit', true);
    try {
      await run.load();
      await run.page.locator('#maker-package').click();
      await run.page.waitForFunction(() => window.__portableDecode.waiting);
      await run.page
        .locator('#maker-description')
        .fill('合成・画像確認の途中で変更した要約');
      await run.releaseAndSettle();
      assert.equal(run.caseDownloads.length, 0);
      assert.equal(
        await run.page.locator('#maker-description').inputValue(),
        '合成・画像確認の途中で変更した要約',
      );
      assert.equal(
        await run.page.locator('#maker-slug').inputValue(),
        'synthetic-decode-edit',
      );
      assert.equal(await run.page.locator('#maker-result').isHidden(), true);
      await run.leave('dismiss', true);
      assert.equal(
        await run.page.locator('#maker-description').inputValue(),
        '合成・画像確認の途中で変更した要約',
      );
      mark(
        'Changing input during real image decoding suppresses the stale ZIP and keeps the new unsaved input.',
        { downloads: 0, nativeDismissPreservedInput: true },
      );
    } finally {
      await run.context.close();
    }
  }
  {
    const run = await newCase('decode-switch', true);
    try {
      const two = structuredClone(source);
      two.experiments.push({
        ...structuredClone(two.experiments[0]),
        id: 'synthetic-other-record',
        title: '合成・切替先の記録',
        body: '記録切替のための合成本文です。',
      });
      await run.load(two);
      await run.page.locator('#maker-package').click();
      await run.page.waitForFunction(() => window.__portableDecode.waiting);
      await run.page.locator('#maker-choice').selectOption('1');
      await run.fill('合成・切替先で書いた要約', 'synthetic-other-record');
      await run.releaseAndSettle();
      assert.equal(run.caseDownloads.length, 0);
      assert.equal(
        await run.page.locator('#maker-title').innerText(),
        '合成・切替先の記録',
      );
      assert.equal(
        await run.page.locator('#maker-description').inputValue(),
        '合成・切替先で書いた要約',
      );
      await run.page.locator('#maker-choice').selectOption('0');
      assert.equal(
        await run.page.locator('#maker-description').inputValue(),
        '合成・decode-switchの入力',
      );
      assert.equal(
        await run.page.locator('#maker-slug').inputValue(),
        'synthetic-decode-switch',
      );
      await run.page.locator('#maker-choice').selectOption('1');
      assert.equal(
        await run.page.locator('#maker-description').inputValue(),
        '合成・切替先で書いた要約',
      );
      await run.leave('dismiss', true);
      assert.equal(
        await run.page.locator('#maker-description').inputValue(),
        '合成・切替先で書いた要約',
      );
      mark(
        "Switching records during decoding suppresses the old ZIP and retains both records' separate inputs.",
        {
          downloads: 0,
          retainedRecordInputs: 2,
          nativeDismissPreservedInput: true,
        },
      );
    } finally {
      await run.context.close();
    }
  }
  {
    const run = await newCase('saved-clean');
    try {
      await run.load();
      await run.saveZip();
      await run.leave('dismiss', false);
      mark(
        'A successful ZIP handoff allows real navigation without an unsaved-input dialog.',
        { downloads: 1, nativeDialogs: 0 },
      );
    } finally {
      await run.context.close();
    }
  }
  {
    const run = await newCase('saved-edited');
    try {
      await run.load();
      await run.saveZip();
      await run.page
        .locator('#maker-description')
        .fill('合成・ZIP保存後に変更した要約');
      await run.leave('dismiss', true);
      assert.equal(
        await run.page.locator('#maker-description').inputValue(),
        '合成・ZIP保存後に変更した要約',
      );
      await run.leave('accept', true);
      mark(
        'Editing after ZIP handoff restores the native warning; cancel keeps input and accept leaves.',
        { downloads: 1, nativeDialogs: 2, actions: ['dismiss', 'accept'] },
      );
    } finally {
      await run.context.close();
    }
  }
  assert.deepEqual(report.errors, []);
  assert.ok(
    report.requests.every(
      (request) =>
        request.url.startsWith('http://127.0.0.1:4364/') &&
        request.method === 'GET',
    ),
  );
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await browser.close();
  report.browserClosed = true;
  await writeFile(
    path.join(qa, 'maker-async-browser.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    JSON.stringify({
      passedGroups: report.checks.length,
      errors: report.errors.length,
      failure: report.failure?.message ?? null,
      browserClosed: true,
    }),
  );
}
