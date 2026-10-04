import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WORKROOM_NOTE_IDS,
  workroomNotes,
} from '../src/lib/workroom-notes.mjs';
import { workroomNotesListHref } from '../src/lib/workroom-note-query.mjs';

test('ローカル記録は明示した原文だけを含み、新しい下書きや公開フラグで対象を増やさない', () => {
  const original = Object.freeze({
    id: 'legacy-cyberpunk2077-1',
    collection: 'notes',
    data: Object.freeze({
      title: '原文の題',
      description: '原文の説明',
      date: '2026-07-30',
      tags: Object.freeze(['原文のタグ']),
      draft: true,
    }),
    body: '原文の本文',
  });
  const entries = Object.freeze([
    { ...original, id: '_example' },
    original,
    { ...original, id: 'new-draft' },
    {
      ...original,
      id: 'new-published',
      data: { ...original.data, draft: false },
    },
    { ...original, collection: 'works' },
  ]);
  const selected = workroomNotes(entries);
  assert.deepEqual(WORKROOM_NOTE_IDS, ['legacy-cyberpunk2077-1']);
  assert.deepEqual(selected, [original]);
  assert.equal(selected[0], original);
  assert.equal(selected[0].data.draft, true);
  assert.equal(entries.length, 5);
  assert.deepEqual(workroomNotes([]), []);
  assert.throws(() => WORKROOM_NOTE_IDS.push('new-draft'), TypeError);
});

test('ローカル記録の戻り先は固定し、検索語と記事の種類だけを引き継ぐ', () => {
  const params = new URLSearchParams({
    q: 'C++ と ゲーム',
    category: '雑記',
    returnTo: 'https://outside.invalid/',
    next: '/notes/',
    draft: 'false',
  });
  const href = workroomNotesListHref(params, '/hamaya-site-draft/');
  const resolved = new URL(href, 'https://local-preview.invalid');
  assert.equal(resolved.origin, 'https://local-preview.invalid');
  assert.equal(resolved.pathname, '/hamaya-site-draft/room/notes/');
  assert.deepEqual([...resolved.searchParams.keys()], ['q', 'category']);
  assert.equal(resolved.searchParams.get('q'), 'C++ と ゲーム');
  assert.equal(resolved.searchParams.get('category'), '雑記');
  assert.equal(workroomNotesListHref('', '/'), '/room/notes/');
  assert.equal(
    workroomNotesListHref(
      '?category=not-allowed&return=//outside.invalid',
      '/qa',
    ),
    '/qa/room/notes/',
  );
});
