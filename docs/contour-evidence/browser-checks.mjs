import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/tmp/hamaya-browser-qa/node_modules/playwright/index.mjs';
const out = path.dirname(fileURLToPath(import.meta.url));
const url = 'http://127.0.0.1:4366/hamaya-site-draft/';
const baselineUrl = 'http://127.0.0.1:4360/hamaya-site-draft/';
const baseline = JSON.parse(
  await readFile(path.join(out, 'baseline-browser.json'), 'utf8'),
);
const nojsOnly = process.argv.includes('--nojs-only');
const report = {
  scope:
    'Disposable contexts; visual-comparison interaction QA with no source, owner-content or server edits.',
  checks: [],
  geometries: [],
  screenshots: [],
  requests: [],
  external: [],
  pageErrors: [],
  consoleErrors: [],
  failure: null,
};
const mark = (name, data = {}) => {
  report.checks.push({ name, ...data });
  console.log('PASS', name);
};
const browser = await chromium.launch({ headless: true });
report.browser = browser.version();
const contexts = new Set();
async function context(width, options = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height: 812 },
    locale: 'ja-JP',
    reducedMotion: 'no-preference',
    ...options,
  });
  contexts.add(ctx);
  await ctx.addInitScript(() => {
    window.__qaRafCalls = 0;
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = function (callback) {
      window.__qaRafCalls += 1;
      return raf.call(window, callback);
    };
  });
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const origin = new URL(req.url()).origin;
    report.requests.push({ url: req.url(), method: req.method() });
    if (
      origin === new URL(url).origin ||
      origin === new URL(baselineUrl).origin
    )
      await route.continue();
    else {
      report.external.push(req.url());
      await route.abort();
    }
  });
  ctx.on('page', (page) => {
    page.setDefaultTimeout(10000);
    page.on('pageerror', (error) =>
      report.pageErrors.push({ url: page.url(), message: error.message }),
    );
    page.on('console', (event) => {
      if (event.type() === 'error')
        report.consoleErrors.push({ url: page.url(), message: event.text() });
    });
    page.on('dialog', (dialog) => dialog.dismiss());
  });
  return ctx;
}
async function go(page, destination = url, enhanced = true) {
  const response = await page.goto(destination, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  if (enhanced) await page.locator('[data-focus-enhanced]').waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function snapshot(page) {
  return page.evaluate(() => ({
    textSet: [
      ...new Set(
        document.body.innerText
          .split(/\n/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ],
    links: Array.from(document.querySelectorAll('a[href]')).map((el) => ({
      text: el.textContent.trim().replace(/\s+/g, ' '),
      href: el.getAttribute('href'),
    })),
    works: Array.from(document.querySelectorAll('[data-focus-panel]')).map(
      (el) => ({
        id: el.dataset.focusPanel,
        text: el.textContent.trim().replace(/\s+/g, ' '),
        links: Array.from(el.querySelectorAll('a[href]')).map((link) => ({
          text: link.textContent.trim().replace(/\s+/g, ' '),
          href: link.getAttribute('href'),
        })),
      }),
    ),
  }));
}
async function geometry(page, label) {
  const data = await page.evaluate(() => {
    const piece = document.querySelector('[data-focus-panel]:not([hidden])');
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const selectors = {
      title: '.focus-title h2',
      body: '.focus-body',
      description: '.focus-description',
      primary: '[data-focus-primary]',
      next: '.focus-next',
    };
    const bounds = Object.fromEntries(
      Object.entries(selectors).map(([key, selector]) => [
        key,
        rect(piece.querySelector(selector)),
      ]),
    );
    return {
      width: innerWidth,
      height: innerHeight,
      scrollY,
      htmlWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      id: piece.dataset.focusPanel,
      title: piece.querySelector('h2').textContent.trim(),
      bounds,
      art: rect(document.querySelector('[data-focus-scene]')),
    };
  });
  assert.ok(
    data.htmlWidth <= data.width + 1 && data.bodyWidth <= data.width + 1,
    `${label} horizontal overflow`,
  );
  for (const [name, bounds] of Object.entries(data.bounds).filter(
    ([, value]) => value,
  ))
    assert.ok(
      bounds.x >= -1 && bounds.right <= data.width + 1,
      `${label} ${name} out of horizontal bounds`,
    );
  assert.ok(
    data.bounds.body.y >= data.bounds.title.bottom - 1,
    `${label} body overlaps title`,
  );
  report.geometries.push({ label, ...data });
  return data;
}
async function shot(page, name, fullPage = false) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: path.join(out, name), fullPage });
  report.screenshots.push(name);
}
async function picker(page) {
  const summary = page.locator('[data-focus-picker] summary');
  if (!(await page.locator('[data-focus-picker]').evaluate((el) => el.open))) {
    await summary.focus();
    await page.keyboard.press('Enter');
  }
  assert.equal(
    await page.locator('[data-focus-picker]').evaluate((el) => el.open),
    true,
  );
}
async function choose(page, id) {
  await picker(page);
  const link = page.locator(`[data-focus-picker] [data-focus-choice="${id}"]`);
  await link.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (id) => !document.querySelector(`[data-focus-panel="${id}"]`).hidden,
    id,
  );
  assert.equal(
    await page.locator('[data-focus-picker]').evaluate((el) => el.open),
    false,
  );
  assert.equal(
    await page
      .locator('[data-focus-picker] summary')
      .evaluate((el) => el === document.activeElement),
    true,
  );
  assert.equal(new URL(page.url()).hash, `#piece-${id}`);
  assert.equal(
    await page
      .locator(`[data-focus-picker] [data-focus-choice="${id}"]`)
      .getAttribute('aria-current'),
    'true',
  );
}
async function controlsUncovered(page) {
  const controls = page.locator(
    '[data-focus-panel]:not([hidden]) a, [data-focus-picker] summary',
  );
  for (const el of await controls.all()) {
    if (!(await el.isVisible())) continue;
    await el.scrollIntoViewIfNeeded();
    assert.equal(
      await el.evaluate((node) => {
        const r = node.getBoundingClientRect();
        const hit = document.elementFromPoint(
          r.x + Math.min(r.width / 2, 50),
          r.y + r.height / 2,
        );
        return hit === node || node.contains(hit);
      }),
      true,
      `Control occluded: ${await el.innerText()}`,
    );
  }
}
async function close(ctx) {
  await ctx.close();
  contexts.delete(ctx);
}
try {
  // Hidden panels are intentionally included: baseline captures only first visible work text.
  const originalCtx = await context(1280);
  const originalPage = await originalCtx.newPage();
  await go(originalPage, baselineUrl);
  const originalSnapshot = await snapshot(originalPage);
  assert.equal(originalSnapshot.works.length, 6);
  await close(originalCtx);
  report.originalWorkSnapshot = originalSnapshot.works;

  for (const width of nojsOnly ? [] : [1280, 375, 320, 768]) {
    const ctx = await context(width);
    const page = await ctx.newPage();
    await go(page);
    const current = await snapshot(page);
    assert.deepEqual(current.works, originalSnapshot.works);
    assert.deepEqual(
      current.links,
      baseline.results[0].natural.allLinks.map(({ text, href }) => ({
        text,
        href,
      })),
    );
    if (width === 1280 || width === 375) {
      const before = baseline.results.find(
        (result) => result.viewport.width === width,
      );
      assert.deepEqual(
        [...current.textSet].sort(),
        [...before.natural.textSet].sort(),
      );
    }
    const initial = await geometry(page, `${width}-initial`);
    assert.ok(
      initial.bounds.primary.y >= 0 && initial.bounds.primary.bottom <= 812,
      `${width} first primary CTA below viewport`,
    );
    await shot(page, `checked-${width}-initial.png`);
    await picker(page);
    await page.keyboard.press('Escape');
    assert.equal(
      await page.locator('[data-focus-picker]').evaluate((el) => el.open),
      false,
    );
    assert.equal(
      await page
        .locator('[data-focus-picker] summary')
        .evaluate((el) => el === document.activeElement),
      true,
    );
    let longest = initial;
    for (const entry of current.works) {
      await choose(page, entry.id);
      await page.evaluate(() => scrollTo(0, 0));
      const measured = await geometry(page, `${width}-${entry.id}`);
      if (measured.bounds.title.bottom > longest.bounds.title.bottom)
        longest = measured;
      await controlsUncovered(page);
    }
    await choose(page, longest.id);
    await page.evaluate(() => scrollTo(0, 0));
    await shot(page, `checked-${width}-longest.png`);
    const expected = await page
      .locator('[data-focus-panel]:not([hidden]) .focus-next')
      .getAttribute('data-focus-choice');
    await page.locator('[data-focus-panel]:not([hidden]) .focus-next').click();
    assert.equal(
      await page
        .locator('[data-focus-panel]:not([hidden])')
        .getAttribute('data-focus-panel'),
      expected,
    );
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(
      await page
        .locator('[data-focus-panel]:not([hidden])')
        .getAttribute('data-focus-panel'),
      expected,
    );
    assert.equal(new URL(page.url()).hash, `#piece-${expected}`);
    mark(
      `${width}px: unchanged six works/links, keyboard picker/Escape/next/hash reload, contained text and unobstructed controls`,
      {
        initialPrimaryBottom: initial.bounds.primary.bottom,
        longestTitle: longest.title,
        longestTitleBottom: longest.bounds.title.bottom,
      },
    );

    if (width === 1280) {
      const motion = page.locator('[data-focus-motion]');
      await motion.click();
      assert.equal(
        await page.evaluate(() => document.documentElement.dataset.motion),
        'off',
      );
      await choose(page, current.works[1].id);
      const transitionTimes = await page
        .locator('[data-focus-scene] *')
        .evaluateAll((nodes) =>
          nodes.map((node) => getComputedStyle(node).transitionDuration),
        );
      assert.ok(
        transitionTimes.every((value) =>
          value.split(',').every((part) => parseFloat(part) === 0),
        ),
      );
      const rafBefore = await page.evaluate(() => window.__qaRafCalls);
      await page.waitForTimeout(1100);
      const rafAfter = await page.evaluate(() => window.__qaRafCalls);
      assert.equal(rafAfter, rafBefore);
      mark(
        'Motion OFF gives zero decorative transition; no requestAnimationFrame calls added while idle for 1.1s',
        { rafBefore, rafAfter },
      );

      await page
        .locator(
          '[data-focus-panel]:not([hidden]) .focus-secondary a[href*="write/"]',
        )
        .click();
      await page.waitForURL('**/write/?kind=note');
      await page.locator('#write-title').fill('輪郭案の合成入力');
      await page
        .locator('#write-body')
        .fill('比較QAの合成入力。本人の記録ではありません。');
      const before = await page.locator('#write-body').inputValue();
      await page.locator('[data-reader-button]').click();
      await page.locator('[data-edit-button]').click();
      assert.equal(await page.locator('#write-body').inputValue(), before);
      const popupEvent = ctx.waitForEvent('page');
      await page.locator('[data-maker-writer-entry]').click();
      const popup = await popupEvent;
      await popup.waitForLoadState('networkidle');
      assert.match(popup.url(), /\/write\/maker-field\/$/);
      await popup.close();
      assert.equal(await page.locator('#write-body').inputValue(), before);
      const dialog = page.waitForEvent('dialog');
      await page
        .locator('[data-workroom-nav] a')
        .first()
        .click({ noWaitAfter: true });
      assert.equal((await dialog).type(), 'beforeunload');
      assert.equal(await page.locator('#write-body').inputValue(), before);
      mark(
        'Actual writer link opens; read/edit, Maker separate tab and canceled unsaved navigation preserve synthetic input',
      );
    }
    await close(ctx);
  }

  if (!nojsOnly) {
    const reduceCtx = await context(375, { reducedMotion: 'reduce' });
    const reducedPage = await reduceCtx.newPage();
    await go(reducedPage);
    assert.equal(
      await reducedPage.locator('[data-focus-motion]').isVisible(),
      false,
    );
    await choose(reducedPage, originalSnapshot.works[3].id);
    const reducedTimes = await reducedPage
      .locator('[data-focus-scene] *')
      .evaluateAll((nodes) =>
        nodes.map((node) => getComputedStyle(node).transitionDuration),
      );
    assert.ok(
      reducedTimes.every((value) =>
        value.split(',').every((part) => parseFloat(part) === 0),
      ),
    );
    await shot(reducedPage, 'checked-375-reduced.png');
    mark(
      'Reduced-motion keeps selection working immediately with zero decorative transition',
    );
    await close(reduceCtx);
  }

  for (const width of [1280, 375]) {
    const ctx = await context(width, { javaScriptEnabled: false });
    const page = await ctx.newPage();
    await go(page, url, false);
    assert.equal(await page.locator('[data-focus-panel]').count(), 6);
    for (const piece of await page.locator('[data-focus-panel]').all())
      assert.equal(await piece.isVisible(), true);
    assert.equal(await page.locator('[data-focus-enhanced]').count(), 0);
    const nojsSnapshot = await snapshot(page);
    assert.deepEqual(nojsSnapshot.works, originalSnapshot.works);
    const size = await page.evaluate(() => ({
      viewport: innerWidth,
      html: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    assert.ok(
      size.html <= width + 1 && size.body <= width + 1,
      `${width} JS-off overflow`,
    );
    const first = await geometry(page, `${width}-nojs-initial`);
    assert.ok(
      first.bounds.primary.y >= 0 && first.bounds.primary.bottom <= 812,
      `${width} JS-off primary CTA below viewport`,
    );
    await shot(page, `checked-${width}-nojs-first.png`);
    const anchors = [];
    for (const work of originalSnapshot.works) {
      if (
        !(await page.locator('[data-focus-picker]').evaluate((el) => el.open))
      )
        await page.locator('[data-focus-picker] summary').click();
      await page
        .locator(`[data-focus-picker] [data-focus-choice="${work.id}"]`)
        .click();
      assert.equal(new URL(page.url()).hash, `#piece-${work.id}`);
      const title = page.locator(`[data-focus-panel="${work.id}"] h2`);
      assert.equal(await title.isVisible(), true);
      // The site's native smooth scrolling also applies when JavaScript is off.
      // Host-side wait lets that built-in browser action finish without injecting RAF.
      await page.waitForTimeout(900);
      const box = await title.boundingBox();
      anchors.push({
        id: work.id,
        title: box,
        hash: new URL(page.url()).hash,
        scrollY: await page.evaluate(() => scrollY),
      });
      assert.ok(
        box.y >= -1 && box.y < 812,
        `native hash scroll reaches ${work.id}`,
      );
    }
    report.geometries.push({
      label: `${width}-nojs-all-native-anchors`,
      anchors,
    });
    mark(
      `${width}px JavaScript OFF: first CTA visible, all six works/links remain and all native anchors scroll correctly`,
      { ...size, primaryBottom: first.bounds.primary.bottom },
    );
    await close(ctx);
  }
  assert.deepEqual(report.external, []);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.consoleErrors, []);
  assert.ok(report.requests.every((request) => request.method === 'GET'));
  mark(
    'No external requests, content transmission, console errors or page errors',
  );
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const ctx of contexts) await ctx.close();
  await browser.close();
  report.disposableBrowserClosed = true;
  await writeFile(
    path.join(
      out,
      nojsOnly ? 'browser-checks-nojs.json' : 'browser-checks.json',
    ),
    JSON.stringify(report, null, 2),
  );
}
