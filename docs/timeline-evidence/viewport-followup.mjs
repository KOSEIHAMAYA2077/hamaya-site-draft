import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '/tmp/hamaya-browser-qa/node_modules/playwright/index.mjs';
const out = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  'browser',
);
const previous = JSON.parse(
  await readFile(path.join(out, 'browser-evidence.json'), 'utf8'),
);
const entries = JSON.parse(
  await readFile(path.join(out, '../expected.json'), 'utf8'),
).entries;
const origin = 'http://127.0.0.1:4355';
const url = `${origin}/hamaya-site-draft/compare/timeline/`;
const browser = await chromium.launch({ headless: true });
const report = {
  browser: browser.version(),
  scope:
    'Final scroll hint and viewport-height CSS only. Prior date, empty, history and no-JS results are retained.',
  checks: [],
  errors: [],
  consoleErrors: [],
  failedRequests: [],
  externalRequests: [],
  dialogs: [],
  captures: [],
};
const mark = (name, details = {}) => {
  report.checks.push({ name, ...details });
  console.log('PASS', name);
};
async function activeRow(page) {
  await page.waitForFunction(() => {
    const area = document.querySelector('[data-timeline-scroll]');
    const active = document.querySelector(
      '[data-timeline-index][aria-current]',
    );
    if (!area || !active) return false;
    const box = area.getBoundingClientRect(),
      row = active.getBoundingClientRect();
    return (
      row.top >= box.top - 1 && row.bottom <= box.top + area.clientHeight + 1
    );
  });
  return page.evaluate(() => {
    const area = document.querySelector('[data-timeline-scroll]');
    const active = document.querySelector(
      '[data-timeline-index][aria-current]',
    );
    const box = area.getBoundingClientRect(),
      row = active.getBoundingClientRect();
    return {
      id: active.dataset.timelineChoice,
      pageScrollY: scrollY,
      indexHeight: area.clientHeight,
      rowTop: row.top,
      rowBottom: row.bottom,
      indexTop: box.top,
      indexBottom: box.bottom,
      viewportHeight: innerHeight,
    };
  });
}
async function waitSelected(page, id) {
  await page.waitForFunction((id) => {
    const visible = [
      ...document.querySelectorAll('[data-timeline-panel]'),
    ].filter((node) => !node.hidden);
    return visible.length === 1 && visible[0].dataset.timelinePanel === id;
  }, id);
}
try {
  for (const [width, height] of [
    [1280, 900],
    [1280, 768],
    [375, 812],
    [320, 640],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      reducedMotion:
        width === 1280 && height === 900 ? 'no-preference' : 'reduce',
      isMobile: width < 900,
      hasTouch: width < 900,
    });
    page.on('pageerror', (error) => report.errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') report.consoleErrors.push(message.text());
    });
    page.on('requestfailed', (request) =>
      report.failedRequests.push(request.url()),
    );
    page.on('dialog', async (dialog) => {
      report.dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await page.route('**/*', (route) => {
      if (new URL(route.request().url()).origin === origin)
        return route.continue();
      report.externalRequests.push(route.request().url());
      return route.abort();
    });
    await page.addInitScript(() => {
      window.__qaRafRequests = 0;
      const original = requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => {
        window.__qaRafRequests += 1;
        return original(callback);
      };
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    await waitSelected(page, 'glyph-matter');
    assert.equal(await page.evaluate(() => scrollY), 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      width,
    );
    const initialName = `timeline-final-${width}x${height}-initial.png`;
    await page.screenshot({
      path: path.join(out, initialName),
      fullPage: true,
    });
    report.captures.push({
      file: initialName,
      width,
      height,
      state: 'initial',
      source: url,
    });
    if (width === 1280 && height === 900) {
      const before = await page.evaluate(() => ({
        raf: window.__qaRafRequests,
        animations: document
          .getAnimations()
          .filter((animation) => animation.playState === 'running').length,
        markup: document.querySelector('[data-timeline-study]').innerHTML,
      }));
      await page.waitForTimeout(350);
      const after = await page.evaluate(() => ({
        raf: window.__qaRafRequests,
        animations: document
          .getAnimations()
          .filter((animation) => animation.playState === 'running').length,
        markup: document.querySelector('[data-timeline-study]').innerHTML,
      }));
      assert.equal(before.animations, 0);
      assert.deepEqual(after, before);
      mark('normal-motion-preference-still-has-no-idle-animation');
    }
    const picker = page.locator('[data-timeline-picker]');
    if (!(await picker.evaluate((element) => element.open)))
      await picker.locator('summary').click();
    const geometry = await activeRow(page);
    assert.equal(geometry.id, 'glyph-matter');
    assert.ok(geometry.rowTop >= 0, JSON.stringify(geometry));
    assert.ok(geometry.rowBottom <= height, JSON.stringify(geometry));
    assert.match(
      await page.locator('[data-timeline-study]').textContent(),
      /索引は上下にスクロールできます。/,
    );
    const indexName = `timeline-final-${width}x${height}-index.png`;
    await page.screenshot({ path: path.join(out, indexName), fullPage: true });
    report.captures.push({
      file: indexName,
      width,
      height,
      state: 'index-open',
      source: url,
    });
    if (width < 900) {
      await picker.locator('summary').focus();
      await page.keyboard.press('Tab');
      assert.equal(
        await page.evaluate(
          () => document.activeElement.dataset.timelineChoice,
        ),
        entries[0].id,
      );
      await page.keyboard.press('Enter');
    } else {
      const first = page.locator(
        `[data-timeline-index][data-timeline-choice="${entries[0].id}"]`,
      );
      await first.focus();
      await page.keyboard.press('Enter');
    }
    await waitSelected(page, entries[0].id);
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      `record-${entries[0].id}`,
    );
    const next = page.locator(
      `[data-timeline-panel="${entries[0].id}"] a[data-timeline-choice="${entries[1].id}"]`,
    );
    await next.focus();
    await page.keyboard.press('Enter');
    await waitSelected(page, entries[1].id);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      width,
    );
    if (!(await picker.evaluate((element) => element.open)))
      await picker.locator('summary').click();
    assert.equal((await activeRow(page)).id, entries[1].id);
    mark(`final-viewport-${width}x${height}`, {
      initialPageScrollY: 0,
      activeIndexVisible: true,
      keyboardWorks: true,
      noHorizontalOverflow: true,
      geometry,
    });
    await page.close();
  }
  for (const key of [
    'errors',
    'consoleErrors',
    'failedRequests',
    'externalRequests',
    'dialogs',
  ])
    assert.deepEqual(report[key], []);
} catch (error) {
  report.failure = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  throw error;
} finally {
  await writeFile(
    path.join(out, 'viewport-followup-evidence.json'),
    JSON.stringify(report, null, 2),
  );
  if (!report.failure) {
    await writeFile(
      path.join(out, 'browser-evidence-before-viewport-followup.json'),
      JSON.stringify(previous, null, 2),
    );
    const combined = {
      ...previous,
      finalCaptures: report.captures,
      followup: report.scope,
    };
    for (const key of [
      'checks',
      'errors',
      'consoleErrors',
      'failedRequests',
      'externalRequests',
      'dialogs',
    ])
      combined[key] = [...previous[key], ...report[key]];
    await writeFile(
      path.join(out, 'browser-evidence.json'),
      JSON.stringify(combined, null, 2),
    );
  }
  await browser.close();
}
