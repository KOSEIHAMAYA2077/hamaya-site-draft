import { chromium } from '/tmp/hamaya-browser-qa/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
const port = process.argv[2] || '4350';
const label = process.argv[3] || 'before';
const origin = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ headless: true });
const results = {
  label,
  browser: browser.version(),
  viewport: { width: 1280, height: 900 },
  bytes: 'HTTP response body bytes, no compression, fresh context',
  pages: {},
};
const init = () => {
  const meter = (window.__meter = { raf: 0, canvas: 0, mutations: 0 });
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = (callback) =>
    raf.call(window, (time) => {
      meter.raf++;
      callback(time);
    });
  const fill = CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect = function (...args) {
    meter.canvas++;
    return fill.apply(this, args);
  };
  new MutationObserver((entries) => {
    meter.mutations += entries.length;
  }).observe(document, {
    subtree: true,
    attributes: true,
    childList: true,
    characterData: true,
  });
};
const read = (frame) =>
  frame.evaluate(() => ({
    ...window.__meter,
    frameCount: Number(document.body.dataset.frameCount || 0),
    running: document.body.dataset.running,
    hidden: document.hidden,
  }));
const sample = async (frame, ms = 1000) => {
  const a = await read(frame);
  await new Promise((r) => setTimeout(r, ms));
  const b = await read(frame);
  return {
    ms,
    raf: b.raf - a.raf,
    canvas: b.canvas - a.canvas,
    mutations: b.mutations - a.mutations,
    modelFrames: b.frameCount - a.frameCount,
    running: b.running,
    hidden: b.hidden,
  };
};
try {
  for (const route of ['compare/focus/', 'compare/experiments/']) {
    const context = await browser.newContext({ viewport: results.viewport });
    await context.route('**/*', (r) =>
      r.request().url().startsWith(origin) ||
      r.request().url().startsWith('about:')
        ? r.continue()
        : r.abort(),
    );
    await context.addInitScript(init);
    const page = await context.newPage();
    const responses = [];
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (response) => responses.push(response));
    await page.goto(`${origin}/hamaya-site-draft/${route}`);
    await page.waitForTimeout(400);
    const resources = await Promise.all(
      responses.map(async (r) => ({
        url: r.url().replace(origin, ''),
        type: r.request().resourceType(),
        bytes: (await r.body()).length,
      })),
    );
    const data = (results.pages[route] = {
      resources,
      totalBodyBytes: resources.reduce((s, r) => s + r.bytes, 0),
      errors,
    });
    data.inline = await page.evaluate(() => ({
      scripts: [...document.scripts]
        .filter((s) => !s.src)
        .map((s) => new TextEncoder().encode(s.textContent).length),
      documents: [...document.querySelectorAll('[data-document]')].map(
        (el) => new TextEncoder().encode(el.dataset.document).length,
      ),
      images: [...document.images].map((el) => ({
        src: el.getAttribute('src'),
        width: el.width,
        height: el.height,
        naturalWidth: el.naturalWidth,
        naturalHeight: el.naturalHeight,
        loading: el.loading,
      })),
    }));
    data.idle = await sample(page);
    if (route.includes('experiments')) {
      const card = page.locator('[data-experiment="motion"]');
      await card.locator('[data-open]').click();
      await page.waitForTimeout(500);
      const frame = page.frames().find((f) => f !== page.mainFrame());
      await frame.locator('canvas').scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      data.openStopped = await sample(frame);
      await frame.locator('#replay').click();
      data.replay = await sample(frame);
      await frame.locator('#pause').click();
      await page.waitForTimeout(150);
      data.paused = await sample(frame);
      await frame.locator('canvas').focus();
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(300);
      data.offscreenBeforeKey = await sample(frame, 300);
      data.frameBounds = await card.locator('iframe').boundingBox();
      await page.keyboard.down('ArrowRight');
      data.offscreenAfterKey = await sample(frame);
      await page.keyboard.up('ArrowRight');
      await card.locator('[data-open]').click();
      data.closedFrames = page.frames().length - 1;
      // Deliberate local Canvas failure; tests the existing static fallback.
      await context.addInitScript(() => {
        HTMLCanvasElement.prototype.getContext = () => null;
      });
      await page.reload();
      await card.locator('[data-open]').click();
      await page.waitForTimeout(4500);
      data.failedCanvas = {
        staticVisible: await card.locator('[data-preview]').isVisible(),
        status: await card.locator('[data-status]').innerText(),
        frames: page.frames().length - 1,
      };
    }
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  new URL(`./measure-${label}.json`, import.meta.url),
  JSON.stringify(results, null, 2) + '\n',
);
console.log(JSON.stringify(results, null, 2));
