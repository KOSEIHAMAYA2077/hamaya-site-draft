import assert from 'node:assert/strict';
import test from 'node:test';
import { setupReturnEntry } from '../src/workroom/return-controller.mjs';
import {
  RETURN_IDS,
  RETURN_STORAGE_KEY,
  clearReturnState,
  readReturnState,
} from '../src/workroom/return-state.mjs';

// Small DOM fixture for actual delegated click listeners. It implements the
// attribute/tag/ancestor selectors used by the controller, not navigation.
class ElementFixture {
  constructor(tag, attributes = {}, parent = null) {
    this.tag = tag;
    this.attributes = attributes;
    this.parent = parent;
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  matches(token) {
    const match = token.match(/^(\w+)?\[([\w-]+)\]$/);
    return Boolean(
      match &&
      (!match[1] || this.tag === match[1]) &&
      Object.hasOwn(this.attributes, match[2]),
    );
  }
  closest(selector) {
    for (let element = this; element; element = element.parent) {
      for (const candidate of selector.split(',')) {
        const [target, ...ancestors] = candidate.trim().split(/\s+/).reverse();
        if (!element.matches(target)) continue;
        let ancestor = element.parent;
        for (const token of ancestors) {
          while (ancestor && !ancestor.matches(token))
            ancestor = ancestor.parent;
          if (!ancestor) break;
        }
        if (!ancestors.length || ancestor) return element;
      }
    }
    return null;
  }
}

function fixture(t, enabled = false) {
  const values = new Map();
  const writes = [];
  if (enabled)
    values.set(
      RETURN_STORAGE_KEY,
      JSON.stringify({ enabled: true, work: null, note: RETURN_IDS.note[0] }),
    );
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      writes.push(['set', key, value]);
      values.set(key, value);
    },
    removeItem: (key) => {
      writes.push(['remove', key]);
      values.delete(key);
    },
  };
  const documentEvents = new Map();
  const windowEvents = new Map();
  const globals = {
    Element: ElementFixture,
    document: {
      querySelector: (selector) =>
        selector === '[data-return-error]' ? {} : null,
      addEventListener: (type, listener) => documentEvents.set(type, listener),
    },
    window: {
      localStorage: storage,
      addEventListener: (type, listener) => windowEvents.set(type, listener),
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
  }
  setupReturnEntry('/qa-site/');
  return {
    storage,
    values,
    writes,
    dispatch: (target, type = 'click', button = 0) =>
      documentEvents.get(type)({ target, type, button }),
    restore: () => windowEvents.get('pageshow')(),
  };
}

function workLink(id, href = 'https://github.com/example/fixture') {
  const anchor = new ElementFixture('a', { 'data-return-work-id': id, href });
  return new ElementFixture('span', {}, anchor);
}

test('SimpleWorksの初回クリックは保存OFFのままで、書き込みを行わない', (t) => {
  const { dispatch, storage, writes } = fixture(t);
  dispatch(workLink(RETURN_IDS.work[0]));
  assert.deepEqual(writes, []);
  assert.deepEqual(readReturnState(storage).state, {
    enabled: false,
    work: null,
    note: null,
  });
});

test('保存ONの作品リンクは許可済み6IDだけを記録し、URLや本文を保存しない', (t) => {
  const { dispatch, values, writes } = fixture(t, true);
  for (const [index, id] of RETURN_IDS.work.entries()) {
    dispatch(
      workLink(
        id,
        index % 2
          ? '/qa-site/works/fixture/'
          : 'https://github.com/example/fixture',
      ),
      index % 2 ? 'auxclick' : 'click',
      index % 2 ? 1 : 0,
    );
    assert.deepEqual(JSON.parse(values.get(RETURN_STORAGE_KEY)), {
      enabled: true,
      work: id,
      note: RETURN_IDS.note[0],
    });
  }
  assert.equal(writes.length, 6);
  assert.deepEqual([...values.keys()], [RETURN_STORAGE_KEY]);
});

test('未知ID・通常のリンク・右クリック・リンク以外のマーカーを記録しない', (t) => {
  const { dispatch, writes } = fixture(t, true);
  for (const id of [
    'unknown',
    '',
    RETURN_IDS.note[0],
    'https://outside.invalid/',
  ])
    dispatch(workLink(id));
  dispatch(
    new ElementFixture('a', { href: 'https://github.com/example/fixture' }),
  );
  dispatch(workLink(RETURN_IDS.work[0]), 'click', 2);
  dispatch(workLink(RETURN_IDS.work[0]), 'auxclick', 0);
  dispatch(
    new ElementFixture('div', { 'data-return-work-id': RETURN_IDS.work[0] }),
  );
  dispatch({});
  assert.deepEqual(writes, []);
});

test('従来Focusの選択も保ち、別タブで保存を消した後は履歴を復活させない', (t) => {
  const { dispatch, restore, storage, writes } = fixture(t, true);
  const focus = new ElementFixture('section', { 'data-focus-study': '' });
  const choice = new ElementFixture(
    'a',
    { 'data-focus-choice': RETURN_IDS.work[1] },
    focus,
  );
  dispatch(new ElementFixture('span', {}, choice));
  assert.equal(readReturnState(storage).state.work, RETURN_IDS.work[1]);
  clearReturnState(storage);
  const writesAfterClear = writes.length;
  restore();
  dispatch(workLink(RETURN_IDS.work[0]));
  assert.equal(writes.length, writesAfterClear);
  assert.equal(readReturnState(storage).state.enabled, false);
});
