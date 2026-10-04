import { chromium } from '/tmp/hamaya-browser-qa/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true });
const result = {
  capture: '1280x900, await fonts.ready then 500ms; static viewport',
  covers: {},
};
try {
  for (const [label, port, fixturePort] of [
    ['before', 4350, 4352],
    ['after', 4351, 4353],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await page.goto(
      `http://127.0.0.1:${port}/hamaya-site-draft/compare/focus/`,
    );
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    await page.screenshot({
      path: new URL(`./focus-${label}.png`, import.meta.url).pathname,
    });
    await context.close();
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const p = await ctx.newPage();
    let release;
    const hold = new Promise((r) => (release = r));
    await ctx.route('**/*', async (route) => {
      if (route.request().resourceType() === 'image') await hold;
      return route.continue();
    });
    await p.goto(
      `http://127.0.0.1:${fixturePort}/hamaya-site-draft/works/import-typeandsummon/`,
      { waitUntil: 'domcontentloaded' },
    );
    const cover = p.locator('.work-cover');
    const measure = () =>
      cover.evaluate((el) => ({
        attrWidth: el.getAttribute('width'),
        attrHeight: el.getAttribute('height'),
        naturalWidth: el.naturalWidth,
        naturalHeight: el.naturalHeight,
        rectWidth: el.getBoundingClientRect().width,
        rectHeight: el.getBoundingClientRect().height,
      }));
    const before = await measure();
    release();
    await cover.evaluate((el) => el.decode());
    const after = await measure();
    result.covers[label] = { before, after };
    if (label === 'after') {
      await p.goto(
        `http://127.0.0.1:${fixturePort}/hamaya-site-draft/notes/fixture-note-001/`,
      );
      await p.locator('.prose img').first().scrollIntoViewIfNeeded();
      await p
        .locator('.prose img')
        .first()
        .evaluate((el) => el.decode());
      await p.screenshot({
        path: new URL('./fixture-article-after.png', import.meta.url).pathname,
      });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  new URL('./visual-and-cover.json', import.meta.url),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(JSON.stringify(result, null, 2));
