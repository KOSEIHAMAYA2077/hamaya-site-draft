import assert from 'node:assert/strict';
import { chromium } from '/tmp/hamaya-browser-qa/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = '/tmp/hamaya-quiet-use-20261004/after/hamaya-site-draft';
const out =
  '/Users/hamayakousei/Documents/Codex/2026-10-04/task-3/.dot/quiet-qa/experiment-acceptance';
await mkdir(out, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://localhost');
    if (!u.pathname.startsWith('/hamaya-site-draft/')) throw new Error('base');
    const rel = decodeURIComponent(
      u.pathname.slice('/hamaya-site-draft/'.length),
    );
    const p = path.resolve(
      root,
      rel + (u.pathname.endsWith('/') ? 'index.html' : ''),
    );
    if (!p.startsWith(root + '/')) throw new Error('path');
    const data = await readFile(p);
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
      }[path.extname(p)] || 'text/plain',
    );
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const url = origin + '/hamaya-site-draft/compare/experiments/';
const browser = await chromium.launch({ headless: true });
const report = {
  browser: browser.version(),
  root,
  checks: [],
  errors: [],
  failedRequests: [],
  adjustments: [
    '可視性通知やblurが停止理由だけを更新する場合があるため、停止中はmodel state / frameCount / running / activeDirectionsを比較する。モデル進行と入力残りの検査は維持。',
    'strict availabilityでは画面内で操作する必要があるため、keyboard focus前にcanvasを明示的にscrollIntoViewする。',
    '履歴検査は実際の同一localhostページ間でBack/Forwardを実行し、pageshow.persistedを記録する。BFCache使用は仮定しない。',
  ],
};
const mark = (name, details = {}) => {
  report.checks.push({ name, ...details });
  console.log('PASS', name);
};
async function newPage(width, options = {}) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    ...options,
  });
  await page.addInitScript(() => {
    window.addEventListener('pageshow', (event) => {
      window.__qaPageShowPersisted = event.persisted;
    });
  });
  page.on('pageerror', (e) => report.errors.push(e.message));
  page.on('requestfailed', (r) => report.failedRequests.push(r.url()));
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin
      ? route.continue()
      : route.abort(),
  );
  await page.goto(url, { waitUntil: 'networkidle' });
  return page;
}
const state = async (frame) =>
  JSON.parse(await frame.locator('#experiment-state').textContent());
