import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import '../src/experiments/vendor/action-clock/model.test.mjs';
import '../src/experiments/vendor/motion-reaction/model.test.mjs';
import {
  experimentDocuments,
  packExperimentDocuments,
} from '../src/experiments/documents.mjs';

const root = new URL('../src/experiments/', import.meta.url);
test('Selected private model copies match the recorded source commit and SHA256', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('source-manifest.json', root), 'utf8'),
  );
  assert.equal(
    manifest.sourceCommit,
    '5817d62483371c810bff7546b8277e7f2f806ce0',
  );
  assert.equal(manifest.files.length, 4);
  for (const file of manifest.files) {
    assert.match(
      file.copy,
      /^vendor\/(action-clock|motion-reaction)\/model(?:\.test)?\.mjs$/,
    );
    const bytes = await readFile(new URL(file.copy, root));
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      file.sha256,
      file.copy,
    );
  }
  assert.deepEqual(manifest.thirdPartyRuntimeDependencies, []);
});

test('Each isolated document contains one hashed script and style with no network or source maps', async () => {
  const documents = await experimentDocuments();
  assert.deepEqual(Object.keys(documents), ['motion', 'clock']);
  for (const [id, html] of Object.entries(documents)) {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
    assert.equal(scripts.length, 1);
    assert.equal(styles.length, 1);
    for (const [tag, contents] of [
      ['script', scripts[0][1]],
      ['style', styles[0][1]],
    ]) {
      const hash = createHash('sha256').update(contents).digest('base64');
      assert.ok(html.includes(`${tag}-src 'sha256-${hash}'`));
    }
    assert.ok(html.includes("default-src 'none'"));
    assert.ok(html.includes("connect-src 'none'"));
    assert.ok(html.includes("base-uri 'none'"));
    assert.ok(html.includes("form-action 'none'"));
    assert.ok(html.includes(`data-experiment="${id}" data-running="false"`));
    assert.doesNotMatch(
      html,
      /(?:src|href)\s*=|sourceMappingURL|\/Users\/|\/private\/tmp\//,
    );
  }
});

test('Packed documents restore byte-for-byte with one shared runtime and reject ambiguous script boundaries', async () => {
  const documents = await experimentDocuments();
  const packed = packExperimentDocuments(documents);
  assert.ok(packed.script.length > 1000);
  for (const id of ['motion', 'clock']) {
    const parts = packed.documents[id].split(packed.placeholder);
    assert.equal(parts.length, 2);
    assert.ok(parts[0].endsWith('<script>'));
    assert.ok(parts[1].startsWith('</script>'));
    const restored = parts[0] + packed.script + parts[1];
    assert.equal(restored, documents[id]);
    assert.equal(
      createHash('sha256').update(restored).digest('hex'),
      createHash('sha256').update(documents[id]).digest('hex'),
    );
    assert.ok(!packed.documents[id].includes(packed.script));
  }
  const escaped = JSON.stringify({
    script: packed.script,
    placeholder: packed.placeholder,
  }).replaceAll('<', '\\u003c');
  assert.doesNotMatch(escaped, /</);
  assert.equal(JSON.parse(escaped).script, packed.script);
  const corruptions = [
    documents.motion + packed.placeholder,
    documents.motion.replace('<script>', '<script type="module">'),
    documents.motion + '<script>extra</script>',
    documents.motion.replace('</script>', '</script><script>extra</script>'),
    documents.motion.replace('script-src', 'invalid-src'),
    documents.motion.replace(
      '</script>',
      '//# sourceMappingURL=private.map\n</script>',
    ),
  ];
  for (const motion of corruptions)
    assert.throws(() => packExperimentDocuments({ ...documents, motion }));
  const alteredScript = packed.script + '\n';
  const hash = (value) => createHash('sha256').update(value).digest('base64');
  const changedClock = documents.clock
    .replace(packed.script, () => alteredScript)
    .replace(hash(packed.script), hash(alteredScript));
  assert.throws(
    () => packExperimentDocuments({ ...documents, clock: changedClock }),
    /same runtime/,
  );
});

