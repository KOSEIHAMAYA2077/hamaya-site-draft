import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/tmp/hamaya-browser-qa/node_modules/playwright/index.mjs';

const out = path.dirname(fileURLToPath(import.meta.url));
const origin = 'http://127.0.0.1:4362';
const base = `${origin}/hamaya-site-draft/`;
const baseline = 'http://127.0.0.1:4360/hamaya-site-draft/';
const key = 'hamaya-workroom-return-v1';
const example = {
  enabled: true,
  work: 'import-game-ai-search-puzzles',
  note: 'legacy-cyberpunk2077-1',
};
const report = {
  scope:
    'Final-build screenshots, document-coordinate geometry, and storage-error recovery. Saved-state screenshots are QA fixtures, not owner activity.',
  checks: [],
  geometry: [],
  screenshots: [],
  requests: [],
  externalRequests: [],
  storageWrites: [],
  browserErrors: [],
  failure: null,
};
const browser = await chromium.launch({ headless: true });
const contexts = [];
async function create(width = 1280, raw = undefined) {
  const ctx = await browser.newContext({
    viewport: { width, height: width === 1280 ? 900 : 812 },
    reducedMotion: 'reduce',
    storageState: {
      cookies: [],
      origins: [
        {
          origin,
          localStorage: raw === undefined ? [] : [{ name: key, value: raw }],
        },
      ],
    },
  });
  contexts.push(ctx);
  await ctx.exposeBinding('__auditFinalWrite', (_, value) =>
    report.storageWrites.push(value),
  );
  await ctx.addInitScript((storageKey) => {
    window.__returnFailure = '';
    for (const operation of ['getItem', 'setItem', 'removeItem']) {
      const original = Storage.prototype[operation];
      Storage.prototype[operation] = function (name, value) {
        if (name === storageKey && window.__returnFailure === operation)
          throw new DOMException('Synthetic denial', 'SecurityError');
        if (operation !== 'getItem')
          window.__auditFinalWrite({
            operation,
            key: name,
            value,
            origin: location.origin,
          });
        return original.call(this, name, value);
      };
    }
  }, key);
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    report.requests.push(url);
    if (
      ['http://127.0.0.1:4362', 'http://127.0.0.1:4360'].includes(
        new URL(url).origin,
      )
    )
      await route.continue();
    else {
      report.externalRequests.push(url);
      await route.abort();
    }
  });
  ctx.on('page', (page) => {
    page.setDefaultTimeout(8000);
    page.on('pageerror', (error) => report.browserErrors.push(error.message));
  });
  return ctx;
}
async function home(page, url = base) {
  const response = await page.goto(url, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  await page.waitForFunction(() =>
    document
      .querySelector('[data-focus-study]')
      .hasAttribute('data-focus-enhanced'),
  );
}
async function screenshot(page, name) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  report.screenshots.push(`${name}.png`);
}
async function measure(page, name) {
  report.geometry.push(
    await page.evaluate((name) => {
      const panel = document.querySelector('[data-return-panel]');
      const cta = document.querySelector(
        '[data-focus-panel]:not([hidden]) [data-focus-primary]',
      );
      const focus = document.querySelector('[data-focus-study]');
      return {
        name,
        viewport: innerWidth,
        panelHeight: panel?.getBoundingClientRect().height ?? 0,
        focusTop: focus.getBoundingClientRect().top + scrollY,
        codeCtaTop: cta.getBoundingClientRect().top + scrollY,
        codeCtaLabel: cta.textContent.trim(),
        htmlWidth: document.documentElement.scrollWidth,
      };
    }, name),
  );
}
async function choice(page, id) {
  const picker = page.locator('[data-focus-picker]');
  if (!(await picker.evaluate((el) => el.open)))
    await picker.locator('summary').click();
  await picker.locator(`[data-focus-choice="${id}"]`).click();
}
try {
  // Recovery checks deliberately mutate only test-context storage, never source files.
  const recovery = await create(1280, JSON.stringify(example));
  const recoveryPage = await recovery.newPage();
  await home(recoveryPage);
  await recoveryPage.evaluate(() => {
    window.__returnFailure = 'setItem';
  });
  await choice(recoveryPage, 'import-de10-nano-riscv-invader');
  assert.match(
    await recoveryPage.locator('[data-return-error]').innerText(),
    /保存できませんでした/,
  );
  await recoveryPage.evaluate(() => {
    window.__returnFailure = '';
  });
  await choice(recoveryPage, 'import-typeandsummon');
  assert.equal(
    await recoveryPage.locator('[data-return-error]').isVisible(),
    false,
    'Successful selection must clear the earlier write error',
  );
  await recoveryPage.evaluate(() => {
    window.__returnFailure = 'getItem';
    window.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: true }),
    );
  });
  assert.equal(
    await recoveryPage.locator('[data-return-error]').isVisible(),
    true,
  );
  await recoveryPage.evaluate(() => {
    window.__returnFailure = '';
    window.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: true }),
    );
  });
  assert.equal(
    await recoveryPage.locator('[data-return-error]').isVisible(),
    false,
    'Successful refresh must clear the earlier read error',
  );
  await recoveryPage.goto(`${base}room/settings/`, {
    waitUntil: 'networkidle',
  });
  await recoveryPage.evaluate(() => {
    window.__returnFailure = 'removeItem';
  });
  await recoveryPage.locator('[data-return-clear]').click();
  assert.match(
    await recoveryPage.locator('[data-return-error]').innerText(),
    /削除できませんでした/,
  );
  await recoveryPage.evaluate(() => {
    window.__returnFailure = '';
  });
  await recoveryPage.locator('[data-return-clear]').click();
  assert.equal(
    await recoveryPage.locator('[data-return-error]').isVisible(),
    false,
  );
  assert.equal(
    await recoveryPage.evaluate((k) => localStorage.getItem(k), key),
    null,
  );
  report.checks.push(
    'Storage recovery clears prior write/read/delete error without false success',
  );
  await recoveryPage.locator('[data-return-enable]').check();
  await home(recoveryPage);
  const picker = recoveryPage.locator('[data-focus-picker]');
  await picker.locator('summary').click();
  const popup = recovery.waitForEvent('page');
  await picker
    .locator('[data-focus-choice="import-de10-nano-riscv-invader"]')
    .click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
  const newTab = await popup;
  await newTab.waitForLoadState('networkidle');
  assert.equal(
    await newTab.locator('[data-focus-study]').getAttribute('data-open-work'),
    'import-de10-nano-riscv-invader',
  );
  assert.equal(
    await recoveryPage
      .locator('[data-focus-study]')
      .getAttribute('data-open-work'),
    'import-typeandsummon',
  );
  assert.equal(
    JSON.parse(await recoveryPage.evaluate((k) => localStorage.getItem(k), key))
      .work,
    'import-de10-nano-riscv-invader',
  );
  await newTab.close();
  report.checks.push(
    'Modified-click deliberately chooses a work into new tab, records that ID, and preserves source work',
  );
  await recoveryPage.locator('.workroom-record h3 a').click();
  await recoveryPage.waitForURL('**/room/notes/legacy-cyberpunk2077-1/');
  await recoveryPage.waitForFunction(
    (k) =>
      JSON.parse(localStorage.getItem(k)).note === 'legacy-cyberpunk2077-1',
    key,
  );
  await home(recoveryPage);
  assert.equal(
    await recoveryPage.locator('[data-return-work-link]').getAttribute('href'),
    '/hamaya-site-draft/#piece-import-de10-nano-riscv-invader',
  );
  assert.equal(
    await recoveryPage.locator('[data-return-note-link]').getAttribute('href'),
    '/hamaya-site-draft/room/notes/legacy-cyberpunk2077-1/',
  );
  await recoveryPage.locator('[data-return-work-link]').click();
  await recoveryPage.waitForFunction(
    () =>
      document.querySelector('[data-focus-study]').dataset.openWork ===
      'import-de10-nano-riscv-invader',
  );
  report.checks.push(
    'Final registration retains opt-in selection and note arrival across pages; both resume links restore correct verified targets',
  );
  await recovery.close();

  for (const width of [1280, 375]) {
    const initial = await create(width);
    const initialPage = await initial.newPage();
    await home(initialPage);
    assert.equal(
      await initialPage.locator('[data-return-off]').isVisible(),
      true,
    );
    await screenshot(initialPage, `initial-${width}`);
    await measure(initialPage, `initial-${width}`);
    await initialPage.locator('[data-return-panel] > summary').click();
    await screenshot(initialPage, `collapsed-${width}`);
    await measure(initialPage, `collapsed-${width}`);
    await home(initialPage, baseline);
    await measure(initialPage, `baseline-integrated-${width}`);
    await initial.close();

    const resumed = await create(width, JSON.stringify(example));
    const resumedPage = await resumed.newPage();
    await home(resumedPage);
    assert.equal(
      await resumedPage.locator('[data-return-work-link]').isVisible(),
      true,
    );
    await screenshot(resumedPage, `resumed-${width}`);
    await measure(resumedPage, `resumed-${width}`);
    await resumedPage.goto(`${base}room/settings/`, {
      waitUntil: 'networkidle',
    });
    await screenshot(resumedPage, `settings-${width}`);
    await resumed.close();
  }
  assert.equal(
    report.storageWrites.some((x) => x.origin === 'http://127.0.0.1:4360'),
    false,
  );
  assert.equal(report.externalRequests.length, 0);
  assert.equal(report.browserErrors.length, 0);
  report.checks.push(
    'Final screenshots and geometry at 1280/375; original integrated preview read-only, with no storage writes or external requests',
  );
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  await Promise.allSettled(contexts.map((ctx) => ctx.close()));
  await browser.close();
  report.browserClosed = true;
  await writeFile(
    path.join(out, 'final-capture-evidence.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    JSON.stringify({
      checks: report.checks,
      geometry: report.geometry,
      failure: report.failure,
      browserClosed: report.browserClosed,
    }),
  );
}
