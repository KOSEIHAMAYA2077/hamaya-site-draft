import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '/tmp/hamaya-browser-qa/node_modules/playwright/index.mjs';

const root = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(root, 'browser');
const downloads = path.join(out, 'downloads');
await mkdir(downloads, { recursive: true });
const expected = JSON.parse(
  await readFile(path.join(root, 'expected.json'), 'utf8'),
);
const origin = 'http://127.0.0.1:4354';
const bridgeURL = `${origin}/hamaya-site-draft/write/maker-field/`;
const writerURL = `${origin}/hamaya-site-draft/write/`;
const fixture = (name) => path.join(root, 'fixtures', `synthetic-${name}.json`);
const selectionOnly = process.argv.includes('--selection-regression-only');
const previousReport = selectionOnly
  ? JSON.parse(await readFile(path.join(out, 'browser-evidence.json'), 'utf8'))
  : null;
const browser = await chromium.launch({ headless: true });
const report = {
  browser: browser.version(),
  scope: 'Synthetic fixtures only; no Maker source or examples modified.',
  checks: [],
  errors: [],
  consoleErrors: [],
  dialogs: [],
  requests: [],
  failedRequests: [],
  storageWrites: [],
  accidentalExecutions: [],
};
const mark = (name, details = {}) => {
  report.checks.push({ name, ...details });
  console.log('PASS', name);
};
function attach(page) {
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push(message.text());
  });
  page.on('dialog', async (dialog) => {
    report.dialogs.push({ type: dialog.type(), message: dialog.message() });
    await dialog.dismiss();
  });
}
async function context(options = {}) {
  const ctx = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
    ...options,
  });
  ctx.on('page', attach);
  ctx.on('request', (request) =>
    report.requests.push({
      url: request.url(),
      method: request.method(),
      containsFixture: `${request.url()}${request.postData() || ''}`.includes(
        expected.marker,
      ),
    }),
  );
  ctx.on('requestfailed', (request) =>
    report.failedRequests.push(request.url()),
  );
  await ctx.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort(),
  );
  await ctx.addInitScript(() => {
    window.__qaStorageWrites = [];
    window.__makerUnexpected = false;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      window.__qaStorageWrites.push({
        area: this === localStorage ? 'localStorage' : 'sessionStorage',
        key,
        length: String(value).length,
      });
      return original.call(this, key, value);
    };
  });
  return ctx;
}
async function collect(ctx) {
  for (const page of ctx.pages()) {
    const observed = await page
      .evaluate(() => ({
        writes: window.__qaStorageWrites || [],
        executed: window.__makerUnexpected === true,
      }))
      .catch(() => ({ writes: [], executed: false }));
    report.storageWrites.push(...observed.writes);
    if (observed.executed) report.accidentalExecutions.push(page.url());
  }
}
async function closeContext(ctx) {
  await collect(ctx);
  await ctx.close();
}
async function waitText(page, selector, pattern) {
  await page.waitForFunction(
    ({ selector, pattern }) =>
      new RegExp(pattern).test(
        document.querySelector(selector)?.textContent || '',
      ),
    { selector, pattern: pattern.source },
  );
}
async function openJSON(page, name, keyboard = false) {
  await page.locator('#maker-file').setInputFiles(fixture(name));
  await page.locator('#maker-load').waitFor({ state: 'visible' });
  await page.waitForFunction(
    () => !document.querySelector('#maker-load').disabled,
  );
  if (keyboard) {
    await page.locator('#maker-load').focus();
    await page.keyboard.press('Enter');
  } else await page.locator('#maker-load').click();
  await page.locator('#maker-pending').waitFor({ state: 'hidden' });
}
async function formState(page) {
  return page.evaluate(() =>
    Object.fromEntries(
      ['choice', 'description', 'category', 'slug', 'title'].map((key) => {
        const node = document.querySelector(`#maker-${key}`);
        return [key, 'value' in node ? node.value : node.textContent];
      }),
    ),
  );
}
async function fillOutput(page, slug = 'synthetic-maker-roundtrip') {
  await page
    .locator('#maker-description')
    .fill('合成データの動作検証。本人の実績ではありません。');
  await page.locator('#maker-category').selectOption('雑記');
  await page.locator('#maker-slug').fill(slug);
}
function unpack(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/);
  assert.ok(match, 'frontmatter and body boundary');
  return { header: match[1], body: match[2] };
}
async function importInWriter(page, filename) {
  const details = page.locator('details.writer-import');
  if (!(await details.getAttribute('open'))) {
    const isOpen = await details.evaluate((element) => element.open);
    if (!isOpen) await details.locator('summary').click();
  }
  await page.locator('#write-import').setInputFiles(filename);
}

