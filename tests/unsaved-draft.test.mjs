import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDraftHandoffTracker,
  createUnsavedDraftGuard,
} from '../src/lib/unsaved-draft.mjs';

test('download handoff covers its exact input, while later edits need protection again', () => {
  const tracker = createDraftHandoffTracker();
  const entry = (snapshot) => [['writer', snapshot]];
  assert.equal(tracker.hasPending(entry(undefined)), false);
  assert.equal(tracker.hasPending(entry('first draft')), true);
  // Preparing a preview does not call handoff or clear pending input.
  assert.equal(tracker.hasPending(entry('first draft')), true);
  tracker.handoff('writer', 'first draft');
  assert.equal(tracker.hasPending(entry('first draft')), false);
  assert.equal(tracker.hasPending(entry('edited draft')), true);
  assert.equal(tracker.hasPending(entry('first draft')), false);
  assert.equal(tracker.hasPending(entry(undefined)), false);
});

test('a Maker download does not dismiss undownloaded input in other records', () => {
  const tracker = createDraftHandoffTracker();
  const records = new Map([
    ['logs/one', 'one: summary, category, slug'],
    ['ideas/two', 'two: unfinished summary'],
    ['logs/three', undefined],
  ]);
  tracker.handoff('logs/one', records.get('logs/one'));
  assert.equal(tracker.hasPending(records), true);
  tracker.handoff('ideas/two', records.get('ideas/two'));
  assert.equal(tracker.hasPending(records), false);
  records.set('logs/one', 'one: changed summary, category, slug');
  assert.equal(tracker.hasPending(records), true);
});

test('explicit replacement or reset drops handoffs from a previous Maker JSON', () => {
  const tracker = createDraftHandoffTracker();
  tracker.handoff('logs/same-id', 'same inputs');
  tracker.clear();
  assert.equal(tracker.hasPending([]), false);
  assert.equal(tracker.hasPending([['logs/same-id', 'same inputs']]), true);
});

function fakeWindow() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, listener) {
      assert.equal(type, 'beforeunload');
      assert.equal(listeners.has(type), false);
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      assert.equal(listeners.get(type), listener);
      listeners.delete(type);
    },
    leave() {
      const event = {
        prevented: false,
        returnValue: undefined,
        preventDefault() {
          this.prevented = true;
        },
      };
      listeners.get('beforeunload')?.(event);
      return event;
    },
  };
}

test('comparison mode does not register navigation protection', () => {
  const target = fakeWindow();
  const guard = createUnsavedDraftGuard({
    enabled: false,
    target,
    hasUnsaved() {
      assert.fail('an inactive guard should not inspect or copy input');
    },
  });
  guard.refresh();
  guard.dispose();
  assert.equal(target.listeners.size, 0);
  assert.equal(target.leave().prevented, false);
});

test('native leave cancellation preserves inputs and only guards while dirty', () => {
  const target = fakeWindow();
  const tracker = createDraftHandoffTracker();
  let input;
  const guard = createUnsavedDraftGuard({
    enabled: true,
    target,
    hasUnsaved: () => tracker.hasPending([['writer', input]]),
  });
  assert.equal(target.listeners.size, 0);
  input = 'keep this draft';
  guard.refresh();
  guard.refresh();
  assert.equal(target.listeners.size, 1);
  const navigation = target.leave();
  assert.equal(navigation.prevented, true);
  assert.equal(navigation.returnValue, 'unsaved');
  assert.equal(input, 'keep this draft');
  assert.equal(tracker.hasPending([['writer', input]]), true);

  tracker.handoff('writer', input);
  guard.refresh();
  assert.equal(target.listeners.size, 0);
  assert.equal(target.leave().prevented, false);
  input = 'an edit after download';
  guard.refresh();
  assert.equal(target.leave().prevented, true);
  guard.dispose();
  assert.equal(target.listeners.size, 0);
});

test('leave handler rechecks current input instead of relying on a stale dirty flag', () => {
  const target = fakeWindow();
  let dirty = true;
  const guard = createUnsavedDraftGuard({
    enabled: true,
    target,
    hasUnsaved: () => dirty,
  });
  dirty = false;
  assert.equal(target.leave().prevented, false);
  guard.refresh();
  assert.equal(target.listeners.size, 0);
});
