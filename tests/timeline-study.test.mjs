import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  timelineStudy,
  timelineMonths,
  timelineNeighbours,
} from '../src/lib/timeline-study.mjs';

const candidates = JSON.parse(
  await readFile(
    new URL('../src/data/work-candidates.json', import.meta.url),
    'utf8',
  ),
);
const dates = JSON.parse(
  await readFile(
    new URL('../src/data/creation-dates.json', import.meta.url),
    'utf8',
  ),
);

test('確認した9repoを1件ずつ使い、本人の制作日を公開日付から推測しない', () => {
  const entries = timelineStudy(candidates, dates);
  assert.equal(entries.length, 9);
  assert.ok(
    entries.every((entry) => entry.draft && entry.creationDate === null),
  );
  for (const entry of entries) {
    const source = candidates.find((item) => item.id === entry.id);
    assert.equal(entry.publicRecord.at, source.commitDate);
    assert.equal(entry.publicRecord.date, source.commitDate.slice(0, 10));
    assert.equal(entry.publicRecord.verifiedAt, source.verifiedAt);
    assert.equal(entry.publicRecord.kind, 'commit-committer');
    assert.equal(
      entry.publicRecord.url,
      `${source.repositoryUrl}/commit/${source.commit}`,
    );
    assert.equal(entry.title, source.title);
    assert.equal(entry.summary, source.summary);
  }
});

test('同じUTC日は全件残し、索引用ID順で安定し、未来側への循環を作らない', () => {
  const entries = timelineStudy(candidates);
  assert.deepEqual(entries, timelineStudy([...candidates].reverse()));
  const july = entries.filter(
    (entry) => entry.publicRecord.date === '2026-07-29',
  );
  assert.deepEqual(
    july.map((entry) => entry.id),
    ['de10-nano-riscv-invader', 'pong-study-raylib', 'typeandsummon'],
  );
  assert.equal(
    entries.filter((entry) => entry.publicRecord.date === '2026-09-06').length,
    2,
  );
  assert.deepEqual(
    timelineMonths(entries).map((group) => group.month),
    ['2026-07', '2026-08', '2026-09', '2026-10'],
  );
  assert.equal(timelineNeighbours(entries, entries[0].id).previous, null);
  assert.equal(timelineNeighbours(entries, entries.at(-1).id).next, null);
  for (let index = 1; index < entries.length - 1; index++) {
    assert.equal(
      timelineNeighbours(entries, entries[index].id).previous.id,
      entries[index - 1].id,
    );
    assert.equal(
      timelineNeighbours(entries, entries[index].id).next.id,
      entries[index + 1].id,
    );
  }
});

test('本人が入れた制作日を独立して保持し、公開記録の順序を変えない', () => {
  const original = timelineStudy(candidates);
  const withDate = timelineStudy(candidates, {
    'glyph-matter': '2024-02-29',
    typeandsummon: null,
  });
  assert.deepEqual(
    withDate.map((entry) => entry.id),
    original.map((entry) => entry.id),
  );
  assert.equal(
    withDate.find((entry) => entry.id === 'glyph-matter').creationDate,
    '2024-02-29',
  );
  assert.equal(
    withDate.find((entry) => entry.id === 'glyph-matter').publicRecord.date,
    '2026-10-03',
  );
  assert.ok(
    withDate
      .filter((entry) => entry.id !== 'glyph-matter')
      .every((entry) => entry.creationDate === null),
  );
});

test('空の資料では空のまま返し、月・日・近隣の記録を補完しない', () => {
  assert.deepEqual(timelineStudy([]), []);
  assert.deepEqual(timelineMonths([]), []);
  assert.deepEqual(timelineNeighbours([], 'unknown'), {
    previous: null,
    next: null,
  });
  assert.deepEqual(timelineNeighbours(timelineStudy(candidates), 'unknown'), {
    previous: null,
    next: null,
  });
});

test('未確認ID・日付の丸め・重複・不正データを静かな空状態に変換しない', () => {
  for (const value of [
    '2025-02-29',
    '2026-04-31',
    '2026-1-1',
    '',
    12,
    undefined,
  ])
    assert.throws(() => timelineStudy(candidates, { 'glyph-matter': value }));
  assert.throws(() => timelineStudy(candidates, { unknown: '2026-10-04' }));
  assert.throws(() => timelineStudy(candidates, []));
  assert.throws(() => timelineStudy(candidates, null));
  assert.throws(() => timelineStudy(null));
  assert.throws(() => timelineStudy([...candidates, candidates[0]]));
  for (const at of [
    '2026-02-30T00:00:00Z',
    '2026-10-03T25:00:00Z',
    '2026-10-03',
    '2026-10-03T10:23:41+09:00',
  ])
    assert.throws(() => timelineStudy([{ ...candidates[0], commitDate: at }]));
});
