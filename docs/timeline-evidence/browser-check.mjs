import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from '/tmp/hamaya-browser-qa/node_modules/playwright/index.mjs';

const root = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(root, 'browser');
await mkdir(out, { recursive: true });
const expected = JSON.parse(
  await readFile(path.join(root, 'expected.json'), 'utf8'),
);
const entries = expected.entries;
const ids = entries.map((entry) => entry.id);
const origin = 'http://127.0.0.1:4355';
const fixtureOrigin = 'http://127.0.0.1:4356';
const base = '/hamaya-site-draft';
const url = `${origin}${base}/compare/timeline/`;
const fixtureRoot = path.join(root, 'fixture-source/dist');
const report = {
  browser: null,
  checks: [],
  errors: [],
  consoleErrors: [],
  failedRequests: [],
  externalRequests: [],
  dialogs: [],
  limitations: [
    'External repository links are inspected without visiting or executing third-party content.',
  ],
};
const mark = (name, details = {}) => {
  report.checks.push({ name, ...details });
  console.log('PASS', name);
};
const fixtureServer = createServer(async (req, res) => {
  try {
    const request = new URL(req.url, fixtureOrigin);
    if (!request.pathname.startsWith(`${base}/`)) throw new Error('base');
    const relative = decodeURIComponent(
      request.pathname.slice(base.length + 1),
    );
    const file = path.resolve(
      fixtureRoot,
      relative + (request.pathname.endsWith('/') ? 'index.html' : ''),
    );
    if (!file.startsWith(`${fixtureRoot}/`)) throw new Error('path');
    const bytes = await readFile(file);
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.svg': 'image/svg+xml',
        '.txt': 'text/plain',
      }[path.extname(file)] || 'application/octet-stream',
    );
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve, reject) => {
  fixtureServer.once('error', reject);
  fixtureServer.listen(4356, '127.0.0.1', resolve);
});
const browser = await chromium.launch({ headless: true });
report.browser = browser.version();
async function pageFor(width, extra = {}) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    reducedMotion: 'reduce',
    ...extra,
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
    if ([origin, fixtureOrigin].includes(new URL(route.request().url()).origin))
      return route.continue();
    report.externalRequests.push(route.request().url());
    return route.abort();
  });
  await page.addInitScript(() => {
    window.__qaAnimationRequests = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      window.__qaAnimationRequests += 1;
      return raf(callback);
    };
  });
  return page;
}
const panels = (page) => page.locator('[data-timeline-panel]');
const selected = (page) => page.locator('[data-timeline-panel]:not([hidden])');
async function selectedId(page) {
  assert.equal(await selected(page).count(), 1);
  return selected(page).getAttribute('data-timeline-panel');
}
async function waitSelected(page, id) {
  await page.waitForFunction((id) => {
    const visible = [
      ...document.querySelectorAll('[data-timeline-panel]'),
    ].filter((panel) => !panel.hidden);
    return visible.length === 1 && visible[0].dataset.timelinePanel === id;
  }, id);
}
async function revealIndex(page) {
  const picker = page.locator('[data-timeline-picker]');
  if (
    (await picker.count()) &&
    !(await picker.evaluate((element) => element.open))
  )
    await picker.locator('summary').click();
}
async function choose(page, id, keyboard = false) {
  await revealIndex(page);
  const link = page.locator(
    `[data-timeline-index][data-timeline-choice="${id}"]`,
  );
  if (keyboard) {
    await link.focus();
    await page.keyboard.press('Enter');
  } else await link.click();
  await waitSelected(page, id);
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    `record-${id}`,
  );
}
async function activeIndexVisible(page) {
  // The native details toggle event is queued after its click. Observe the
  // resulting position rather than racing that event immediately after click.
  await page
    .waitForFunction(
      () => {
        const scroll = document.querySelector('[data-timeline-scroll]');
        const active = document.querySelector(
          '[data-timeline-index][aria-current="true"]',
        );
        if (!scroll || !active) return false;
        const area = scroll.getBoundingClientRect();
        const row = active.getBoundingClientRect();
        return (
          row.top >= area.top - 1 &&
          row.bottom <= area.top + scroll.clientHeight + 1
        );
      },
      null,
      { timeout: 2000 },
    )
    .catch(() => {});
  const geometry = await page.evaluate(() => {
    const scroll = document.querySelector('[data-timeline-scroll]');
    const active = document.querySelector(
      '[data-timeline-index][aria-current="true"]',
    );
    const viewport = scroll.getBoundingClientRect();
    const selected = active.getBoundingClientRect();
    return {
      pageScrollY: scrollY,
      top: selected.top - viewport.top,
      bottom: selected.bottom - viewport.top,
      absoluteTop: selected.top,
      absoluteBottom: selected.bottom,
      viewportHeight: innerHeight,
      height: scroll.clientHeight,
      scrollTop: scroll.scrollTop,
      id: active.dataset.timelineChoice,
    };
  });
  assert.ok(geometry.top >= -1, JSON.stringify(geometry));
  assert.ok(geometry.bottom <= geometry.height + 1, JSON.stringify(geometry));
  return geometry;
}
async function inventory(page) {
  assert.deepEqual(
    await panels(page).evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.timelinePanel),
    ),
    ids,
  );
  assert.deepEqual(
    await page
      .locator('[data-timeline-index]')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.timelineChoice)),
    ids,
  );
  for (const entry of entries) {
    const panel = page.locator(`[data-timeline-panel="${entry.id}"]`);
    assert.equal(await panel.getAttribute('id'), `record-${entry.id}`);
    assert.equal(await panel.getAttribute('tabindex'), '-1');
    assert.ok((await panel.locator('h2').textContent()).includes(entry.title));
    const dates = await panel
      .locator('time[datetime]')
      .evaluateAll((nodes) => nodes.map((node) => node.dateTime));
    assert.ok(
      dates.some((value) => value.slice(0, 10) === entry.day),
      `${entry.id}: commit day`,
    );
    assert.match(await panel.textContent(), /本人|制作日/);
    assert.ok(await panel.locator(`a[href="${entry.commitURL}"]`).count());
  }
  const july = entries.filter((entry) => entry.day === '2026-07-29');
  assert.deepEqual(
    july.map((entry) => entry.id),
    ['de10-nano-riscv-invader', 'pong-study-raylib', 'typeandsummon'],
  );
  assert.equal(entries.filter((entry) => entry.day === '2026-09-06').length, 2);
}
async function checkLinks(page) {
  const links = await page.locator('a[href]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      href: node.href,
      raw: node.getAttribute('href'),
      target: node.target,
      rel: node.rel,
    })),
  );
  const localPaths = new Set();
  for (const link of links) {
    const target = new URL(link.href);
    assert.ok(!target.username && !target.password);
    if (target.origin !== origin && target.origin !== fixtureOrigin) {
      assert.equal(target.protocol, 'https:');
      assert.ok(expected.allowedExternal.includes(target.href), target.href);
      if (link.target === '_blank')
        assert.ok(link.rel.split(/\s+/).includes('noopener'));
    } else {
      assert.ok(target.pathname.startsWith(`${base}/`), link.raw);
      localPaths.add(`${target.origin}${target.pathname}${target.search}`);
      if (target.pathname === new URL(page.url()).pathname && target.hash) {
        const id = decodeURIComponent(target.hash.slice(1));
        assert.ok(await page.locator(`[id="${id}"]`).count(), id);
      }
    }
  }
  for (const local of localPaths)
    assert.equal((await page.request.get(local)).status(), 200, local);
  return { anchors: links.length, localTargets: localPaths.size };
}

