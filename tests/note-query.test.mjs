import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NOTE_QUERY_LIMIT,
  normalizeNoteQuery,
  notesListHref,
  noteQueryString,
  readNoteQuery,
  withNoteQuery,
} from '../src/lib/note-query.mjs';

test('URLの日本語・空白・プラス記号を検索条件として往復する', () => {
  const conditions = { q: 'ゲーム C++ と A+B', category: '雑記' };
  const search = noteQueryString(conditions);
  assert.match(search, /C%2B%2B/);
  assert.match(search, /A%2BB/);
  assert.deepEqual(readNoteQuery(search), conditions);
  assert.deepEqual(readNoteQuery(new URLSearchParams(conditions)), conditions);
  assert.equal(noteQueryString({ q: '  ', category: 'all' }), '');
});

test('種類は許可した値だけを使い、不明なキーと重複値を引き継がない', () => {
  assert.deepEqual(
    readNoteQuery('?category=作品&q=first&q=second&tag=private'),
    {
      q: 'first',
      category: 'all',
    },
  );
  assert.equal(
    noteQueryString(readNoteQuery('?category=学び&category=雑記&tag=private')),
    '?category=%E5%AD%A6%E3%81%B3',
  );
  assert.deepEqual(normalizeNoteQuery({ q: 12, category: ['学び'] }), {
    q: '',
    category: 'all',
  });
});

test('検索語の長さを制限し、制御文字を除いてUnicodeを壊さない', () => {
  const result = readNoteQuery(
    new URLSearchParams({ q: ` \u0000ゲーム\n${'📝'.repeat(200)}\u007f ` }),
  );
  assert.equal([...result.q].length, NOTE_QUERY_LIMIT);
  assert.ok(result.q.startsWith('ゲーム '));
  assert.doesNotMatch(result.q, /[\u0000-\u001f\u007f]/);
  assert.deepEqual(readNoteQuery(noteQueryString(result)), result);
  const boundary = normalizeNoteQuery({
    q: `${'a'.repeat(NOTE_QUERY_LIMIT - 1)} trailing`,
  });
  assert.deepEqual(normalizeNoteQuery(boundary), boundary);
});

test('悪意のある戻り先は使わず、固定の一覧へbase付きで戻る', () => {
  const attempts = [
    'https://outside.invalid/',
    '//outside.invalid/',
    '/other-project/notes/',
    '/../../',
    'javascript:alert(1)',
  ];
  for (const returnTo of attempts) {
    const input = new URLSearchParams({
      q: 'ゲーム',
      category: '雑記',
      returnTo,
      return: returnTo,
      next: returnTo,
    });
    const href = notesListHref(input, '/qa-site/');
    const resolved = new URL(href, 'https://local-preview.invalid');
    assert.equal(resolved.origin, 'https://local-preview.invalid');
    assert.equal(resolved.pathname, '/qa-site/notes/');
    assert.deepEqual([...resolved.searchParams.keys()], ['q', 'category']);
    assert.equal(resolved.searchParams.get('q'), 'ゲーム');
    assert.equal(resolved.searchParams.get('category'), '雑記');
  }
  assert.equal(notesListHref('', '/'), '/notes/');
  assert.equal(notesListHref('', '/notes/'), '/notes/notes/');
});

test('記事へのリンクは生成済みの内部パスと許可した検索条件を使う', () => {
  const href = withNoteQuery('/qa-site/notes/game/?old=value#old', {
    q: 'C++ & ゲーム',
    category: '学び',
  });
  const resolved = new URL(href, 'https://local-preview.invalid');
  assert.equal(resolved.pathname, '/qa-site/notes/game/');
  assert.equal(resolved.hash, '');
  assert.deepEqual(readNoteQuery(resolved.search), {
    q: 'C++ & ゲーム',
    category: '学び',
  });
  assert.throws(() => withNoteQuery('//outside.invalid/'), TypeError);
  assert.throws(() => withNoteQuery('https://outside.invalid/'), TypeError);
});
