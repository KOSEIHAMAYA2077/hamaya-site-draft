import { chromium } from '/tmp/hamaya-browser-qa/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
const port = process.argv[2] || 4352,
  label = process.argv[3] || 'before';
const origin = `http://127.0.0.1:${port}`,
  base = `${origin}/hamaya-site-draft`;
const browser = await chromium.launch({ headless: true });
const result = {
  label,
  syntheticFixture: true,
  browser: browser.version(),
  checks: [],
};
const check = (name, pass, details) => {
  result.checks.push({ name, pass, details });
  if (!pass) console.log('FAIL', name, details);
};
try {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await ctx.route('**/*', (r) =>
    r.request().url().startsWith(origin) ? r.continue() : r.abort(),
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/notes/`);
  await page.waitForTimeout(100);
  check(
    '100 synthetic notes visible',
    (await page.locator('[data-entry]:visible').count()) === 100,
  );
  await page.evaluate(() => {
    window.__mutations = 0;
    new MutationObserver((e) => (window.__mutations += e.length)).observe(
      document,
      { subtree: true, attributes: true, childList: true, characterData: true },
    );
  });
  const search = page.locator('#note-search');
  await search.fill('検証用');
  await page.waitForTimeout(100);
  await page.evaluate(() => (window.__mutations = 0));
  await search.fill(' 検証用 ');
  await page.waitForTimeout(100);
  result.sameNormalizedQueryMutations = await page.evaluate(
    () => window.__mutations,
  );
  const countBeforeComposition = await page
    .locator('[data-entry]:visible')
    .count();
  await page.evaluate(() => {
    const input = document.querySelector('#note-search');
    input.dispatchEvent(
      new CompositionEvent('compositionstart', { bubbles: true }),
    );
    input.value = '編集中の未確定文字';
    input.dispatchEvent(
      new InputEvent('input', { bubbles: true, isComposing: true }),
    );
  });
  await page.waitForTimeout(50);
  result.composition = {
    before: countBeforeComposition,
    during: await page.locator('[data-entry]:visible').count(),
  };
  await page.evaluate(() => {
    const input = document.querySelector('#note-search');
    input.value = 'ユニーク001';
    input.dispatchEvent(
      new CompositionEvent('compositionend', { bubbles: true }),
    );
    input.dispatchEvent(
      new InputEvent('input', { bubbles: true, isComposing: false }),
    );
  });
  await page.waitForTimeout(50);
  check(
    'committed Japanese search',
    (await page.locator('[data-entry]:visible').count()) === 1,
  );
  const href = await page
    .locator('[data-entry]:visible a')
    .first()
    .getAttribute('href');
  await page.locator('[data-entry]:visible a').first().click();
  await page.waitForLoadState('domcontentloaded');
  check('article carries search conditions', page.url().includes('q='), {
    href,
    url: page.url(),
  });
  await page.goBack();
  await page.waitForTimeout(100);
  check(
    'Back preserves search',
    (await search.inputValue()) === 'ユニーク001' &&
      (await page.locator('[data-entry]:visible').count()) === 1,
  );
  await page.reload();
  await page.waitForTimeout(100);
  check(
    'reload preserves search',
    (await search.inputValue()) === 'ユニーク001' &&
      (await page.locator('[data-entry]:visible').count()) === 1,
  );
  await search.fill('絶対に一致しない合成の条件');
  await page.waitForTimeout(50);
  check(
    'empty search state',
    (await page.locator('[data-no-results]').isVisible()) &&
      (await page.locator('[data-entry]:visible').count()) === 0,
  );
  await page.goto(`${base}/compare/focus/#piece-import-typeandsummon`);
  const noteLink = page
    .locator('[data-focus-panel]:visible a[href*="/notes/"]')
    .first();
  check('Focus links synthetic note', (await noteLink.count()) === 1);
  const focusURL = page.url();
  await noteLink.click();
  await page.goBack();
  await page.waitForTimeout(100);
  check(
    'Focus selection survives Back',
    page.url() === focusURL &&
      (await page.locator('[data-focus-panel]:visible').count()) === 1,
  );
  await page.reload();
  check('Focus selection survives reload', page.url() === focusURL);
  result.errors = errors;
  await ctx.close();

  // Delay all image responses equally to compare reserved layout and initial load.
  const imageCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const p = await imageCtx.newPage();
  let release;
  const hold = new Promise((r) => (release = r));
  const received = [];
  await imageCtx.route('**/*', async (route) => {
    if (!route.request().url().startsWith(origin)) return route.abort();
    if (route.request().resourceType() === 'image') await hold;
    return route.continue();
  });
  p.on('response', (r) => received.push(r));
  await p.goto(`${base}/notes/fixture-note-001/`, {
    waitUntil: 'domcontentloaded',
  });
  await p.waitForTimeout(100);
  result.article = {
    heightBeforeImages: await p.evaluate(
      () => document.documentElement.scrollHeight,
    ),
  };
  release();
  await p.waitForTimeout(1200);
  result.article.heightAfterInitialImages = await p.evaluate(
    () => document.documentElement.scrollHeight,
  );
  result.article.initialResources = await Promise.all(
    received.map(async (r) => ({
      url: r.url().replace(origin, ''),
      type: r.request().resourceType(),
      bytes: (await r.body()).length,
    })),
  );
  result.article.initialBytes = result.article.initialResources.reduce(
    (s, r) => s + r.bytes,
    0,
  );
  result.article.initialImageCount = result.article.initialResources.filter(
    (r) => r.type === 'image',
  ).length;
  result.article.images = await p.locator('.prose img').evaluateAll((els) =>
    els.map((el) => ({
      src: el.getAttribute('src'),
      attrWidth: el.getAttribute('width'),
      attrHeight: el.getAttribute('height'),
      loading: el.loading,
      naturalWidth: el.naturalWidth,
      naturalHeight: el.naturalHeight,
      renderedWidth: el.width,
      renderedHeight: el.height,
    })),
  );
  for (const img of await p.locator('.prose img').all()) {
    await img.scrollIntoViewIfNeeded();
    await img.evaluate((el) => el.decode());
  }
  check(
    'all 20 images readable after scroll',
    await p
      .locator('.prose img')
      .evaluateAll(
        (els) => els.length === 20 && els.every((el) => el.naturalWidth > 0),
      ),
  );
  check(
    'desktop long article has no page overflow',
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await p.screenshot({
    path: new URL(`./fixture-bottom-${label}.png`, import.meta.url).pathname,
  });
  await imageCtx.close();

  const mobile = await browser.newContext({
    viewport: { width: 320, height: 740 },
    reducedMotion: 'reduce',
  });
  const m = await mobile.newPage();
  const cdp = await mobile.newCDPSession(m);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  result.cpuSimulation =
    'Chromium DevTools 4x slowdown, not a measured physical device';
  for (const route of ['notes/', 'notes/fixture-note-001/', 'compare/focus/']) {
    await m.goto(`${base}/${route}`);
    await m.waitForTimeout(200);
    check(
      `320px / 4x simulation / no overflow: ${route}`,
      await m.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    check(`main readable: ${route}`, await m.locator('main').isVisible());
  }
  await m.locator('[data-focus-picker] summary').focus();
  await m.keyboard.press('Enter');
  check(
    'mobile keyboard opens Focus picker',
    await m.locator('[data-focus-picker]').evaluate((el) => el.open),
  );
  await m.keyboard.press('Escape');
  check(
    'mobile keyboard closes Focus picker',
    !(await m.locator('[data-focus-picker]').evaluate((el) => el.open)),
  );
  await m.screenshot({
    path: new URL(`./fixture-mobile-${label}.png`, import.meta.url).pathname,
  });
  await mobile.close();
  const noJS = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 320, height: 740 },
  });
  const n = await noJS.newPage();
  for (const route of [
    'notes/',
    'notes/fixture-note-001/',
    'compare/focus/',
    'compare/experiments/',
  ]) {
    await n.goto(`${base}/${route}`);
    check(
      `JS disabled readable: ${route}`,
      (await n.locator('main').isVisible()) &&
        (await n.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        )),
    );
  }
  check(
    'JS disabled experiments retain two diagrams',
    (await n.locator('[data-preview]:visible').count()) === 2,
  );
  await noJS.close();
} finally {
  await browser.close();
}
await writeFile(
  new URL(`./fixture-measure-${label}.json`, import.meta.url),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    {
      label,
      checks: result.checks,
      sameNormalizedQueryMutations: result.sameNormalizedQueryMutations,
      composition: result.composition,
      article: {
        initialBytes: result.article.initialBytes,
        initialImageCount: result.article.initialImageCount,
        heightBefore: result.article.heightBeforeImages,
        heightAfter: result.article.heightAfterInitialImages,
      },
    },
    null,
    2,
  ),
);
