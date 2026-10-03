import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectionStudy,
  comparisonSources,
} from '../src/lib/collection-study.mjs';
import { focusStudy } from '../src/lib/focus-study.mjs';

const works = () =>
  comparisonSources.map((source) => ({
    id: source.id,
    body: '未確認の制作本文',
    data: {
      title: source.name,
      description: `確認済みの説明: ${source.name}`,
      repository: source.repository,
      date: '2026-10-03',
      role: '未確認の担当',
    },
  }));

test('focusも確認済みの制作と関連付けだけを引き継ぎ、記事本文から抜粋を作らない', () => {
  const entries = works();
  assert.deepEqual(focusStudy(entries), collectionStudy(entries));
  const notes = [
    {
      id: 'approved-note',
      body: '公開記事でも本文は渡さない',
      data: {
        title: '確認した記録',
        draft: false,
        description: '本人が記入した記事の説明。',
        date: '2026-10-03',
        url: 'https://example.invalid/private',
      },
    },
    {
      id: 'draft-note',
      data: { title: '未採用記事', draft: true, description: '下書きの説明' },
    },
    {
      id: '../outside',
      data: { title: '任意パス', draft: false, description: 'パス外の説明' },
    },
    {
      id: 'unrelated-note',
      data: { title: '別の記事', draft: false, description: '無関係の説明' },
    },
  ];
  const result = focusStudy(
    entries,
    { 'import-typeandsummon': ['approved-note', 'draft-note', '../outside'] },
    notes,
  );
  assert.deepEqual(result[0].relatedNotes, [
    {
      id: 'approved-note',
      title: '確認した記録',
      excerpt: '本人が記入した記事の説明。',
    },
  ]);
  assert.deepEqual(result[1].relatedNotes, []);
  assert.doesNotMatch(
    JSON.stringify(result),
    /本文|担当|2026-10-03|example\.invalid|下書きの説明|パス外の説明|無関係の説明/,
  );
});

test('記事の順序と元の説明を保ち、説明がない場合はnullにする', () => {
  const notes = [
    {
      id: 'first-note',
      body: '説明の代用にしてはいけない本文',
      data: { title: '先頭の記録', draft: false },
    },
    {
      id: 'second-note',
      data: { title: '次の記録', draft: false, description: '  元の説明。  ' },
    },
    {
      id: 'empty-note',
      data: { title: '説明が空の記録', draft: false, description: '' },
    },
  ];
  const result = focusStudy(
    works(),
    { 'import-typeandsummon': ['second-note', 'empty-note', 'first-note'] },
    notes,
  );
  assert.deepEqual(result[0].relatedNotes, [
    { id: 'first-note', title: '先頭の記録', excerpt: null },
    { id: 'second-note', title: '次の記録', excerpt: '  元の説明。  ' },
    { id: 'empty-note', title: '説明が空の記録', excerpt: null },
  ]);
});
