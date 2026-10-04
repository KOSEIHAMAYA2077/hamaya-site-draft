import assert from 'node:assert/strict';
import test from 'node:test';
import { comparisonSources } from '../src/lib/collection-study.mjs';
import { WORKROOM_NOTE_IDS } from '../src/lib/workroom-notes.mjs';
import {
  RETURN_STORAGE_KEY,
  RETURN_STORAGE_LIMIT,
  RETURN_IDS,
  readReturnState,
  enableReturnState,
  rememberReturnItem,
  clearReturnState,
  returnHref,
} from '../src/workroom/return-state.mjs';

const empty = { enabled: false, work: null, note: null };
const work = RETURN_IDS.work[0];
const secondWork = RETURN_IDS.work[1];
const note = RETURN_IDS.note[0];
const active = () => ({ enabled: true, work, note });

function fixture(raw) {
  const values = new Map();
  if (raw !== undefined) values.set(RETURN_STORAGE_KEY, raw);
  const writes = [];
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
  return { values, writes, storage };
}

test('再開先は確認済み6作品と明示した1記録のIDだけに固定する', () => {
  assert.deepEqual(
    RETURN_IDS.work,
    comparisonSources.map(({ id }) => id),
  );
  assert.deepEqual(RETURN_IDS.note, WORKROOM_NOTE_IDS);
  assert.deepEqual(Object.keys(RETURN_IDS), ['work', 'note']);
  assert.throws(() => RETURN_IDS.work.push('unknown'), TypeError);
  assert.throws(() => (RETURN_IDS.note = ['unknown']), TypeError);
});

test('初回と読取は保存せず、有効化後も本文や初期表示のIDを自動で入れない', () => {
  const { storage, values, writes } = fixture();
  assert.deepEqual(readReturnState(storage), {
    ok: true,
    state: empty,
    error: null,
  });
  assert.equal(rememberReturnItem('work', work, storage).error, 'disabled');
  assert.deepEqual(writes, []);
  const enabled = enableReturnState(storage);
  assert.deepEqual(enabled.state, { ...empty, enabled: true });
  assert.equal(enabled.ok, true);
  assert.deepEqual(JSON.parse(values.get(RETURN_STORAGE_KEY)), {
    enabled: true,
    work: null,
    note: null,
  });
  const before = writes.length;
  readReturnState(storage);
  assert.equal(writes.length, before);
});

test('明示的な選択はその種類の最新IDだけを置き換え、他の種類は保つ', () => {
  const { storage, values } = fixture();
  enableReturnState(storage);
  assert.equal(rememberReturnItem('work', work, storage).ok, true);
  assert.equal(rememberReturnItem('note', note, storage).ok, true);
  assert.deepEqual(readReturnState(storage).state, active());
  assert.equal(rememberReturnItem('work', secondWork, storage).ok, true);
  assert.deepEqual(JSON.parse(values.get(RETURN_STORAGE_KEY)), {
    enabled: true,
    work: secondWork,
    note,
  });
  assert.deepEqual([...values.keys()], [RETURN_STORAGE_KEY]);
  assert.deepEqual(Object.keys(JSON.parse(values.get(RETURN_STORAGE_KEY))), [
    'enabled',
    'work',
    'note',
  ]);
});

test('未知の種類、URL、本文、検索語、別種類のIDは保存しない', () => {
  const { storage, writes } = fixture(JSON.stringify(active()));
  for (const [kind, id] of [
    ['experiment', 'motion'],
    ['url', 'https://outside.invalid/'],
    ['work', 'https://outside.invalid/'],
    ['work', `${work}?q=合成検索語`],
    ['work', note],
    ['note', work],
    ['note', 'unknown'],
    ['note', { body: '保存しない合成本文' }],
    ['work', null],
    ['__proto__', work],
    [undefined, work],
  ]) {
    const result = rememberReturnItem(kind, id, storage);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'invalid');
    assert.deepEqual(result.state, active());
  }
  assert.deepEqual(writes, []);
});

test('壊れた値・旧形式・余分な情報・型違い・上限超過は無書込で無効扱いにする', () => {
  const invalid = [
    '{',
    'null',
    '[]',
    'true',
    '1',
    '{}',
    JSON.stringify({ ...active(), enabled: false }),
    JSON.stringify({ ...active(), enabled: 'true' }),
    JSON.stringify({ ...active(), enabled: 1 }),
    JSON.stringify({ enabled: true, work }),
    JSON.stringify({ ...active(), note: 4 }),
    JSON.stringify({ ...active(), work: { id: work } }),
    JSON.stringify({ ...active(), version: 0 }),
    JSON.stringify({ ...active(), experiment: 'motion' }),
    JSON.stringify({ ...active(), body: '保存しない合成本文' }),
    JSON.stringify({ ...active(), query: '保存しない合成検索語' }),
    JSON.stringify({ ...active(), timestamp: 0 }),
    `{"enabled":true,"work":null,"note":null,"__proto__":{}}`,
    `${' '.repeat(RETURN_STORAGE_LIMIT)}${JSON.stringify(active())}`,
  ];
  for (const raw of invalid) {
    const { storage, writes, values } = fixture(raw);
    assert.deepEqual(readReturnState(storage), {
      ok: true,
      state: empty,
      error: null,
    });
    assert.equal(rememberReturnItem('work', work, storage).error, 'disabled');
    assert.deepEqual(writes, []);
    assert.equal(values.get(RETURN_STORAGE_KEY), raw);
  }
});