try {
  for (const width of [1280, 375, 320]) {
    const page = await pageFor(width, {
      isMobile: width < 600,
      hasTouch: width < 600,
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-timeline-enhanced="true"]');
    await inventory(page);
    assert.equal(await selectedId(page), 'glyph-matter');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      width,
    );
    assert.match(await selected(page).textContent(), /未入力/);
    const initialScroll = await page.evaluate(() => scrollY);
    assert.equal(initialScroll, 0);
    const initialIndex = width >= 900 ? await activeIndexVisible(page) : null;
    if (initialIndex) {
      assert.ok(initialIndex.absoluteTop >= 0);
      assert.ok(initialIndex.absoluteBottom <= initialIndex.viewportHeight);
    }
    await page.screenshot({
      path: path.join(out, `timeline-${width}-initial.png`),
      fullPage: true,
    });
    const before = await page.evaluate(() => ({
      animations: document
        .getAnimations()
        .filter((animation) => animation.playState === 'running').length,
      raf: window.__qaAnimationRequests,
      markup: document.querySelector('[data-timeline-study]').innerHTML,
    }));
    await page.waitForTimeout(350);
    const after = await page.evaluate(() => ({
      animations: document
        .getAnimations()
        .filter((animation) => animation.playState === 'running').length,
      raf: window.__qaAnimationRequests,
      markup: document.querySelector('[data-timeline-study]').innerHTML,
    }));
    assert.equal(before.animations, 0);
    assert.deepEqual(after, before);
    await revealIndex(page);
    await activeIndexVisible(page);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: path.join(out, `timeline-${width}-index.png`),
      fullPage: true,
    });
    if (width < 900) {
      const summary = page.locator('[data-timeline-picker] summary');
      await summary.focus();
      await page.keyboard.press('Tab');
      const tabTarget = await page.evaluate(
        () => document.activeElement.dataset.timelineChoice,
      );
      assert.equal(tabTarget, ids[0]);
      await page.keyboard.press('Enter');
      await waitSelected(page, ids[0]);
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        `record-${ids[0]}`,
      );
    } else await choose(page, ids[0], true);
    const oldest = selected(page);
    assert.deepEqual(
      await oldest
        .locator('a[data-timeline-choice]')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.dataset.timelineChoice),
        ),
      [ids[1]],
    );
    const next = oldest.locator(`a[data-timeline-choice="${ids[1]}"]`);
    await next.focus();
    await page.keyboard.press('Enter');
    await waitSelected(page, ids[1]);
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      `record-${ids[1]}`,
    );
    await choose(page, ids.at(-1));
    assert.deepEqual(
      await selected(page)
        .locator('a[data-timeline-choice]')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.dataset.timelineChoice),
        ),
      [ids.at(-2)],
    );
    await revealIndex(page);
    assert.equal((await activeIndexVisible(page)).id, ids.at(-1));
    const links = width === 1280 ? await checkLinks(page) : {};
    mark(`layout-keyboard-order-boundary-${width}`, {
      count: 9,
      latest: 'glyph-matter',
      july29: 3,
      september6: 2,
      noOverflow: true,
      reducedMotion: true,
      noIdleAnimation: true,
      initialPageScrollY: initialScroll,
      initialIndex,
      ...links,
    });
    await page.close();
  }
  const history = await pageFor(1280);
  await history.goto(`${url}#record-${ids[2]}`, { waitUntil: 'networkidle' });
  await waitSelected(history, ids[2]);
  await choose(history, ids[4]);
  await choose(history, ids[6]);
  await history.goBack();
  await waitSelected(history, ids[4]);
  assert.equal((await activeIndexVisible(history)).id, ids[4]);
  await history.goBack();
  await waitSelected(history, ids[2]);
  assert.equal((await activeIndexVisible(history)).id, ids[2]);
  await history.goForward();
  await waitSelected(history, ids[4]);
  assert.equal((await activeIndexVisible(history)).id, ids[4]);
  for (const invalid of ['#record-unknown', '#record-%E0%A4%A', '#unrelated']) {
    await history.evaluate((hash) => {
      location.hash = hash;
    }, invalid);
    await history.waitForTimeout(100);
    assert.equal(await selectedId(history), ids[4]);
  }
  // A fresh navigation tests initialization; a same-document goto only fires
  // hashchange and correctly retains the currently readable record.
  await history.goto('about:blank');
  await history.goto(`${url}#record-%E0%A4%A`, { waitUntil: 'networkidle' });
  await waitSelected(history, 'glyph-matter');
  await history.goto(url, { waitUntil: 'networkidle' });
  await choose(history, ids[0]);
  await history.goBack();
  await waitSelected(history, 'glyph-matter');
  mark('deep-link-back-forward-empty-hash-and-invalid-hash-safe');
  await history.close();

  const nojs = await pageFor(375, { javaScriptEnabled: false });
  await nojs.goto(url, { waitUntil: 'networkidle' });
  await inventory(nojs);
  assert.equal(await selected(nojs).count(), 9);
  for (const panel of await panels(nojs).all())
    assert.equal(await panel.isVisible(), true);
  assert.equal(
    await nojs.evaluate(() => document.documentElement.scrollWidth),
    375,
  );
  await nojs.screenshot({
    path: path.join(out, 'timeline-375-nojs-all-nine.png'),
    fullPage: true,
  });
  mark('no-javascript-all-nine-records-readable');
  await nojs.close();

  const fixture = await pageFor(375);
  await fixture.goto(`${fixtureOrigin}${base}/qa/timeline-empty/`, {
    waitUntil: 'networkidle',
  });
  assert.match(
    await fixture.locator('[data-qa-fixture]').textContent(),
    /合成検証/,
  );
  assert.equal(await panels(fixture).count(), 0);
  assert.equal(await fixture.locator('[data-timeline-choice]').count(), 0);
  assert.match(
    await fixture.locator('[data-timeline-study]').textContent(),
    /まだ|ありません|記録が/,
  );
  assert.equal(
    await fixture.evaluate(() => document.documentElement.scrollWidth),
    375,
  );
  await fixture.screenshot({
    path: path.join(out, 'synthetic-empty.png'),
    fullPage: true,
  });
  mark('isolated-empty-fixture-does-not-invent-records');
  await fixture.goto(`${fixtureOrigin}${base}/qa/timeline-owner/`, {
    waitUntil: 'networkidle',
  });
  assert.match(
    await fixture.locator('[data-qa-fixture]').textContent(),
    /実際の本人の制作日ではありません/,
  );
  await inventory(fixture);
  await waitSelected(fixture, 'glyph-matter');
  const glyph = selected(fixture);
  const dates = await glyph
    .locator('time[datetime]')
    .evaluateAll((nodes) => nodes.map((node) => node.dateTime));
  assert.ok(dates.includes('2024-02-29'));
  assert.ok(dates.some((value) => value.slice(0, 10) === '2026-10-03'));
  await fixture.screenshot({
    path: path.join(out, 'synthetic-owner-date.png'),
    fullPage: true,
  });
  mark('isolated-owner-date-fixture-separate-from-commit-order', {
    syntheticDate: '2024-02-29',
    publicCommitDay: '2026-10-03',
    orderUnchanged: true,
  });
  await fixture.close();

  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.consoleErrors, []);
  assert.deepEqual(report.failedRequests, []);
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.dialogs, []);
} catch (error) {
  report.failure = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  throw error;
} finally {
  await writeFile(
    path.join(out, 'browser-evidence.json'),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  await new Promise((resolve) => fixtureServer.close(resolve));
}
