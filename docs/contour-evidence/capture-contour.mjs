import { chromium } from '/tmp/hamaya-browser-qa/node_modules/playwright/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
const output =
  '/Users/hamayakousei/Documents/Codex/2026-10-04/task-3/.dot/contour-qa';
const url = 'http://127.0.0.1:4366/hamaya-site-draft/';
const report = {
  capturedAtUtc: new Date().toISOString(),
  url,
  scope:
    'Fresh disposable browser contexts. No user browser/profile, storage preset, source/build or server changes. Existing motion control clicked for stable captures only.',
  results: [],
};
const browser = await chromium.launch({ headless: true });
report.browserVersion = browser.version();
try {
  for (const [label, width, height] of [
    ['desktop', 1280, 812],
    ['mobile', 375, 812],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      reducedMotion: 'no-preference',
      locale: 'ja-JP',
    });
    const page = await context.newPage();
    const errors = [];
    const failedRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('requestfailed', (request) =>
      failedRequests.push({
        url: request.url(),
        error: request.failure()?.errorText,
      }),
    );
    const item = {
      label,
      viewport: { width, height },
      reducedMotion: 'no-preference',
      storagePreset: false,
    };
    try {
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 15000,
      });
      item.status = response?.status();
      await page.locator('[data-focus-enhanced]').waitFor({ timeout: 10000 });
      await page.evaluate(() => document.fonts.ready);
      item.storageInitial = await page.evaluate(() => ({
        local: Object.fromEntries(Object.entries(localStorage)),
        session: Object.fromEntries(Object.entries(sessionStorage)),
      }));
      if (
        Object.keys(item.storageInitial.local).length ||
        Object.keys(item.storageInitial.session).length
      )
        throw new Error('Unexpected initial storage in fresh context');
      const measure = async () =>
        page.evaluate(() => {
          const selectors = {
            header: '.site-header',
            hero: '[data-focus-study]',
            heroStage: '.focus-stage',
            selection: '.focus-selection',
            picker: '[data-focus-picker]',
            selectedTitle: '[data-focus-panel]:not([hidden]) .focus-title',
            primaryCta: '[data-focus-panel]:not([hidden]) [data-focus-primary]',
            art: '[data-focus-scene]',
            main: 'main',
            motion: '[data-focus-motion]',
          };
          const rect = (el) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return {
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
              right: r.right,
              bottom: r.bottom,
              visible: el.checkVisibility({
                checkOpacity: true,
                checkVisibilityCSS: true,
              }),
              withinFirstViewport:
                r.top >= 0 &&
                r.left >= 0 &&
                r.bottom <= innerHeight &&
                r.right <= innerWidth,
              fontSize: s.fontSize,
              lineHeight: s.lineHeight,
              text: el.innerText?.trim().replace(/\s+/g, ' ') || '',
              href: el.getAttribute('href'),
            };
          };
          const allLinks = [...document.querySelectorAll('a[href]')].map(
            (el) => ({
              text: el.textContent.trim().replace(/\s+/g, ' '),
              href: el.getAttribute('href'),
              visible: el.checkVisibility({
                checkOpacity: true,
                checkVisibilityCSS: true,
              }),
              bounds: rect(el),
            }),
          );
          return {
            title: document.title,
            url: location.href,
            scroll: { x: scrollX, y: scrollY },
            viewport: { width: innerWidth, height: innerHeight },
            documentWidth: document.documentElement.scrollWidth,
            horizontalOverflow:
              document.documentElement.scrollWidth > innerWidth,
            motion: document.documentElement.dataset.motion,
            activeWork: document
              .querySelector('[data-focus-panel]:not([hidden])')
              ?.getAttribute('data-focus-panel'),
            bounds: Object.fromEntries(
              Object.entries(selectors).map(([key, value]) => [
                key,
                rect(document.querySelector(value)),
              ]),
            ),
            visibleText: document.body.innerText.trim(),
            textSet: [
              ...new Set(
                document.body.innerText
                  .split(/\n/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              ),
            ],
            allLinks,
            visibleLinks: allLinks.filter((link) => link.visible),
          };
        });
      item.natural = await measure();
      await page.screenshot({
        path: `${output}/contour-${label}-motion.png`,
        fullPage: false,
      });
      const stop = page.locator('[data-focus-motion]');
      await stop.click();
      await page.waitForFunction(
        () => document.documentElement.dataset.motion === 'off',
      );
      await page.mouse.move(0, 0);
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(250);
      item.stopped = await measure();
      item.storageAfterStop = await page.evaluate(() => ({
        local: Object.fromEntries(Object.entries(localStorage)),
        session: Object.fromEntries(Object.entries(sessionStorage)),
      }));
      await page.screenshot({
        path: `${output}/contour-${label}.png`,
        fullPage: false,
      });
      item.screenshots = {
        natural: `contour-${label}-motion.png`,
        stopped: `contour-${label}.png`,
      };
      item.errors = errors;
      item.failedRequests = failedRequests;
      item.success =
        item.status === 200 &&
        !errors.length &&
        !failedRequests.length &&
        !item.stopped.horizontalOverflow;
    } catch (error) {
      item.error = String(error);
      item.success = false;
    }
    report.results.push(item);
    await context.close();
  }
} finally {
  await browser.close();
  report.disposableBrowserClosed = true;
}
await writeFile(
  `${output}/contour-browser.json`,
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    report.results.map((r) => ({
      label: r.label,
      status: r.status,
      success: r.success,
      error: r.error,
      storageInitial: r.storageInitial,
      activeWork: r.stopped?.activeWork,
      primaryCta: r.stopped?.bounds?.primaryCta,
      selection: r.stopped?.bounds?.selection,
    })),
    null,
    2,
  ),
);
if (report.results.some((r) => !r.success)) process.exitCode = 1;