test('catalogから消えたIDは空表示にし、残るIDを保って安全なURLだけ作る', () => {
  const { storage, values, writes } = fixture(
    JSON.stringify({ enabled: true, work: 'removed-work', note }),
  );
  assert.deepEqual(readReturnState(storage).state, {
    enabled: true,
    work: null,
    note,
  });
  assert.deepEqual(writes, []);
  assert.equal(returnHref('work', 'removed-work'), null);
  rememberReturnItem('work', work, storage);
  assert.deepEqual(JSON.parse(values.get(RETURN_STORAGE_KEY)), active());
});

test('別タブの選択を最新値から引き継ぎ、削除後の古いタブ操作は履歴を復活させない', () => {
  const { storage, writes, values } = fixture(JSON.stringify(active()));
  const oldTabSnapshot = readReturnState(storage).state;
  rememberReturnItem('work', secondWork, storage);
  rememberReturnItem('note', note, storage);
  assert.equal(readReturnState(storage).state.work, secondWork);
  clearReturnState(storage);
  const countAfterClear = writes.length;
  const staleAction = rememberReturnItem('work', oldTabSnapshot.work, storage);
  assert.equal(staleAction.error, 'disabled');
  assert.deepEqual(staleAction.state, empty);
  assert.equal(writes.length, countAfterClear);
  assert.equal(values.has(RETURN_STORAGE_KEY), false);
  // Reading while handling storage/pageshow is deliberately not a write.
  assert.deepEqual(readReturnState(storage).state, empty);
  assert.equal(writes.length, countAfterClear);
});

test('削除は専用keyだけを消して無効化し、再有効化は空から始まる', () => {
  const { storage, values } = fixture(JSON.stringify(active()));
  values.set('archive-motion', 'off');
  values.set('unrelated', 'keep');
  assert.deepEqual(clearReturnState(storage), {
    ok: true,
    state: empty,
    error: null,
  });
  assert.equal(values.get('archive-motion'), 'off');
  assert.equal(values.get('unrelated'), 'keep');
  assert.equal(values.has(RETURN_STORAGE_KEY), false);
  assert.deepEqual(enableReturnState(storage).state, {
    ...empty,
    enabled: true,
  });
  rememberReturnItem('note', note, storage);
  assert.deepEqual(enableReturnState(storage).state, {
    ...empty,
    enabled: true,
  });
});

test('読取拒否は無効状態を返し、書込や削除の失敗は残る保存状態を成功扱いしない', () => {
  const denied = () => {
    throw new Error('storage denied');
  };
  for (const storage of [
    undefined,
    null,
    { getItem: denied, setItem: denied, removeItem: denied },
  ]) {
    for (const result of [
      readReturnState(storage),
      enableReturnState(storage),
      rememberReturnItem('work', work, storage),
      clearReturnState(storage),
    ]) {
      assert.equal(result.ok, false);
      assert.equal(result.error, 'storage');
      assert.deepEqual(result.state, empty);
    }
  }
  const { storage, values } = fixture(JSON.stringify(active()));
  const readOnly = { ...storage, setItem: denied, removeItem: denied };
  for (const result of [
    enableReturnState(readOnly),
    rememberReturnItem('work', secondWork, readOnly),
    clearReturnState(readOnly),
  ]) {
    assert.equal(result.ok, false);
    assert.equal(result.error, 'storage');
    assert.deepEqual(result.state, active());
    assert.deepEqual(JSON.parse(values.get(RETURN_STORAGE_KEY)), active());
  }
});

test('戻り先URLは固定IDからroot/base両方で作り、任意URLや危険なbaseを拒否する', () => {
  assert.equal(returnHref('work', work), `/#piece-${work}`);
  assert.equal(returnHref('note', note), `/room/notes/${note}/`);
  for (const base of ['/hamaya-site-draft', '/hamaya-site-draft/']) {
    assert.equal(
      returnHref('work', work, base),
      `/hamaya-site-draft/#piece-${work}`,
    );
    assert.equal(
      returnHref('note', note, base),
      `/hamaya-site-draft/room/notes/${note}/`,
    );
  }
  assert.equal(returnHref('work', work, ''), `/#piece-${work}`);
  assert.equal(
    returnHref('work', work, '/nested/preview/'),
    `/nested/preview/#piece-${work}`,
  );
  for (const base of [
    'https://outside.invalid',
    '//outside.invalid',
    '/\\outside.invalid',
    '/a/../b/',
    '/a/./b/',
    '/a/%2e%2e/b/',
    '/a//b/',
    '/?q=private',
    '/#hash',
    '/\n',
    `/${'x'.repeat(513)}`,
    undefined,
    null,
  ]) {
    if (base === undefined) continue; // Omitted base intentionally means root.
    assert.equal(returnHref('work', work, base), null);
  }
  assert.equal(returnHref('experiment', 'motion'), null);
  assert.equal(returnHref('work', 'https://outside.invalid/'), null);
  assert.equal(returnHref('note', work), null);
});