// Exercise the emitted IIFE with deterministic browser primitives; real layout and
// frame messaging are checked separately in the browser, not inferred from this harness.
async function runtimeHarness(id, { canvasAvailable = true } = {}) {
  const messages = [];
  const scheduled = new Map();
  const writes = new Map();
  let now = 1000;
  let sequence = 0;
  let canvasCalls = 0;
  function count(name) {
    writes.set(name, (writes.get(name) || 0) + 1);
  }
  function target(name, dataset = {}) {
    const handlers = new Map();
    const attributes = new Map();
    const captured = new Set();
    let text = '';
    return {
      dataset: new Proxy(dataset, {
        set(object, key, value) {
          count(`${name}.data.${String(key)}`);
          object[key] = value;
          return true;
        },
      }),
      get textContent() {
        return text;
      },
      set textContent(value) {
        count(`${name}.text`);
        text = value;
      },
      addEventListener(type, listener) {
        const list = handlers.get(type) || [];
        list.push(listener);
        handlers.set(type, list);
      },
      emit(type, details = {}) {
        for (const listener of handlers.get(type) || [])
          listener({ target: this, preventDefault() {}, ...details });
      },
      setAttribute(key, value) {
        count(`${name}.attr.${key}`);
        attributes.set(key, value);
      },
      getAttribute(key) {
        return attributes.get(key) ?? null;
      },
      removeAttribute(key) {
        attributes.delete(key);
      },
      closest() {
        return null;
      },
      focus() {},
      setPointerCapture(pointerId) {
        captured.add(pointerId);
      },
      hasPointerCapture(pointerId) {
        return captured.has(pointerId);
      },
      releasePointerCapture(pointerId) {
        captured.delete(pointerId);
      },
    };
  }
  const elements = new Map(
    [
      'canvas',
      '#mode',
      '#preset',
      '#pause',
      '#experiment-state',
      '#status',
      '#stats',
      '#reset',
      '#replay',
      '#step',
    ].map((name) => [name, target(name)]),
  );
  elements.get('#mode').value = id === 'clock' ? 'movement' : 'generated';
  elements.get('#preset').value = 'short';
  const directionButtons = (
    id === 'clock' ? ['left', 'right', 'up', 'down'] : ['left', 'right']
  ).map((direction) => target(direction, { direction }));
  const context = new Proxy(
    {},
    {
      get(object, key) {
        return (
          object[key] ??
          (() => {
            canvasCalls += 1;
          })
        );
      },
    },
  );
  Object.assign(elements.get('canvas'), {
    width: 700,
    height: id === 'clock' ? 410 : 290,
    getContext: () => (canvasAvailable ? context : null),
  });
  const document = Object.assign(target('document'), {
    body: Object.assign(
      target('body', { experiment: id, running: 'false', frameCount: '0' }),
      { scrollHeight: 620 },
    ),
    hidden: false,
    querySelector: (selector) =>
      id === 'motion' && selector === '#preset' ? null : elements.get(selector),
    querySelectorAll: () => directionButtons,
  });
  const window = target('window');
  const parent = { postMessage: (message) => messages.push(message) };
  const html = (await experimentDocuments())[id];
  runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
    document,
    window,
    parent,
    performance: { now: () => now },
    requestAnimationFrame: (callback) => {
      const token = ++sequence;
      scheduled.set(token, callback);
      return token;
    },
    cancelAnimationFrame: (token) => scheduled.delete(token),
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback;
      }
      observe() {
        this.callback();
      }
    },
  });
  return {
    document,
    window,
    elements,
    directionButtons,
    messages,
    writes,
    scheduled,
    canvasCalls: () => canvasCalls,
    state: () => JSON.parse(elements.get('#experiment-state').textContent),
    availability: (available) =>
      window.emit('message', {
        source: parent,
        data: { type: 'experiment:availability', available },
      }),
    frame: (time) => {
      now = time;
      const callbacks = [...scheduled.values()];
      scheduled.clear();
      for (const callback of callbacks) callback(time);
    },
    click: (selector) => elements.get(selector).emit('click', { detail: 0 }),
    key: (type, key, extra = {}) => document.emit(type, { key, ...extra }),
  };
}

