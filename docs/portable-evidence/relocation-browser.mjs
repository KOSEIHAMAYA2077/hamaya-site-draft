import { chromium } from '/tmp/hamaya-browser-qa/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const qa = path.dirname(new URL(import.meta.url).pathname);
const browser = await chromium.launch({ headless: true });
const checks = [];
const external = [];
const errors = [];
const broken = [];
const checkedLinks = new Set();
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  context.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4365/'))
      external.push(request.url());
  });
  context.on('response', (response) => {
    if (response.status() >= 400)
      broken.push([response.status(), response.url()]);
  });
  for (const base of ['/portable-first', '/moved/nested']) {
    for (const [route, expectedImages] of [
      ['notes/portable-writer-note/', 1],
      ['works/portable-writer-work/', 2],
      ['notes/portable-maker-note/', 1],
    ]) {
      const url = `http://127.0.0.1:4365${base}/${route}`;
      const response = await page.goto(url);
      assert.equal(response.status(), 200);
      assert.match(await page.locator('h1').innerText(), /持ち運びの検証用/);
      const images = page.locator('main img');
      assert.equal(await images.count(), expectedImages);
      for (let index = 0; index < expectedImages; index++) {
        const image = images.nth(index);
        await image.scrollIntoViewIfNeeded();
        await image.evaluate((element) => element.decode());
        const info = await image.evaluate((element) => ({
          width: element.naturalWidth,
          height: element.naturalHeight,
          alt: element.alt,
          src: new URL(element.src).pathname,
        }));
        assert.equal(info.width, 240);
        assert.equal(info.height, 160);
        assert.ok(info.alt.length > 0);
        assert.ok(info.src.startsWith(`${base}/images/`));
      }
      if (route.includes('maker')) {
        assert.match(
          await page.locator('main').innerText(),
          /日本語と絵文字 🧪/,
        );
        assert.match(
          await page.locator('main').innerText(),
          /!\[これは文字\]\(\.\/literal.png\)/,
        );
      } else {
        assert.match(
          await page.locator('main').innerText(),
          /日本語と絵文字 🛰️/,
        );
        assert.match(
          await page.locator('pre').first().innerText(),
          /const message/,
        );
      }
      const links = await page.locator('a[href]').evaluateAll((elements) =>
        elements.map((element) => ({
          href: element.href,
          raw: element.getAttribute('href'),
        })),
      );
      for (const { href, raw } of links) {
        const link = new URL(href);
        if (link.origin !== 'http://127.0.0.1:4365') continue;
        assert.ok(link.pathname.startsWith(`${base}/`), raw);
        if (link.hash) {
          if (link.pathname === new URL(url).pathname)
            assert.equal(
              await page
                .locator(
                  `[id=${JSON.stringify(decodeURIComponent(link.hash.slice(1)))}]`,
                )
                .count(),
              1,
            );
        }
        link.hash = '';
        if (checkedLinks.has(link.href)) continue;
        checkedLinks.add(link.href);
        assert.equal(
          (await context.request.get(link.href)).status(),
          200,
          link.href,
        );
      }
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      if (base === '/moved/nested' && route.includes('writer-note')) {
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({
          path: path.join(qa, 'relocated-note-desktop.png'),
          fullPage: true,
        });
      }
      if (base === '/moved/nested' && route.includes('maker')) {
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({
          path: path.join(qa, 'relocated-maker-desktop.png'),
          fullPage: true,
        });
      }
      checks.push({
        base,
        route,
        images: expectedImages,
        decoded: true,
        links: 'HTTP 200; in base',
      });
    }
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(
    'http://127.0.0.1:4365/moved/nested/works/portable-writer-work/',
  );
  await page
    .locator('main img')
    .first()
    .evaluate((element) => element.decode());
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.keyboard.press('Tab');
  assert.match(await page.locator(':focus').innerText(), /本文/);
  await page.keyboard.press('Enter');
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    'main-content',
  );
  assert.equal(
    await page.evaluate(
      () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
    true,
  );
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: path.join(qa, 'relocated-work-mobile.png'),
    fullPage: true,
  });
  checks.push({
    mobile: 375,
    keyboardSkip: true,
    reducedMotion: true,
    noOverflow: true,
  });
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(broken, []);
  await writeFile(
    path.join(qa, 'relocation-browser.json'),
    JSON.stringify(
      { checks, checkedLinks: [...checkedLinks], external, errors, broken },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      checks: checks.length,
      checkedLinks: checkedLinks.size,
      external,
      errors,
      broken,
    }),
  );
} finally {
  await browser.close();
}