const stableState = ({ state, frameCount, running, activeDirections }) => ({
  state,
  frameCount,
  running,
  activeDirections,
});
async function assertFrozen(frame, before) {
  const after = await state(frame);
  assert.deepEqual(stableState(after), stableState(before));
  assert.equal(after.running, false);
  assert.deepEqual(after.activeDirections, []);
}
async function showCanvas(frame) {
  await frame.locator('canvas').scrollIntoViewIfNeeded();
  // IntersectionObserver and parent postMessage are asynchronous, not a user delay.
  await frame.page().waitForTimeout(80);
  await frame.locator('canvas').focus();
}
async function open(page, id) {
  const card = page.locator(`[data-experiment="${id}"]`);
  await card.locator('[data-open]').click();
  const iframe = card.locator('iframe');
  await iframe.waitFor();
  const frame = await (await iframe.elementHandle()).contentFrame();
  await frame.waitForSelector('#experiment-state', { state: 'attached' });
  assert.equal(await iframe.getAttribute('sandbox'), 'allow-scripts');
  assert.equal((await state(frame)).running, false);
  return { card, frame, iframe };
}
try {
  for (const width of [1280, 375, 320]) {
    const page = await newPage(width, {
      reducedMotion: 'reduce',
      isMobile: width < 600,
      hasTouch: width < 600,
    });
    assert.equal(await page.locator('iframe').count(), 0);
    assert.equal(await page.locator('h1').innerText(), '実験を見る');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth),
      width,
    );
    await page.screenshot({
      path: `${out}/experiments-${width}-still.png`,
      fullPage: true,
    });
    const { card, frame, iframe } = await open(page, 'motion');
    await frame.locator('#step').click();
    const stepped = await state(frame);
    assert.equal(stepped.running, false);
    assert.equal(stepped.state.replay.frames, 4);
    await page.waitForTimeout(150);
    await assertFrozen(frame, stepped);
    assert.equal(
      await frame.evaluate(() => document.documentElement.scrollWidth),
      await iframe.evaluate((el) => el.clientWidth),
    );
    const boundary = await frame.evaluate(() => {
      let parentBlocked = false,
        storageBlocked = false;
      try {
        void parent.document.body;
      } catch {
        parentBlocked = true;
      }
      try {
        localStorage.setItem('synthetic-test', 'x');
      } catch {
        storageBlocked = true;
      }
      return {
        parentBlocked,
        storageBlocked,
        csp: document.querySelector(
          'meta[http-equiv="Content-Security-Policy"]',
        ).content,
      };
    });
    assert.equal(boundary.parentBlocked, true);
    assert.equal(boundary.storageBlocked, true);
    assert.match(boundary.csp, /connect-src 'none'/);
    const beforeHeight = await iframe.getAttribute('style');
    await page.evaluate(() =>
      window.postMessage(
        { type: 'experiment:resize', id: 'motion', height: 1050 },
        '*',
      ),
    );
    await page.waitForTimeout(60);
    assert.equal(await iframe.getAttribute('style'), beforeHeight);
    // Capture the active viewport: full-page screenshots may paint fixed
    // offscreen controls or omit the compositor surface of an offscreen iframe.
    await iframe.evaluate((element) =>
      element.scrollIntoView({ block: 'center', behavior: 'instant' }),
    );
    await page.waitForTimeout(120);
    await page.screenshot({
      path: `${out}/experiments-${width}-motion.png`,
      fullPage: false,
    });
    const other = await open(page, 'clock');
    assert.equal(await page.locator('iframe').count(), 1);
    assert.equal(
      await card.locator('[data-open]').getAttribute('aria-expanded'),
      'false',
    );
    await other.frame
      .locator('[data-direction="right"]')
      .scrollIntoViewIfNeeded();
    await page.waitForTimeout(80);
    await other.frame.locator('[data-direction="right"]').focus();
    await other.frame.locator('[data-direction="right"]').press('Enter');
    const keyboard = await state(other.frame);
    assert.ok(keyboard.state.distance > 0);
    assert.equal(keyboard.running, false);
    if (width < 600) {
      await other.frame
        .locator('[data-direction=right]')
        .scrollIntoViewIfNeeded();
      const box = await other.frame
        .locator('[data-direction=right]')
        .boundingBox();
      const cdp = await page.context().newCDPSession(page);
      const before = (await state(other.frame)).state.distance;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
      });
      await other.frame.waitForFunction(
        (previous) =>
          JSON.parse(document.querySelector('#experiment-state').textContent)
            .state.distance >
          previous + 0.1,
        before,
      );
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await cdp.detach();
      await other.card.locator('[data-pause]').click();
      assert.deepEqual((await state(other.frame)).activeDirections, []);
    }
    await other.frame.locator('#mode').selectOption('realtime');
    await other.frame.locator('#pause').click();
    await other.frame.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#experiment-state').textContent)
          .frameCount > 4,
    );
    await page.evaluate(() => scrollTo(0, 0));
    await other.frame.waitForFunction(
      () => document.body.dataset.running === 'false',
      null,
      { polling: 100, timeout: 3000 },
    );
    const stopped = await state(other.frame);
    await page.waitForTimeout(250);
    await assertFrozen(other.frame, stopped);
    assert.equal(stopped.activeDirections.length, 0);
    // Synthetic activation cannot start or single-step an offscreen frame.
    await other.frame.evaluate(() => {
      document.querySelector('#step').click();
      document.querySelector('#replay').click();
      window.postMessage(
        { type: 'experiment:availability', available: true },
        '*',
      );
    });
    await page.waitForTimeout(80);
    await other.frame.evaluate(() => document.querySelector('#pause').click());
    await page.waitForTimeout(100);
    await assertFrozen(other.frame, stopped);
    await other.iframe.evaluate((el) =>
      el.scrollIntoView({ block: 'center', behavior: 'instant' }),
    );
    await page.waitForTimeout(100);
    await assertFrozen(other.frame, stopped);
    await other.card.locator('[data-open]').click();
    assert.equal(await page.locator('iframe').count(), 0);
    mark(`layout-isolation-lifecycle-${width}`, {
      noAutoplay: true,
      reducedMotionStep: true,
      parentAndStorageBlocked: true,
      forgedMessageIgnored: true,
      offscreenStops: true,
      offscreenSyntheticActivationBlocked: true,
      noAutoResume: true,
      oneFrameOnly: true,
      overflow: false,
    });
    await page.close();
  }
  const page = await newPage(1280);
  const motion = await open(page, 'motion');
  const results = {};
  await showCanvas(motion.frame);
  await page.keyboard.down('Shift');
  await page.keyboard.down('KeyA');
  await motion.frame.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#experiment-state').textContent).state
        .distance > 0.1,
  );
  await page.keyboard.up('Shift');
  await page.keyboard.up('KeyA');
  await motion.frame.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#experiment-state').textContent)
        .activeDirections.length === 0,
    null,
    { polling: 50, timeout: 2000 },
  );
  await motion.card.locator('[data-pause]').click();
  mark('shift-release-clears-input');

  for (const mode of ['generated', 'rigid']) {
    await motion.frame.locator('#mode').selectOption(mode);
    await motion.frame.locator('#replay').click();
    await motion.frame.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#experiment-state').textContent)
          .state.replay.status === 'completed',
    );
    const s = await state(motion.frame);
    assert.equal(s.running, false);
    results[mode] = s.state.traceResult;
  }
  assert.equal(results.generated.x, results.rigid.x);
  assert.equal(results.generated.distance, results.rigid.distance);
  assert.ok(results.generated.peakDisplayedAngle > 0);
  assert.equal(results.rigid.peakDisplayedAngle, 0);
  mark('motion-comparison', { results });
  const clock = await open(page, 'clock');
  const clocks = {};
  for (const mode of ['movement', 'realtime']) {
    await clock.frame.locator('#mode').selectOption(mode);
    await clock.frame.locator('#preset').selectOption('long');
    await clock.frame.locator('#replay').click();
    await clock.frame.waitForFunction(
      () =>
        JSON.parse(document.querySelector('#experiment-state').textContent)
          .state.replay.status === 'completed',
      null,
      { timeout: 15000 },
    );
    const s = await state(clock.frame);
    assert.equal(s.running, false);
    clocks[mode] = s.state.traceResult;
  }
  assert.deepEqual(clocks.movement.player, clocks.realtime.player);
  assert.equal(clocks.movement.distance, clocks.realtime.distance);
  assert.equal(clocks.movement.contactCount, 0);
  assert.equal(clocks.realtime.contactCount, 1);
  mark('clock-comparison', { results: clocks });
  // Blur and explicit parent pause release held input and keep the exact simulation state.
  await clock.frame.locator('#reset').click();
  await showCanvas(clock.frame);
  await page.keyboard.down('ArrowRight');
  await clock.frame.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#experiment-state').textContent).state
        .distance > 0.1,
  );
  await clock.card.locator('[data-pause]').click();
  await page.keyboard.up('ArrowRight');
  const paused = await state(clock.frame);
  assert.equal(paused.running, false);
  assert.deepEqual(paused.activeDirections, []);
  await page.waitForTimeout(200);
  const later = await state(clock.frame);
  assert.deepEqual(later.state, paused.state);
  assert.equal(later.frameCount, paused.frameCount);
  assert.equal(later.running, false);
  mark('parent-pause-input-release');
  await clock.frame.locator('#reset').click();
  await clock.frame.locator('#pause').click();
  await clock.frame.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#experiment-state').textContent)
        .reason === 'limit',
    null,
    { polling: 100, timeout: 16000 },
  );
  assert.equal((await state(clock.frame)).running, false);
  mark('bounded-session-12-seconds');

  await page.close();
  const historyPage = await newPage(1280);
  let historyTrial = await open(historyPage, 'clock');
  await historyTrial.frame.locator('#mode').selectOption('realtime');
  await historyTrial.frame.locator('#pause').click();
  await historyTrial.frame.waitForFunction(
    () => document.body.dataset.running === 'true',
  );
  const about = origin + '/hamaya-site-draft/about/';
  await historyPage.goto(about, { waitUntil: 'networkidle' });
  await historyPage.goBack({ waitUntil: 'networkidle' });
  assert.equal(historyPage.url(), url);
  const historyInfo = {
    persisted: await historyPage.evaluate(
      () => window.__qaPageShowPersisted ?? null,
    ),
    restoredFrames: await historyPage.locator('iframe').count(),
  };
  if (historyInfo.restoredFrames) {
    const restored = await (
      await historyPage.locator('iframe').elementHandle()
    ).contentFrame();
    await restored.waitForFunction(
      () => document.body.dataset.running === 'false',
    );
    const stopped = await state(restored);
    await historyPage.waitForTimeout(300);
    await assertFrozen(restored, stopped);
  } else assert.equal(historyInfo.restoredFrames, 0);
  await historyPage.goForward({ waitUntil: 'networkidle' });
  assert.equal(historyPage.url(), about);
  await historyPage.goBack({ waitUntil: 'networkidle' });
  assert.equal(historyPage.url(), url);
  await historyPage.reload({ waitUntil: 'networkidle' });
  assert.equal(await historyPage.locator('iframe').count(), 0);
  historyTrial = await open(historyPage, 'motion');
  assert.equal((await state(historyTrial.frame)).frameCount, 0);
  await historyPage.waitForTimeout(250);
  assert.equal((await state(historyTrial.frame)).running, false);
  mark('history-and-reload-no-autoplay', historyInfo);
  await historyPage.close();

  const slow = await newPage(375, {
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const cdp = await slow.context().newCDPSession(slow);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const slowTrial = await open(slow, 'clock');
  await slowTrial.frame.locator('#step').click();
  const firstStep = await state(slowTrial.frame);
  assert.equal(firstStep.state.replay.frames, 4);
  assert.equal(firstStep.running, false);
  await slow.waitForTimeout(250);
  await assertFrozen(slowTrial.frame, firstStep);
  await slowTrial.frame.locator('#mode').selectOption('realtime');
  await slowTrial.frame.locator('#pause').click();
  await slowTrial.frame.waitForFunction(
    () =>
      JSON.parse(document.querySelector('#experiment-state').textContent)
        .frameCount > 4,
  );
  await slowTrial.card.locator('[data-pause]').click();
  await slowTrial.frame.waitForFunction(
    () => document.body.dataset.running === 'false',
  );
  const slowStopped = await state(slowTrial.frame);
  await slow.waitForTimeout(300);
  await assertFrozen(slowTrial.frame, slowStopped);
  assert.equal(
    await slow.evaluate(() => document.documentElement.scrollWidth),
    375,
  );
  mark('cpu-4x-mobile-operation', {
    simulatedCPUThrottle: 4,
    singleStep: true,
    explicitStart: true,
    parentPause: true,
    noAutoplay: true,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.detach();
  await slow.close();

  // Self-made failure fixture: one extra semicolon invalidates the script's
  // existing CSP hash. The isolated runtime never sends ready.
  const failedContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const failedPage = await failedContext.newPage();
  const expectedFailure = { consoleErrors: [], pageErrors: [] };
  failedPage.on('console', (message) => {
    if (message.type() === 'error')
      expectedFailure.consoleErrors.push(message.text());
  });
  failedPage.on('pageerror', (error) =>
    expectedFailure.pageErrors.push(error.message),
  );
  await failedPage.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== origin) return route.abort();
    if (route.request().url() !== url) return route.continue();
    const response = await route.fetch();
    const html = await response.text();
    let replaced = false;
    const body = html.replace(
      /(<script\b[^>]*\bdata-experiment-runtime\b[^>]*>)([\s\S]*?)(<\/script>)/,
      (_match, start, json, end) => {
        const payload = JSON.parse(json);
        payload.script += '; ';
        replaced = true;
        return start + JSON.stringify(payload).replaceAll('<', '\\u003c') + end;
      },
    );
    assert.equal(replaced, true);
    await route.fulfill({ response, body });
  });
  await failedPage.goto(url, { waitUntil: 'networkidle' });
  const failedCard = failedPage.locator('[data-experiment="motion"]');
  await failedCard.locator('[data-open]').click();
  assert.equal(await failedCard.locator('iframe').count(), 1);
  assert.equal(await failedCard.locator('[data-preview]').isVisible(), true);
  assert.equal(await failedCard.locator('[data-trial]').isHidden(), true);
  await failedPage.waitForTimeout(6500);
  assert.equal(await failedCard.locator('iframe').count(), 0);
  assert.equal(await failedCard.locator('[data-preview]').isVisible(), true);
  assert.match(
    await failedCard.locator('[data-open]').innerText(),
    /もう一度試す/,
  );
  assert.match(await failedCard.locator('[data-status]').innerText(), /静止図/);
  assert.deepEqual(expectedFailure.pageErrors, []);
  assert.ok(
    expectedFailure.consoleErrors.some((message) =>
      /Content Security Policy/.test(message),
    ),
  );
  assert.ok(
    expectedFailure.consoleErrors.every((message) =>
      /Content Security Policy/.test(message),
    ),
  );
  mark('csp-rejected-runtime-timeout-fallback', {
    preservedStaticDrawing: true,
    retryAfter6500ms: true,
    expectedBlockedScriptConsoleErrors: expectedFailure.consoleErrors.length,
  });
  await failedContext.close();

  const nojs = await newPage(375, { javaScriptEnabled: false });
  assert.equal(await nojs.locator('iframe').count(), 0);
  assert.equal(await nojs.locator('[data-preview]').count(), 2);
  assert.equal(await nojs.locator('[data-open]:disabled').count(), 2);
  mark('no-javascript-readable');
  await nojs.close();
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.failedRequests, []);
  await writeFile(
    `${out}/browser-evidence.json`,
    JSON.stringify(report, null, 2),
  );
} catch (error) {
  report.failure = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  await writeFile(
    `${out}/browser-evidence.json`,
    JSON.stringify(report, null, 2),
  );
  throw error;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
