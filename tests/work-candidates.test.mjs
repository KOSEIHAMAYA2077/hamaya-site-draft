import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseWorkCandidates } from '../src/lib/work-candidates.mjs';
import { candidateSelection } from '../src/lib/candidate-selection.mjs';

const entries = JSON.parse(
  await readFile(
    new URL('../src/data/work-candidates.json', import.meta.url),
    'utf8',
  ),
);
const sample = () => structuredClone(entries[0]);

test('公開9repoの候補は全て採否未定で、実行済み作品として認定しない', () => {
  const parsed = parseWorkCandidates(entries);
  assert.equal(parsed.length, 9);
  assert.equal(parsed.filter((entry) => entry.existingDraft).length, 6);
  assert.equal(parsed.filter((entry) => !entry.existingDraft).length, 3);
  for (const entry of parsed) {
    assert.equal(entry.draft, true);
    assert.equal(entry.decision, 'pending');
    assert.equal(entry.visibility, 'public');
    assert.equal(entry.codeExecution, 'not-run');
    assert.ok(entry.unknowns.length > 0);
    assert.ok(
      entry.sources.some((source) =>
        source.url.includes(`/blob/${entry.commit}/`),
      ),
    );
  }
  assert.equal(
    parsed.find((entry) => entry.id === 'mining-forge').kind,
    'design',
  );
});

test('候補調査からの公開指定・private混入・未確認の作者指定を拒否する', () => {
  for (const fields of [
    { draft: false },
    { decision: 'adopted' },
    { visibility: 'private' },
    { codeExecution: 'verified' },
    { author: 'owner' },
    { repository: 'someone/else' },
    { repositoryUrl: 'https://github.com/someone/else' },
  ])
    assert.throws(() => parseWorkCandidates([{ ...sample(), ...fields }]));
});

test('出典を失ったデータ・危険な入口・重複・空一覧はbuild前に失敗する', () => {
  assert.throws(() => parseWorkCandidates([]));
  assert.throws(() => parseWorkCandidates([sample(), sample()]));
  const changedCommit = sample();
  changedCommit.commit = '0'.repeat(40);
  assert.throws(() => parseWorkCandidates([changedCommit]));
  const duplicateSource = sample();
  duplicateSource.sources.push(duplicateSource.sources[0]);
  assert.throws(() => parseWorkCandidates([duplicateSource]));
  for (const url of [
    'javascript:alert(1)',
    'https://user:pass@example.com/',
    'http://example.com/',
    '//example.com/',
  ]) {
    const entry = sample();
    entry.entrances[0].url = url;
    assert.throws(() => parseWorkCandidates([entry]));
  }
});

test('選択の持ち帰りは選んだ公開repoの題とURLのみで、採用状態や本文を変えない', () => {
  const before = JSON.stringify(entries);
  const chosen = candidateSelection(entries, [
    'missing-private-repo',
    entries[2].id,
    entries[0].id,
    entries[0].id,
  ]);
  assert.equal(
    chosen,
    `${entries[0].repository}\n${entries[0].title}\n${entries[0].repositoryUrl}\n\n${entries[2].repository}\n${entries[2].title}\n${entries[2].repositoryUrl}`,
  );
  assert.equal(candidateSelection(entries, []), '');
  assert.doesNotMatch(
    chosen,
    /draft:|公開します|採用済み|missing-private-repo/,
  );
  assert.equal(JSON.stringify(entries), before);
});

test('候補一覧は調査時の公開repo一覧と一致し、private repoを補完しない', async () => {
  const inventory = JSON.parse(
    await readFile(
      new URL(
        '../docs/work-candidates-evidence/public-inventory.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  assert.equal(inventory.length, 9);
  assert.deepEqual(
    entries.map((entry) => entry.repository).sort(),
    inventory.map((entry) => entry.full_name).sort(),
  );
  for (const record of inventory) {
    assert.equal(record.private, false);
    const entry = entries.find(
      (candidate) => candidate.repository === record.full_name,
    );
    assert.equal(entry.repositoryUrl, record.html_url);
    assert.equal(entry.fork, record.fork);
  }
});
