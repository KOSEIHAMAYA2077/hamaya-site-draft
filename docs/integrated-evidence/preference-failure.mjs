import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/tmp/hamaya-browser-qa/node_modules/playwright/index.mjs';
const out = path.dirname(fileURLToPath(import.meta.url));
const base = 'http://127.0.0.1:4360/hamaya-site-draft/';
const report = { checks: [], errors: [], failure: null };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: 'no-preference',
});
await context.addInitScript(() => {
  const read = Storage.prototype.getItem;
  Storage.prototype.getItem = function (key) {
    return key === 'archive-motion' ? 'on' : read.call(this, key);
  };
  Storage.prototype.setItem = function () {
    throw new DOMException(
      'Synthetic storage quota test',
      'QuotaExceededError',
    );
  };
});
const page = await context.newPage();
page.on('pageerror', (error) => report.errors.push(error.message));
const mark = (name) => {
  report.checks.push(name);
  console.log('PASS', name);
};
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  const toggle = page.locator('[data-focus-motion]');
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('html').getAttribute('data-motion'), 'off');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await toggle.waitFor({ state: 'hidden' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await toggle.waitFor({ state: 'visible' });
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('html').getAttribute('data-motion'), 'off');
  mark(
    'Failed storage write does not undo Focus stop or lose manual pause when reduced-motion changes',
  );
  await page.goto(`${base}room/settings/`, { waitUntil: 'networkidle' });
  await page.locator('[data-display-option="timeline"]').uncheck();
  await page.locator('[data-display-option="experiments"]').uncheck();
  await page.locator('[data-motion-setting]').check();
  assert.match(
    await page.locator('[data-settings-status]').innerText(),
    /保存できません/,
  );
  for (const key of ['timeline', 'experiments']) {
    assert.equal(
      await page.locator(`[data-display-option="${key}"]`).isChecked(),
      false,
    );
    assert.equal(
      await page
        .locator(`[data-workroom-menu-option="${key}"]`)
        .evaluate((el) => el.hidden),
      true,
    );
  }
  assert.equal(await page.locator('html').getAttribute('data-motion'), 'off');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('[data-motion-setting]').isChecked(), true);
  assert.equal(await page.locator('html').getAttribute('data-motion'), 'off');
  mark(
    'Settings report failed persistence and retain in-page menu/motion choices across media changes',
  );
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
  await writeFile(
    path.join(out, 'preference-failure-evidence.json'),
    JSON.stringify(report, null, 2),
  );
}
