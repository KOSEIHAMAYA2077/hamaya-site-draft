import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/tmp/hamaya-browser-qa/node_modules/playwright/index.mjs';

const out = path.dirname(fileURLToPath(import.meta.url));
await mkdir(out, { recursive: true });
const origin = 'http://127.0.0.1:4362';
const base = `${origin}/hamaya-site-draft/`;
const key = 'hamaya-workroom-return-v1';
const displayKey = 'hamaya-workroom-display-v1';
const works = [
  'import-typeandsummon',
  'import-game-ai-search-puzzles',
  'import-de10-nano-riscv-invader',
];
const note = 'legacy-cyberpunk2077-1';
const marker = 'SYNTHETIC_RETURN_ENTRY_20261004';
const state = (work = null, entry = null) => ({
  enabled: true,
  work,
  note: entry,
});
const report = {
  scope:
    'Dedicated synthetic-data return-entry browser verification. No owner preferences inferred; no other browser tabs or servers touched.',
  checks: [],
  requests: [],
  externalRequests: [],
  pageErrors: [],
  consoleErrors: [],
  storageOperations: [],
  pageShows: [],
  screenshots: [],
  geometry: [],
  dialogs: [],
  failure: null,
};
const browser = await chromium.launch({ headless: true });
report.browser = browser.version();
const contexts = [];
const mark = (name, details = {}) => {
  report.checks.push({ name, ...details });
  console.log('PASS', name);
};
async function context(options = {}, raw = undefined, failureMode = '') {
  const localStorage = raw === undefined ? [] : [{ name: key, value: raw }];
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
    storageState: { cookies: [], origins: [{ origin, localStorage }] },
    ...options,
  });
  contexts.push(ctx);
  await ctx.exposeBinding('__returnAudit', (_, item) =>
    report.storageOperations.push(item),
  );
  await ctx.exposeBinding('__returnPageShow', (_, item) =>
    report.pageShows.push(item),
  );
  await ctx.addInitScript(
    ({ storageKey, failure }) => {
      window.__returnFailure = failure;
      window.addEventListener('pageshow', (event) =>
        window.__returnPageShow({
          pathname: location.pathname,
          persisted: event.persisted,
        }),
      );
      for (const operation of ['getItem', 'setItem', 'removeItem']) {
        const original = Storage.prototype[operation];
        Storage.prototype[operation] = function (name, value) {
          const failed =
            name === storageKey && window.__returnFailure === operation;
          if (operation !== 'getItem')
            window.__returnAudit({
              operation,
              key: name,
              value: value === undefined ? null : String(value),
              pathname: location.pathname,
              failed,
            });
          if (failed)
            throw new DOMException('Synthetic storage denial', 'SecurityError');
          return original.call(this, name, value);
        };
      }
    },
    { storageKey: key, failure: failureMode },
  );
  await ctx.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();
    report.requests.push({
      url,
      method: request.method(),
      hasSyntheticBody: Boolean(request.postData()?.includes(marker)),
    });
    if (new URL(url).origin === origin) await route.continue();
    else {
      report.externalRequests.push(url);
      await route.abort();
    }
  });
  ctx.on('page', (page) => {
    page.setDefaultTimeout(10000);
    page.on('pageerror', (error) =>
      report.pageErrors.push({ url: page.url(), message: error.message }),
    );
    page.on('console', (message) => {
      if (message.type() === 'error')
        report.consoleErrors.push({ url: page.url(), message: message.text() });
    });
    page.on('dialog', async (dialog) => {
      report.dialogs.push({ type: dialog.type(), message: dialog.message() });
      await dialog.dismiss();
    });
  });
  return ctx;
}
async function goto(page, route = '') {
  const response = await page.goto(`${base}${route}`, {
    waitUntil: 'networkidle',
  });
  assert.equal(response.status(), 200);
  if (await page.locator('[data-return-panel]').count())
    await page.waitForFunction(() =>
      document
        .querySelector('[data-focus-study]')
        .hasAttribute('data-focus-enhanced'),
    );
}
async function saved(page) {
  return page.evaluate((k) => localStorage.getItem(k), key);
}
async function active(page) {
  return page.locator('[data-focus-study]').getAttribute('data-open-work');
}
async function choose(page, id) {
  const picker = page.locator('[data-focus-picker]');
  if (!(await picker.evaluate((el) => el.open)))
    await picker.locator('summary').click();
  await picker.locator(`[data-focus-choice="${id}"]`).click();
  await page.waitForFunction(
    (id) =>
      document.querySelector('[data-focus-study]').dataset.openWork === id,
    id,
  );
}
async function shot(page, name, fullPage = false) {
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage });
  report.screenshots.push(`${name}.png`);
  if (await page.locator('[data-return-panel]').count())
    report.geometry.push(
      await page.evaluate((name) => {
        const panel = document.querySelector('[data-return-panel]');
        const cta = document.querySelector(
          '[data-focus-panel]:not([hidden]) [data-focus-primary]',
        );
        return {
          name,
          width: innerWidth,
          scrollY,
          panelHeight: panel.getBoundingClientRect().height,
          codeCtaTop: cta.getBoundingClientRect().top + scrollY,
          codeCtaLabel: cta.textContent.trim(),
        };
      }, name),
    );
}
async function fits(page) {
  const sizes = await page.evaluate(() => ({
    viewport: innerWidth,
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(
    sizes.html <= sizes.viewport + 1 && sizes.body <= sizes.viewport + 1,
    JSON.stringify(sizes),
  );
  return sizes;
}
async function waitSaved(page, expected) {
  await page.waitForFunction(
    ({ k, expected }) => localStorage.getItem(k) === expected,
    { k: key, expected: expected === null ? null : JSON.stringify(expected) },
  );
}
async function enableViaSettings(page) {
  await goto(page, 'room/settings/');
  await page.locator('[data-return-enable]').check();
  await waitSaved(page, state());
  assert.match(
    await page.locator('[data-return-status]').innerText(),
    /ONにしました/,
  );
}

try {
  const ctx = await context();
  const page = await ctx.newPage();
  await goto(page);
  assert.equal(await saved(page), null);
  assert.equal(
    await page.locator('[data-return-panel]').evaluate((el) => el.open),
    true,
  );
  assert.equal(await page.locator('[data-return-off]').isVisible(), true);
  assert.equal(await page.locator('[data-return-enabled]').isVisible(), false);
  assert.equal(await page.locator('[data-return-error]').isVisible(), false);
  await fits(page);
  await shot(page, 'initial-1280');
  const summary = page.locator('[data-return-panel] > summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  assert.equal(
    await page.locator('[data-return-panel]').evaluate((el) => el.open),
    false,
  );
  await shot(page, 'collapsed-1280');
  await page.keyboard.press('Space');
  assert.equal(
    await page.locator('[data-return-panel]').evaluate((el) => el.open),
    true,
  );
  assert.equal(await saved(page), null);
  mark(
    'First visit is empty and saving OFF; keyboard native details open/close writes no history',
  );

  await choose(page, works[1]);
  assert.equal(await saved(page), null);
  assert.equal(
    await page.locator('[data-return-error]').isVisible(),
    false,
    'OFF is not a storage failure',
  );
  await page.locator('.workroom-record h3 a').click();
  await page.waitForURL(`**/room/notes/${note}/`);
  assert.equal(await saved(page), null);
  assert.equal(
    await page.locator('[data-return-error]').isVisible(),
    false,
    'Reading with saving OFF is not an error',
  );
  await page.goBack({ waitUntil: 'networkidle' });
  assert.equal(await active(page), works[1]);
  assert.equal(await saved(page), null);
  mark(
    'Saving OFF permits choosing, reading, and browser Back without history or false storage errors',
  );

  await enableViaSettings(page);
  await shot(page, 'settings-1280', true);
  await goto(page, `#piece-${works[2]}`);
  assert.equal(await active(page), works[2]);
  assert.deepEqual(JSON.parse(await saved(page)), state());
  await page.evaluate((id) => {
    location.hash = `piece-${id}`;
  }, works[0]);
  await page.waitForFunction(
    (id) =>
      document.querySelector('[data-focus-study]').dataset.openWork === id,
    works[0],
  );
  assert.deepEqual(JSON.parse(await saved(page)), state());
  await page.reload({ waitUntil: 'networkidle' });
  assert.deepEqual(JSON.parse(await saved(page)), state());
  mark(
    'Opt-in starts empty; initial work, hash restoration, hashchange, and reload do not create selection history',
  );

  await choose(page, works[1]);
  await waitSaved(page, state(works[1]));
  await goto(
    page,
    `room/notes/${note}/?q=${marker}&category=%E9%9B%91%E8%A8%98`,
  );
  await waitSaved(page, state(works[1], note));
  await goto(page);
  assert.equal(
    await active(page),
    works[0],
    'History must not silently switch current focus on home load',
  );
  assert.match(
    await page.locator('[data-return-note-link]').getAttribute('href'),
    new RegExp(`/room/notes/${note}/$`),
  );
  assert.equal(
    await page.locator('[data-return-work-link]').getAttribute('href'),
    `/hamaya-site-draft/#piece-${works[1]}`,
  );
  assert.equal(
    (
      await page.locator('[data-return-note-link]').getAttribute('href')
    ).includes(marker),
    false,
  );
  await shot(page, 'resumed-1280');
  await page.locator('[data-return-work-link]').click();
  await page.waitForFunction(
    (id) =>
      document.querySelector('[data-focus-study]').dataset.openWork === id,
    works[1],
  );
  await page.locator('[data-return-note-link]').click();
  await page.waitForURL(`**/room/notes/${note}/`);
  await page.goBack({ waitUntil: 'networkidle' });
  assert.equal(await active(page), works[1]);
  assert.deepEqual(JSON.parse(await saved(page)), state(works[1], note));
  mark(
    'Explicit work selection and note visit retain one verified ID each; resume links and browser Back restore target without query persistence',
  );

  const other = await ctx.newPage();
  await goto(other);
  await choose(other, works[2]);
  await page.waitForFunction(
    (id) =>
      document
        .querySelector('[data-return-work-link]')
        .getAttribute('href')
        ?.endsWith(`#piece-${id}`),
    works[2],
  );
  assert.equal(await active(page), works[1]);
  await goto(other, `room/notes/${note}/`);
  assert.equal(await active(page), works[1]);
  const expected = state(works[2], note);
  assert.deepEqual(JSON.parse(await saved(page)), expected);
  mark(
    'Another tab updates resume links without changing the work currently being read',
  );

  const resumeHref = await page
    .locator('[data-return-work-link]')
    .getAttribute('href');
  const popup = ctx.waitForEvent('page');
  await page
    .locator('[data-return-work-link]')
    .click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
  const newTab = await popup;
  await newTab.waitForLoadState('networkidle');
  assert.equal(newTab.url(), `${origin}${resumeHref}`);
  assert.equal(await active(newTab), works[2]);
  assert.equal(await active(page), works[1]);
  assert.deepEqual(JSON.parse(await saved(newTab)), expected);
  await newTab.close();
  mark(
    'Native modified-click opens resume deep-link in separate tab, leaves source selection intact, and does not create a new selection',
  );

  await goto(other, 'room/settings/');
  await other.locator('[data-return-clear]').click();
  await waitSaved(other, null);
  await page.waitForFunction(
    () => !document.querySelector('[data-return-off]').hidden,
  );
  assert.equal(await active(page), works[1]);
  await page.evaluate(
    ({ k, oldValue }) => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: k,
          oldValue: null,
          newValue: oldValue,
          storageArea: localStorage,
          url: location.href,
        }),
      );
      window.dispatchEvent(
        new PageTransitionEvent('pageshow', { persisted: true }),
      );
    },
    { k: key, oldValue: JSON.stringify(expected) },
  );
  assert.equal(await saved(page), null);
  assert.equal(await page.locator('[data-return-off]').isVisible(), true);
  await choose(page, works[0]);
  assert.equal(await saved(page), null);
  await goto(page, `room/notes/${note}/`);
  await page.goBack({ waitUntil: 'networkidle' });
  assert.equal(await saved(page), null);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await saved(page), null);
  mark(
    'Clear disables saving across tabs; stale storage event, simulated persisted pageshow, later choice, note visit, Back, and reload cannot resurrect IDs',
    {
      bfcacheEvent:
        'Synthetic persisted pageshow supplements actual browser Back; not a claim that Chromium used BFCache.',
    },
  );

  await enableViaSettings(page);
  await goto(page);
  await page.locator('[data-return-panel] > summary').click();
  assert.equal(
    await page.locator('[data-return-panel]').evaluate((el) => el.open),
    false,
  );
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(
    await page.locator('[data-return-panel]').evaluate((el) => el.open),
    true,
  );
  assert.deepEqual(JSON.parse(await saved(page)), state());
  mark(
    'Panel collapse is intentionally page-local and does not persist alongside history',
  );

  await page.locator('[data-return-panel] a[href*="write/"]').click();
  await page.waitForURL('**/write/?kind=note');
  assert.equal(await page.locator('#write-kind').inputValue(), 'note');
  assert.equal(await page.locator('#write-title').inputValue(), '');
  assert.equal(await page.locator('#write-body').inputValue(), '');
  await page.locator('#write-title').fill('【合成検証】再開入口');
  await page.locator('#write-body').fill(marker);
  assert.deepEqual(JSON.parse(await saved(page)), state());
  await page.locator('#write-title').fill('');
  await page.locator('#write-body').fill('');
  await goto(page);
  await page.locator('[data-return-experiment]').click();
  await page.waitForURL('**/compare/experiments/');
  assert.equal(await page.locator('[data-experiment-study] iframe').count(), 0);
  await page.locator('[data-experiment="motion"] [data-open]').click();
  const frame = page.frameLocator('[data-experiment="motion"] iframe');
  await frame.locator('#experiment-state').waitFor({ state: 'attached' });
  assert.equal(
    await frame.locator('body').getAttribute('data-running'),
    'false',
  );
  assert.deepEqual(JSON.parse(await saved(page)), state());
  await goto(page);
  await page.locator('[data-return-experiment]').click();
  await page.waitForURL('**/compare/experiments/');
  assert.equal(await page.locator('[data-experiment-study] iframe').count(), 0);
  assert.deepEqual(JSON.parse(await saved(page)), state());
  mark(
    'Write starts a blank note; draft text is not retained; experiment entry neither restores a runtime nor auto-starts motion',
  );

  await goto(page);
  await goto(other, 'room/settings/');
  await other.locator('[data-display-option="experiments"]').uncheck();
  await page.waitForFunction(
    () => document.querySelector('[data-return-experiment]').hidden,
  );
  assert.equal(
    await page.locator('[data-return-experiment]').isVisible(),
    false,
  );
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(
    await page.locator('[data-return-experiment]').isVisible(),
    false,
  );
  await other.locator('[data-display-option="experiments"]').check();
  await page.waitForFunction(
    () => !document.querySelector('[data-return-experiment]').hidden,
  );
  mark(
    'Experiment display preference propagates to quick entry across tabs and reload',
  );
  await ctx.close();

  const oldStates = [
    { name: 'malformed JSON', raw: '{broken' },
    {
      name: 'old schema with version',
      raw: JSON.stringify({ version: 0, enabled: true, work: works[1], note }),
    },
    {
      name: 'extra arbitrary URL',
      raw: JSON.stringify({
        ...state(works[1], note),
        url: 'https://example.invalid/private',
      }),
    },
    {
      name: 'invalid value types',
      raw: JSON.stringify({
        enabled: true,
        work: { href: 'javascript:alert(1)' },
        note,
      }),
    },
    { name: 'oversized payload', raw: 'x'.repeat(1025) },
  ];
  for (const fixture of oldStates) {
    const old = await context({}, fixture.raw);
    const tab = await old.newPage();
    await goto(tab);
    assert.equal(await tab.locator('[data-return-off]').isVisible(), true);
    assert.equal(
      await tab.locator('[data-return-work-link]').isVisible(),
      false,
    );
    assert.equal(
      await saved(tab),
      fixture.raw,
      'Read must not silently repair or migrate old payload',
    );
    await old.close();
  }
  const unknown = await context(
    {},
    JSON.stringify(state('unknown-private-work', 'unknown-note')),
  );
  const unknownPage = await unknown.newPage();
  await goto(unknownPage);
  assert.equal(
    await unknownPage.locator('[data-return-enabled]').isVisible(),
    true,
  );
  assert.equal(
    await unknownPage.locator('[data-return-note-empty]').isVisible(),
    true,
  );
  assert.equal(
    await unknownPage.locator('[data-return-work-empty]').isVisible(),
    true,
  );
  assert.equal(
    await unknownPage.locator('[data-return-panel] a[href*="unknown"]').count(),
    0,
  );
  await unknown.close();
  mark(
    'Five malformed/old schemas are safely OFF without migration; unknown IDs produce empty state without fabricated links',
    { fixtures: oldStates.map((x) => x.name) },
  );

  const getDenied = await context(
    {},
    JSON.stringify(state(works[1], note)),
    'getItem',
  );
  const getPage = await getDenied.newPage();
  await goto(getPage, 'room/settings/');
  assert.equal(
    await getPage.locator('[data-return-enable]').isChecked(),
    false,
  );
  assert.match(
    await getPage.locator('[data-return-status]').innerText(),
    /読み出せません/,
  );
  assert.equal(await getPage.locator('[data-return-error]').isVisible(), true);
  await getDenied.close();
  const setDenied = await context({}, undefined, 'setItem');
  const setPage = await setDenied.newPage();
  await goto(setPage, 'room/settings/');
  await setPage.locator('[data-return-enable]').click();
  assert.equal(
    await setPage.locator('[data-return-enable]').isChecked(),
    false,
  );
  assert.match(
    await setPage.locator('[data-return-status]').innerText(),
    /ONにできませんでした/,
  );
  assert.equal(await saved(setPage), null);
  await setDenied.close();
  const removeDenied = await context(
    {},
    JSON.stringify(state(works[1], note)),
    'removeItem',
  );
  const removePage = await removeDenied.newPage();
  await goto(removePage, 'room/settings/');
  await removePage.locator('[data-return-clear]').click();
  assert.equal(
    await removePage.locator('[data-return-enable]').isChecked(),
    true,
  );
  assert.match(
    await removePage.locator('[data-return-status]').innerText(),
    /削除できませんでした/,
  );
  assert.deepEqual(JSON.parse(await saved(removePage)), state(works[1], note));
  await removePage.locator('[data-return-enable]').click();
  assert.equal(
    await removePage.locator('[data-return-enable]').isChecked(),
    true,
  );
  assert.match(
    await removePage.locator('[data-return-status]').innerText(),
    /削除できませんでした/,
  );
  await removeDenied.close();
  mark(
    'Storage get/set/remove denial never claims success; rejected deletion retains truthful enabled state and deletion instructions',
  );

  const rememberDenied = await context(
    {},
    JSON.stringify(state(works[0], note)),
    'setItem',
  );
  const rememberPage = await rememberDenied.newPage();
  await goto(rememberPage);
  await choose(rememberPage, works[1]);
  assert.equal(await active(rememberPage), works[1]);
  assert.deepEqual(
    JSON.parse(await saved(rememberPage)),
    state(works[0], note),
  );
  assert.match(
    await rememberPage.locator('[data-return-error]').innerText(),
    /保存できませんでした/,
  );
  assert.equal(
    await rememberPage.locator('[data-return-work-link]').getAttribute('href'),
    `/hamaya-site-draft/#piece-${works[0]}`,
  );
  await rememberDenied.close();
  mark(
    'Selection write denial leaves reading usable and old resume target truthful',
  );

  const viewports = [];
  for (const width of [375, 320]) {
    const mobile = await context({
      viewport: { width, height: width === 375 ? 812 : 640 },
    });
    const tab = await mobile.newPage();
    await goto(tab);
    viewports.push(await fits(tab));
    if (width === 375) await shot(tab, 'initial-375');
    await enableViaSettings(tab);
    await fits(tab);
    if (width === 375) await shot(tab, 'settings-375', true);
    await goto(tab);
    await choose(tab, works[1]);
    await goto(tab, `room/notes/${note}/`);
    await goto(tab);
    await fits(tab);
    if (width === 375) await shot(tab, 'resumed-375');
    await tab.locator('[data-return-panel] > summary').click();
    assert.equal(
      await tab.locator('[data-return-panel]').evaluate((el) => el.open),
      false,
    );
    await fits(tab);
    if (width === 375) await shot(tab, 'collapsed-375');
    await mobile.close();
  }
  mark(
    '320px and 375px entry, saved-state, settings, and collapsed layouts fit without horizontal overflow',
    { viewports },
  );

  const keyboard = await context();
  const keyPage = await keyboard.newPage();
  await goto(keyPage, 'room/settings/');
  await keyPage.locator('[data-return-enable]').focus();
  await keyPage.keyboard.press('Space');
  assert.equal(await keyPage.locator('[data-return-enable]').isChecked(), true);
  await keyPage.locator('[data-return-clear]').focus();
  await keyPage.keyboard.press('Enter');
  assert.equal(await saved(keyPage), null);
  await goto(keyPage);
  assert.equal(
    await keyPage.locator('html').getAttribute('data-motion'),
    'off',
  );
  assert.equal(await keyPage.locator('[data-focus-motion]').isVisible(), false);
  const verifiedCodeLinks = await keyPage
    .locator('[data-focus-primary][href^="https://github.com/"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('href')));
  assert.equal(verifiedCodeLinks.length, 6);
  await keyboard.close();
  mark(
    'Keyboard toggles save/clear and reduced motion remains respected; all six verified GitHub code links retained',
    { verifiedCodeLinks },
  );

  const nojs = await context({ javaScriptEnabled: false });
  const nojsPage = await nojs.newPage();
  const nojsResponse = await nojsPage.goto(base, { waitUntil: 'networkidle' });
  assert.equal(nojsResponse.status(), 200);
  await fits(nojsPage);
  assert.equal(await nojsPage.locator('[data-return-off]').isVisible(), false);
  assert.match(
    await nojsPage.locator('[data-return-panel] noscript').innerText(),
    /JavaScriptが必要/,
  );
  assert.equal(
    await nojsPage.locator('[data-return-panel] a[href*="write/"]').isVisible(),
    true,
  );
  await nojsPage.locator('[data-return-panel] > summary').click();
  assert.equal(
    await nojsPage.locator('[data-return-panel]').getAttribute('open'),
    null,
  );
  await nojsPage.goto(`${base}room/settings/`, { waitUntil: 'networkidle' });
  assert.equal(
    await nojsPage.locator('[data-return-controls]').isVisible(),
    false,
  );
  assert.match(
    await nojsPage.locator('.return-no-script').innerText(),
    /JavaScriptが必要/,
  );
  await nojsPage.goto(`${base}room/notes/${note}/`, {
    waitUntil: 'networkidle',
  });
  assert.equal(await nojsPage.locator('article h1').count(), 1);
  await nojs.close();
  mark(
    'Without JavaScript, native disclosure, write/read links, and original note remain usable; save controls explain their requirement',
  );

  const successfulWrites = report.storageOperations.filter(
    (x) => x.operation === 'setItem' && !x.failed,
  );
  for (const operation of successfulWrites) {
    assert.ok([key, displayKey, 'archive-motion'].includes(operation.key));
    assert.equal(operation.value.includes(marker), false);
    if (operation.key === key) {
      const value = JSON.parse(operation.value);
      assert.deepEqual(Object.keys(value).sort(), ['enabled', 'note', 'work']);
      assert.equal(value.enabled, true);
      assert.ok(value.work === null || works.includes(value.work));
      assert.ok(value.note === null || value.note === note);
    }
  }
  assert.equal(report.externalRequests.length, 0);
  assert.equal(
    report.requests.some((x) => x.method !== 'GET'),
    false,
  );
  assert.equal(
    report.requests.some((x) => x.hasSyntheticBody),
    false,
  );
  assert.equal(report.pageErrors.length, 0);
  assert.equal(report.consoleErrors.length, 0);
  mark(
    'All successful return writes contain only enabled/work/note; no synthetic text, external requests, mutations, or browser errors',
    { successfulWrites: successfulWrites.length },
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
    path.join(out, 'browser-evidence.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