function attemptInputs(harness) {
  for (const selector of ['#pause', '#step', '#replay'])
    harness.click(selector);
  harness.key('keydown', 'ArrowRight');
  harness.key('keyup', 'ArrowRight');
  for (const button of harness.directionButtons) {
    button.emit('pointerdown', { button: 0, pointerId: 7 });
    button.emit('pointerup', { pointerId: 7 });
    button.emit('click', { detail: 0 });
  }
}

for (const id of ['motion', 'clock']) {
  test(`${id}: unavailable inputs cannot change the model, and returning visible requires a new action`, async () => {
    const h = await runtimeHarness(id);
    assert.ok(h.messages.some(({ type }) => type === 'experiment:ready'));
    const initial = h.state();
    attemptInputs(h);
    assert.deepEqual(h.state(), initial);
    assert.equal(h.scheduled.size, 0);
    h.availability(true);
    h.click('#step');
    assert.equal(h.state().frameCount, 1);
    h.click('#replay');
    h.frame(1016);
    h.frame(1032);
    assert.equal(h.state().running, true);
    assert.ok(h.state().frameCount > 0);
    h.availability(false);
    const stopped = h.state();
    assert.equal(stopped.running, false);
    assert.equal(h.scheduled.size, 0);
    attemptInputs(h);
    h.frame(1100);
    assert.deepEqual(h.state(), stopped);
    h.availability(true);
    h.frame(1200);
    assert.deepEqual(h.state(), stopped);
    assert.equal(h.scheduled.size, 0);
    h.key('keydown', 'D');
    h.frame(1216);
    h.frame(1232);
    assert.ok(h.state().frameCount > stopped.frameCount);
    h.key('keyup', 'd');
    h.click('#pause');
    assert.deepEqual(h.state().activeDirections, []);
    assert.equal(h.scheduled.size, 0);
  });

  test(`${id}: hidden/pagehide cancel work, ordinary frames skip invariant DOM writes, and the 12 second cap remains`, async () => {
    const h = await runtimeHarness(id);
    h.availability(true);
    h.key('keydown', 'ArrowRight');
    const invariants = [
      'body.data.running',
      '#pause.text',
      '#pause.attr.aria-label',
    ];
    const before = invariants.map((name) => h.writes.get(name));
    h.frame(1016);
    h.frame(1032);
    h.frame(1048);
    assert.deepEqual(
      invariants.map((name) => h.writes.get(name)),
      before,
    );
    const count = h.state().frameCount;
    h.document.hidden = true;
    h.frame(1064);
    assert.equal(h.state().frameCount, count);
    assert.equal(h.state().running, false);
    assert.equal(h.scheduled.size, 0);
    h.document.emit('visibilitychange');
    const hidden = h.state();
    attemptInputs(h);
    assert.deepEqual(h.state(), hidden);
    h.document.hidden = false;
    h.document.emit('visibilitychange');
    h.availability(true);
    assert.equal(h.scheduled.size, 0);
    h.key('keydown', 'ArrowRight');
    h.window.emit('pagehide');
    h.availability(true); // A late parent message must not override pagehide.
    const away = h.state();
    attemptInputs(h);
    assert.deepEqual(h.state(), away);
    assert.equal(h.scheduled.size, 0);
    h.window.emit('pageshow');
    h.availability(true);
    assert.equal(h.scheduled.size, 0);
    h.key('keydown', 'ArrowRight');
    h.frame(13064);
    assert.equal(h.state().reason, 'limit');
    assert.equal(h.scheduled.size, 0);
    const calls = h.canvasCalls();
    h.frame(14000);
    assert.equal(h.canvasCalls(), calls);
  });
}

test('Canvas initialization failure reports an error without ready or a scheduled frame', async () => {
  const h = await runtimeHarness('motion', { canvasAvailable: false });
  assert.deepEqual(
    h.messages.map(({ type }) => type),
    ['experiment:error'],
  );
  assert.equal(h.scheduled.size, 0);
  assert.equal(h.canvasCalls(), 0);
});
