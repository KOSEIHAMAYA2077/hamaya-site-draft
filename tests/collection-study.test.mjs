import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectionStudy,
  comparisonEnabled,
  comparisonSources,
} from '../src/lib/collection-study.mjs';

const fixture = () =>
  comparisonSources.map((source) => ({
    id: source.id,
    body: '採用待ちの本文',
    data: {
      title: source.name,
      description: source.hasDescription
        ? `確認済みの説明: ${source.name}`
        : '説明は未入力です。',
      repository: source.repository,
      date: '2026-10-03',
      status: '記録',
      role: '未確認の役割',
    },
  }));

test('比較は明示opt-inと確認済み6件に限定し、日付・役割・本文・未知の説明を渡さない', () => {
  for (const value of [undefined, '', 'true', '0', '01'])
    assert.equal(comparisonEnabled(value), false);
  assert.equal(comparisonEnabled('1'), true);
  const entries = fixture();
  entries.push({
    id: 'unverified',
    body: '非公開の本文',
    data: {
      title: '別の下書き',
      description: '未知の説明',
      repository: 'https://example.invalid/',
      date: '2026-10-03',
      status: '記録',
      role: '不明',
    },
  });
  const result = collectionStudy(entries);
  assert.equal(result.length, 6);
  assert.equal(
    result.find((entry) => entry.id === 'import-one-board-incremental')
      .description,
    null,
  );
  for (const entry of result) {
    assert.deepEqual(Object.keys(entry), [
      'id',
      'title',
      'description',
      'repository',
      'relatedNotes',
    ]);
    assert.deepEqual(entry.relatedNotes, []);
  }
  assert.doesNotMatch(
    JSON.stringify(result),
    /2026-10-03|役割|本文|未入力|unverified/,
  );
});

test('未確認URLや不足した元資料は比較に流さない', () => {
  const entries = fixture();
  entries[0].data.repository = 'https://example.invalid/';
  assert.throws(() => collectionStudy(entries), /比較元の確認/);
  assert.throws(() => collectionStudy(fixture().slice(1)), /比較元の確認/);
});

test('関連記録は本人が結び付けた公開記事だけにし、下書きと任意パスを除外する', () => {
  const notes = [
    { id: 'approved-note', data: { title: '確認した学び', draft: false } },
    { id: 'draft-note', data: { title: '採用待ち', draft: true } },
    { id: '../outside', data: { title: '任意パス', draft: false } },
    { id: 'unrelated-note', data: { title: '別の記事', draft: false } },
  ];
  const relationships = {
    'import-typeandsummon': ['approved-note', 'draft-note', '../outside'],
  };
  const result = collectionStudy(fixture(), relationships, notes);
  assert.deepEqual(result[0].relatedNotes, [
    { id: 'approved-note', title: '確認した学び' },
  ]);
  assert.deepEqual(result[1].relatedNotes, []);
});
