import { chromium } from '/tmp/hamaya-browser-qa/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
const label = process.argv[3] || 'before',
  origin = `http://127.0.0.1:${process.argv[2] || 4350}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();
const data = { label };
try {
  await page.goto(`${origin}/hamaya-site-draft/compare/focus/`);
  await page.screenshot({
    path: new URL(`./focus-${label}.png`, import.meta.url).pathname,
  });
  await page.goto(`${origin}/hamaya-site-draft/compare/experiments/`);
  await page.screenshot({
    path: new URL(`./experiments-${label}.png`, import.meta.url).pathname,
    fullPage: true,
  });
  const card = page.locator('[data-experiment="motion"]');
  await card.locator('[data-open]').click();
  await page.waitForTimeout(500);
  const frame = page.frames().find((f) => f !== page.mainFrame());
  await frame.locator('canvas').scrollIntoViewIfNeeded();
  await frame.locator('canvas').focus();
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(250);
  await page.keyboard.up('ArrowRight');
  data.outside = await frame
    .locator('body')
    .evaluate((el) => ({ ...el.dataset }));
  await card.locator('iframe').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  data.returnedWithoutNewInput = await frame
    .locator('body')
    .evaluate((el) => ({ ...el.dataset }));
  await frame.locator('#replay').click();
  await page.waitForTimeout(250);
  const other = await context.newPage();
  await other.goto('about:blank');
  await other.bringToFront();
  await page.waitForTimeout(300);
  data.otherTab = {
    parentHidden: await page.evaluate(() => document.hidden),
    child: await frame
      .locator('body')
      .evaluate((el) => ({ ...el.dataset, hidden: document.hidden })),
  };
  await other.close();
  await page.bringToFront();
  // Browser visibility isn't necessarily emulated by headless tabs. Explicitly
  // exercise the listener separately and record this as synthetic, never device data.
  data.visibilityEventSimulation = await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    return true;
  });
  await page.waitForTimeout(150);
  const a = await frame.locator('body').evaluate((el) => ({ ...el.dataset }));
  await page.waitForTimeout(500);
  data.simulatedHidden = {
    a,
    b: await frame.locator('body').evaluate((el) => ({ ...el.dataset })),
  };
} finally {
  await browser.close();
}
await writeFile(
  new URL(`./visibility-${label}.json`, import.meta.url),
  JSON.stringify(data, null, 2) + '\n',
);
console.log(JSON.stringify(data, null, 2));
