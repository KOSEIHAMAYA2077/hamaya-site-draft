import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DISPLAY_STORAGE_KEY,
  MOTION_STORAGE_KEY,
  defaultDisplayPreferences,
  parseDisplayPreferences,
  readDisplayPreferences,
  saveDisplayPreferences,
  readMotionPreference,
  saveMotionPreference,
} from '../src/workroom/preferences.mjs';

test('表示設定には本文・検索・採用状態を保存せず、破損や未知の形式は既定値に戻す', () => {
  const writes = new Map();
  const storage = {
    getItem: (key) => writes.get(key),
    setItem: (key, value) => writes.set(key, value),
  };
  assert.equal(
    saveDisplayPreferences(
      {
        timeline: false,
        experiments: true,
        body: '保存しない合成文',
        adopted: true,
      },
      storage,
    ),
    true,
  );
  assert.deepEqual(JSON.parse(writes.get(DISPLAY_STORAGE_KEY)), {
    version: 1,
    timeline: false,
    experiments: true,
  });
  assert.equal(saveMotionPreference(true, storage), true);
  assert.deepEqual(
    [...writes.keys()],
    [DISPLAY_STORAGE_KEY, MOTION_STORAGE_KEY],
  );
  assert.equal(readMotionPreference(storage), true);
  assert.equal(readDisplayPreferences(storage).timeline, false);
  for (const raw of [
    '{',
    'null',
    '[]',
    '{"version":2,"timeline":false,"experiments":false}',
    '{"version":1,"timeline":"false","experiments":true}',
    '{"version":1,"timeline":false,"experiments":true,"body":"合成文"}',
    '{"version":1,"timeline":false}',
  ])
    assert.deepEqual(parseDisplayPreferences(raw), defaultDisplayPreferences);
  assert.equal(
    saveDisplayPreferences({ timeline: 'false', experiments: true }, storage),
    false,
  );
  assert.equal(saveMotionPreference('off', storage), false);
});

test('設定の保存が拒否されても読む・移動するための既定値を返す', () => {
  const denied = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  for (const storage of [undefined, denied]) {
    assert.deepEqual(
      readDisplayPreferences(storage),
      defaultDisplayPreferences,
    );
    assert.equal(readMotionPreference(storage), false);
    assert.equal(
      saveDisplayPreferences(defaultDisplayPreferences, storage),
      false,
    );
    assert.equal(saveMotionPreference(true, storage), false);
  }
});
