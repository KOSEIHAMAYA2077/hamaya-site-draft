import { chromium } from '/tmp/hamaya-browser-qa/node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';

const root = '/Users/hamayakousei/Documents/Codex/2026-10-04/task-3/.dot';
const qa = path.join(root, 'portable-qa');
const sample = path.join(root, 'site-portable/docs/portable-sample');
const base = 'http://127.0.0.1:4364/portable-origin/';
const source = await readFile(path.join(sample, 'maker-source.json'));
const checks = [];
const requests = [];
const errors = [];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    acceptDownloads: true,
    reducedMotion: 'reduce',
  });
  context.on('request', (request) =>
    requests.push({ url: request.url(), method: request.method() }),
  );
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(`${base}write/maker-field/`);
  async function load(bytes, slug = 'portable-maker-note') {
    await page.locator('#maker-file').setInputFiles({
      name: 'synthetic-maker.json',
      mimeType: 'application/json',
      buffer: bytes,
    });
    await page.locator('#maker-load').click();
    await page.locator('#maker-choice').selectOption('0');
    await page
      .locator('#maker-description')
      .fill('本文と画像を一緒に持ち出す合成検証です。');
    await page.locator('#maker-category').selectOption('学び');
    await page.locator('#maker-slug').fill(slug);
    await page.locator('#maker-prepare').click();
    await page.locator('#maker-package:enabled').waitFor();
  }
  await load(source);
  await page.locator('#maker-package').focus();
  const downloadPromise = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'portable-maker-note.zip');
  const archive = path.join(qa, download.suggestedFilename());
  await download.saveAs(archive);
  execFileSync('python3', [
    '-c',
    `import zipfile,sys\nfrom pathlib import Path\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nassert sorted(z.namelist())==['images/portable-maker-note-before.png','portable-maker-note.md','report.json']\nz.extractall(sys.argv[2])`,
    archive,
    sample,
  ]);
  const body = await readFile(path.join(sample, 'portable-maker-note.md'));
  const report = JSON.parse(await readFile(path.join(sample, 'report.json')));
  assert.deepEqual(
    await readFile(path.join(sample, 'images/portable-maker-note-before.png')),
    await readFile(path.join(sample, 'images/synthetic.png')),
  );
  assert.match(
    body.toString(),
    /!\[変更前の画像\]\(\.\/images\/portable-maker-note-before.png\)/,
  );
  assert.equal(report.package.originalJsonIncluded, false);
  assert.equal(report.package.selectedRecords, 1);
  checks.push(
    'Keyboard-activated ZIP download; independent Python CRC/path check; original image bytes identical; selected one record only.',
  );
  await page.screenshot({
    path: path.join(qa, 'maker-portable-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.locator('#maker-result').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(qa, 'maker-portable-mobile.png'),
    fullPage: true,
  });
  checks.push(
    '375px no horizontal overflow; reduced-motion enabled; keyboard package operation.',
  );

  const writer = await context.newPage();
  writer.on('pageerror', (error) => errors.push(error.message));
  writer.on('dialog', (dialog) => dialog.accept());
  await writer.goto(`${base}write/`);
  await writer.locator('.writer-import summary').click();
  await writer
    .locator('#write-import')
    .setInputFiles(path.join(sample, 'portable-maker-note.md'));
  await writer
    .locator('[data-import-status]')
    .filter({ hasText: /取り込みました/ })
    .waitFor();
  await writer.locator('[data-preview-button]').click();
  const roundtripPromise = writer.waitForEvent('download');
  await writer.locator('[data-download-button]').click();
  const roundtrip = await roundtripPromise;
  const saved = path.join(qa, 'maker-writer-roundtrip.md');
  await roundtrip.saveAs(saved);
  assert.deepEqual(await readFile(saved), body);
  checks.push(
    'Maker package Markdown -> writer import -> download preserved every byte.',
  );

  const malformed = JSON.parse(source.toString());
  malformed.experiments[0].beforeImage = 'data:image/png;base64,AA==';
  await load(Buffer.from(JSON.stringify(malformed)), 'portable-invalid-image');
  const before = await page.locator('#maker-description').inputValue();
  let accidentalDownloads = 0;
  page.on('download', () => accidentalDownloads++);
  await page.locator('#maker-package').click();
  await page.locator('#maker-error:not([hidden])').waitFor();
  assert.match(await page.locator('#maker-error').innerText(), /形式|画像/);
  assert.equal(await page.locator('#maker-description').inputValue(), before);
  assert.equal(accidentalDownloads, 0);
  checks.push('Invalid PNG stops the package without download or input loss.');
  const truncated = JSON.parse(source.toString());
  truncated.experiments[0].beforeImage = `data:image/png;base64,${(await readFile(path.join(sample, 'images/synthetic.png'))).subarray(0, 33).toString('base64')}`;
  await load(
    Buffer.from(JSON.stringify(truncated)),
    'portable-truncated-image',
  );
  await page.locator('#maker-package').click();
  await page.locator('#maker-error:not([hidden])').waitFor();
  assert.match(
    await page.locator('#maker-error').innerText(),
    /読み取れません/,
  );
  assert.equal(accidentalDownloads, 0);
  checks.push(
    'Valid PNG signature but truncated body fails the real browser decoder before download.',
  );
  const unknown = JSON.parse(source.toString());
  unknown.experiments[0].futureSetting = 'preserve me';
  const fieldsBefore = await page.locator('#maker-description').inputValue();
  await page.locator('#maker-file').setInputFiles({
    name: 'unknown.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(unknown)),
  });
  await page
    .locator('#maker-file-status')
    .filter({ hasText: /未対応/ })
    .waitFor();
  assert.equal(
    await page.locator('#maker-description').inputValue(),
    fieldsBefore,
  );
  checks.push('Unknown Maker setting stops import and retains current input.');
  assert.deepEqual(errors, []);
  assert.ok(
    requests.every(
      (request) =>
        request.url.startsWith('http://127.0.0.1:4364/') &&
        request.method === 'GET',
    ),
  );
  checks.push('No external requests, uploads or page errors observed.');
  await writeFile(
    path.join(qa, 'maker-browser.json'),
    JSON.stringify(
      {
        checks,
        requestCount: requests.length,
        errors,
        archiveSha256: createHash('sha256')
          .update(await readFile(archive))
          .digest('hex'),
        markdownSha256: createHash('sha256').update(body).digest('hex'),
        imageSha256: createHash('sha256')
          .update(await readFile(path.join(sample, 'images/synthetic.png')))
          .digest('hex'),
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      checks: checks.length,
      requests: requests.length,
      errors,
    }),
  );
} finally {
  await browser.close();
}