async function selectionRegression() {
  const ctx = await context();
  // Deterministically hold one real WebCrypto operation. The site code is not
  // modified; the delayed call computes the genuine SHA-256 after release.
  await ctx.addInitScript(() => {
    // Playwright also initializes about:blank, where SubtleCrypto can be absent.
    // Install the delay only after the localhost secure-context navigation.
    if (!crypto.subtle) return;
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    window.__qaHoldNextDigest = false;
    window.__qaDigestActive = 0;
    window.__qaDigestCompleted = 0;
    window.__qaReleaseDigest = null;
    crypto.subtle.digest = async (...args) => {
      window.__qaDigestActive += 1;
      try {
        if (window.__qaHoldNextDigest) {
          window.__qaHoldNextDigest = false;
          await new Promise((resolve) => {
            window.__qaReleaseDigest = resolve;
          });
        }
        return await digest(...args);
      } finally {
        window.__qaDigestActive -= 1;
        window.__qaDigestCompleted += 1;
      }
    };
  });
  const page = await ctx.newPage();
  await page.goto(bridgeURL, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: path.join(out, 'synthetic-1280-static.png'),
    fullPage: true,
  });
  await openJSON(page, 'valid');
  const select = (value) => page.locator('#maker-choice').selectOption(value);
  const fields = async () => {
    const { description, category, slug } = await formState(page);
    return { description, category, slug };
  };
  const enter = async (values) => {
    await page.locator('#maker-description').fill(values.description);
    await page.locator('#maker-category').selectOption(values.category);
    await page.locator('#maker-slug').fill(values.slug);
  };
  const empty = { description: '', category: '', slug: '' };
  const a = {
    description: '【合成検証】Aの要約を残す。',
    category: '雑記',
    slug: 'synthetic-selection-a',
  };
  const b = {
    description: '【合成検証】Bは別の要約。',
    category: '学び',
    slug: 'synthetic-selection-b',
  };
  await select('0');
  await page.locator('#maker-preview').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(out, 'synthetic-1280-selected.png'),
  });
  await enter(a);
  await select('3');
  assert.deepEqual(await fields(), empty);
  await enter(b);
  await select('0');
  assert.deepEqual(await fields(), a);
  await select('3');
  assert.deepEqual(await fields(), b);
  await select('');
  assert.equal(await page.locator('#maker-output-fields').isHidden(), true);
  await select('0');
  assert.deepEqual(await fields(), a);
  await select('');
  await select('3');
  assert.deepEqual(await fields(), b);
  mark('selection-a-b-a-and-empty-selection-restore-per-record-input');

  await page.locator('#maker-file').setInputFiles(fixture('replacement'));
  await page.waitForFunction(
    () => !document.querySelector('#maker-load').disabled,
  );
  await page.locator('#maker-cancel').click();
  assert.deepEqual(await fields(), b);
  await page.locator('#maker-file').setInputFiles(fixture('malformed'));
  await waitText(page, '#maker-file-status', /JSONを読み取れ/);
  assert.deepEqual(await fields(), b);
  await select('0');
  assert.deepEqual(await fields(), a);
  await select('3');
  assert.deepEqual(await fields(), b);
  mark('replacement-cancel-and-json-error-preserve-both-record-inputs');

  await select('0');
  await page.evaluate(() => {
    window.__qaHoldNextDigest = true;
  });
  await page.locator('#maker-prepare').click();
  await page.waitForFunction(
    () => typeof window.__qaReleaseDigest === 'function',
  );
  await select('3');
  assert.deepEqual(await fields(), b);
  assert.equal(await page.locator('#maker-result').isHidden(), true);
  await page.locator('#maker-prepare').click();
  await page.locator('#maker-result').waitFor({ state: 'visible' });
  assert.match(
    await page.locator('#maker-output-summary').textContent(),
    /synthetic-selection-b\.md/,
  );
  await page.locator('#maker-result').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, 'synthetic-1280-output.png') });
  await page.evaluate(() => {
    window.__qaReleaseDigest();
    window.__qaReleaseDigest = null;
  });
  await page.waitForFunction(
    () => window.__qaDigestActive === 0 && window.__qaDigestCompleted >= 5,
  );
  await page.waitForLoadState('networkidle');
  assert.deepEqual(await fields(), b);
  assert.match(
    await page.locator('#maker-output-summary').textContent(),
    /synthetic-selection-b\.md/,
  );
  const output = await page.locator('#maker-output-preview').textContent();
  assert.ok(output.includes('【合成検証】短い比較'));
  assert.ok(!output.includes(expected.title));
  await select('0');
  assert.deepEqual(await fields(), a);
  assert.equal(await page.locator('#maker-result').isHidden(), true);
  mark('delayed-old-conversion-cannot-replace-current-selection-result', {
    delayedRealWebCrypto: true,
    completedBWhileAHeld: true,
  });

  await openJSON(page, 'replacement');
  await select('0');
  assert.deepEqual(await fields(), empty);
  await openJSON(page, 'valid');
  await select('0');
  assert.deepEqual(await fields(), empty);
  await select('3');
  assert.deepEqual(await fields(), empty);
  await enter(b);
  await select('0');
  await enter(a);
  await openJSON(page, 'valid');
  await select('0');
  assert.deepEqual(await fields(), empty);
  await select('3');
  assert.deepEqual(await fields(), empty);
  mark('confirmed-new-json-and-same-json-reload-clear-old-record-inputs');

  await enter(b);
  await select('0');
  await enter(a);
  await page.locator('#maker-reset').click();
  assert.equal(await page.locator('#maker-records').isHidden(), true);
  assert.deepEqual(await fields(), empty);
  await openJSON(page, 'valid');
  await select('0');
  assert.deepEqual(await fields(), empty);
  await select('3');
  assert.deepEqual(await fields(), empty);
  mark('explicit-reading-reset-clears-all-record-inputs');
  await closeContext(ctx);

  const captureContext = await context({
    viewport: { width: 320, height: 900 },
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await captureContext.newPage();
  await mobile.goto(bridgeURL, { waitUntil: 'networkidle' });
  await mobile.screenshot({
    path: path.join(out, 'synthetic-320-static.png'),
    fullPage: true,
  });
  await openJSON(mobile, 'valid');
  await mobile.locator('#maker-choice').selectOption('0');
  await fillOutput(mobile, 'synthetic-mobile-latest');
  await mobile.locator('#maker-prepare').click();
  await mobile.locator('#maker-result').waitFor({ state: 'visible' });
  assert.equal(
    await mobile.evaluate(() => document.documentElement.scrollWidth),
    320,
  );
  await mobile.locator('#maker-result').scrollIntoViewIfNeeded();
  await mobile.screenshot({ path: path.join(out, 'synthetic-320-output.png') });
  mark('latest-build-desktop-and-mobile-captures', {
    screenshots: 5,
    mobileOverflow: false,
  });
  await closeContext(captureContext);
}

try {
  if (!selectionOnly) {
    const ctx = await context();
    const originalWriter = await ctx.newPage();
    await originalWriter.goto(writerURL, { waitUntil: 'networkidle' });
    const unsaved = {
      title: '【合成検証】元タブの未保存の題',
      body: '元タブの未保存本文です。\n取り込みをやめたら、このまま残ります。',
    };
    await originalWriter.locator('#write-title').fill(unsaved.title);
    await originalWriter.locator('#write-body').fill(unsaved.body);
    const popup = ctx.waitForEvent('page');
    await originalWriter.locator('[data-maker-writer-entry]').click();
    const bridge = await popup;
    await bridge.waitForLoadState('networkidle');
    assert.equal(bridge.url(), bridgeURL);
    assert.equal(await bridge.evaluate(() => window.opener === null), true);
    assert.equal(
      await originalWriter.locator('#write-body').inputValue(),
      unsaved.body,
    );
    await bridge.screenshot({
      path: path.join(out, 'synthetic-1280-static.png'),
      fullPage: true,
    });
    mark('unsaved-writer-opens-independent-bridge-tab');

    await openJSON(bridge, 'valid');
    assert.equal(await bridge.locator('#maker-choice option').count(), 5);
    await bridge.locator('#maker-choice').selectOption('0');
    assert.equal(
      await bridge.locator('#maker-title').textContent(),
      expected.title,
    );
    const preview = await bridge.locator('#maker-fields').textContent();
    assert.ok(preview.includes('<script>window.__makerUnexpected=true;'));
    assert.ok(preview.includes('表示を省略'));
    assert.equal(
      await bridge
        .locator(
          '#maker-fields script, #maker-fields img, #maker-fields iframe, #maker-fields a',
        )
        .count(),
      0,
    );
    assert.equal(
      await bridge.evaluate(() => document.documentElement.scrollWidth),
      1280,
    );
    await bridge.locator('#maker-preview').scrollIntoViewIfNeeded();
    await bridge.screenshot({
      path: path.join(out, 'synthetic-1280-selected.png'),
    });
    await fillOutput(bridge);
    const preserved = await formState(bridge);
    await bridge.locator('#maker-file').dispatchEvent('cancel');
    assert.deepEqual(await formState(bridge), preserved);
    await bridge.locator('#maker-file').setInputFiles([]);
    assert.deepEqual(await formState(bridge), preserved);
    await bridge.locator('#maker-file').setInputFiles(fixture('replacement'));
    await bridge.waitForFunction(
      () => !document.querySelector('#maker-load').disabled,
    );
    assert.deepEqual(await formState(bridge), preserved);
    await bridge.locator('#maker-cancel').click();
    assert.deepEqual(await formState(bridge), preserved);
    mark('literal-preview-long-japanese-and-cancel-preserves-input', {
      inputBodyCodeUnits: expected.body.length,
      fileChooserCancel:
        'cancel DOM event plus empty selection; no OS picker automation',
      replacementCancel: true,
    });

    const invalid = [
      ['duplicate-id', /同じID/],
      ['escaped-duplicate', /同じキー|重複/],
      ['unknown-field', /未対応/],
      ['surrogate-high', /Unicode|サロゲート/],
      ['surrogate-low', /Unicode|サロゲート/],
      ['malformed', /JSONを読み取れ/],
      ['invalid-utf8', /UTF-8/],
      ['too-large', /8 MiB/],
    ];
    for (const [name, message] of invalid) {
      await bridge.locator('#maker-file').setInputFiles(fixture(name));
      await waitText(bridge, '#maker-file-status', message);
      assert.deepEqual(await formState(bridge), preserved, name);
      assert.equal(await bridge.locator('#maker-pending').isHidden(), true);
      mark(`reject-${name}-without-input-loss`);
    }
    await bridge.locator('#maker-description').fill('');
    await bridge.locator('#maker-prepare').click();
    await bridge.locator('#maker-error').waitFor({ state: 'visible' });
    assert.equal(
      await bridge.locator('#maker-slug').inputValue(),
      preserved.slug,
    );
    assert.equal(await bridge.locator('#maker-choice').inputValue(), '0');
    await fillOutput(bridge);
    await bridge.locator('#maker-prepare').click();
    await bridge.locator('#maker-result').waitFor({ state: 'visible' });
    assert.match(
      await bridge.locator('#maker-output-summary').textContent(),
      /draft: true/,
    );
    await bridge.locator('#maker-result').scrollIntoViewIfNeeded();
    await bridge.screenshot({
      path: path.join(out, 'synthetic-1280-output.png'),
    });
    const firstDownloadPromise = bridge.waitForEvent('download');
    await bridge.locator('#maker-download').click();
    const firstDownload = await firstDownloadPromise;
    assert.equal(
      firstDownload.suggestedFilename(),
      'synthetic-maker-roundtrip.md',
    );
    const exportedPath = path.join(
      downloads,
      firstDownload.suggestedFilename(),
    );
    await firstDownload.saveAs(exportedPath);
    const markdown = await readFile(exportedPath, 'utf8');
    const exported = unpack(markdown);
    assert.match(exported.header, /^draft: true$/m);
    assert.ok(exported.body.includes(expected.body));
    assert.ok(exported.body.includes('画像データは含めていません'));
    assert.ok(!markdown.includes('data:image/png;base64'));
    mark('actual-download-preserves-full-literal-body', {
      bytes: Buffer.byteLength(markdown),
      filename: firstDownload.suggestedFilename(),
      draft: true,
      imageBytesOmitted: true,
    });

    const writerPopup = ctx.waitForEvent('page');
    await bridge.locator('#maker-next').click();
    const returnedWriter = await writerPopup;
    await returnedWriter.waitForLoadState('networkidle');
    assert.ok(returnedWriter.url().startsWith(writerURL));
    assert.equal(
      await returnedWriter.evaluate(() => window.opener === null),
      true,
    );
    await importInWriter(returnedWriter, exportedPath);
    await returnedWriter.waitForFunction(
      (title) => document.querySelector('#write-title').value === title,
      expected.title,
    );
    assert.equal(
      await returnedWriter.locator('#write-body').inputValue(),
      exported.body,
    );
    await returnedWriter.locator('[data-reader-button]').click();
    const reader = returnedWriter.locator('[data-reader-panel]');
    assert.ok(
      (await reader.textContent()).includes(
        '<script>window.__makerUnexpected=true;',
      ),
    );
    assert.equal(await reader.locator('script,img,iframe,a').count(), 0);
    const secondDownloadPromise = returnedWriter.waitForEvent('download');
    await returnedWriter.locator('[data-download-button]').click();
    const secondDownload = await secondDownloadPromise;
    const writerPath = path.join(downloads, 'writer-roundtrip.md');
    await secondDownload.saveAs(writerPath);
    const roundtrip = unpack(await readFile(writerPath, 'utf8'));
    assert.equal(roundtrip.body, exported.body);
    assert.equal(roundtrip.header, exported.header);
    assert.match(roundtrip.header, /^draft: true$/m);
    mark('bridge-download-writer-import-reader-download-roundtrip', {
      bodyExact: true,
      frontmatterExact: true,
    });

    await originalWriter.bringToFront();
    assert.equal(
      await originalWriter.locator('#write-title').inputValue(),
      unsaved.title,
    );
    assert.equal(
      await originalWriter.locator('#write-body').inputValue(),
      unsaved.body,
    );
    await importInWriter(originalWriter, exportedPath);
    await originalWriter
      .locator('[data-import-confirm]')
      .waitFor({ state: 'visible' });
    assert.equal(
      await originalWriter.locator('#write-body').inputValue(),
      unsaved.body,
    );
    await originalWriter.locator('[data-import-cancel]').click();
    assert.equal(
      await originalWriter.locator('#write-title').inputValue(),
      unsaved.title,
    );
    assert.equal(
      await originalWriter.locator('#write-body').inputValue(),
      unsaved.body,
    );
    mark('return-to-original-writer-import-cancel-preserves-unsaved-text');

    await bridge.bringToFront();
    assert.equal(await bridge.locator('#maker-download').isDisabled(), true);
    await bridge.locator('#maker-description').fill('合成検証の要約を変更。');
    await bridge.locator('#maker-prepare').click();
    await waitText(bridge, '#maker-error', /すでに使ったファイル名/);
    assert.equal(await bridge.locator('#maker-result').isHidden(), true);
    assert.equal(
      await bridge.locator('#maker-slug').inputValue(),
      'synthetic-maker-roundtrip',
    );
    mark('same-screen-filename-reuse-rejected');

    for (const [index, type] of [
      ['1', 'missing-title'],
      ['2', 'missing-date'],
    ]) {
      await bridge.locator('#maker-choice').selectOption(index);
      await waitText(bridge, '#maker-selection-status', /題か日付が未入力/);
      assert.equal(
        await bridge.locator('#maker-output-fields').isHidden(),
        true,
      );
      assert.equal(await bridge.locator('#maker-prepare').isDisabled(), true);
      mark(`${type}-not-invented`);
    }
    await openJSON(bridge, 'empty');
    assert.equal(await bridge.locator('#maker-choice').isDisabled(), true);
    await waitText(bridge, '#maker-selection-status', /記録がありません/);
    mark('empty-data-readable');
    await closeContext(ctx);

    const mobileContext = await context({
      viewport: { width: 320, height: 900 },
      isMobile: true,
      hasTouch: true,
    });
    const mobile = await mobileContext.newPage();
    await mobile.goto(bridgeURL, { waitUntil: 'networkidle' });
    assert.equal(
      await mobile.evaluate(() => document.documentElement.scrollWidth),
      320,
    );
    await mobile.screenshot({
      path: path.join(out, 'synthetic-320-static.png'),
      fullPage: true,
    });
    await openJSON(mobile, 'valid', true);
    await mobile.locator('#maker-choice').focus();
    await mobile.keyboard.press('ArrowDown');
    await mobile.keyboard.press('Enter');
    await mobile.waitForFunction(
      () => document.querySelector('#maker-choice').value === '0',
    );
    await fillOutput(mobile, 'synthetic-mobile-keyboard');
    await mobile.locator('#maker-prepare').focus();
    await mobile.keyboard.press('Enter');
    await mobile.locator('#maker-result').waitFor({ state: 'visible' });
    assert.equal(
      await mobile.evaluate(() => document.documentElement.scrollWidth),
      320,
    );
    assert.equal(
      await mobile.evaluate(
        () => matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
      true,
    );
    await mobile.locator('#maker-result').scrollIntoViewIfNeeded();
    await mobile.screenshot({
      path: path.join(out, 'synthetic-320-output.png'),
    });
    mark('mobile-320-keyboard-reduced-motion', { noHorizontalOverflow: true });
    await closeContext(mobileContext);

    const nojsContext = await context({
      javaScriptEnabled: false,
      viewport: { width: 320, height: 900 },
    });
    const nojs = await nojsContext.newPage();
    await nojs.goto(bridgeURL, { waitUntil: 'networkidle' });
    assert.equal(await nojs.locator('#maker-file').isDisabled(), true);
    assert.match(await nojs.locator('noscript').textContent(), /JavaScript/);
    assert.equal(await nojs.locator('#maker-result').isHidden(), true);
    mark('no-javascript-readable-and-file-input-disabled');
    await closeContext(nojsContext);
  }
  await selectionRegression();

  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.consoleErrors, []);
  assert.deepEqual(report.dialogs, []);
  assert.deepEqual(report.failedRequests, []);
  assert.deepEqual(report.storageWrites, []);
  assert.deepEqual(report.accidentalExecutions, []);
  assert.ok(
    report.requests.every(
      (request) =>
        request.method === 'GET' &&
        !request.containsFixture &&
        new URL(request.url).origin === origin,
    ),
  );
  mark(
    'no-external-request-input-transmission-storage-write-or-script-execution',
    { requests: report.requests.length },
  );
} catch (error) {
  report.failure = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  for (const ctx of browser.contexts()) await collect(ctx);
  throw error;
} finally {
  if (selectionOnly) {
    await writeFile(
      path.join(out, 'selection-regression-evidence.json'),
      JSON.stringify(report, null, 2),
    );
    if (!report.failure) {
      await writeFile(
        path.join(out, 'browser-evidence-before-selection-regression.json'),
        JSON.stringify(previousReport, null, 2),
      );
      const merged = {
        ...previousReport,
        followup: {
          browser: report.browser,
          mode: 'selection regression only',
          preservedPreviousChecks: previousReport.checks.length,
        },
      };
      for (const key of [
        'checks',
        'errors',
        'consoleErrors',
        'dialogs',
        'requests',
        'failedRequests',
        'storageWrites',
        'accidentalExecutions',
      ])
        merged[key] = [...previousReport[key], ...report[key]];
      await writeFile(
        path.join(out, 'browser-evidence.json'),
        JSON.stringify(merged, null, 2),
      );
    }
  } else
    await writeFile(
      path.join(out, 'browser-evidence.json'),
      JSON.stringify(report, null, 2),
    );
  await browser.close();
}
