import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hamaya-content-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await cp(
    path.join(projectRoot, 'scripts/new-entry.mjs'),
    path.join(root, 'scripts/new-entry.mjs'),
  );
  await cp(
    path.join(projectRoot, 'src/content'),
    path.join(root, 'src/content'),
    { recursive: true },
  );
  return {
    root,
    run: (...args) =>
      spawnSync(
        process.execPath,
        [path.join(root, 'scripts/new-entry.mjs'), ...args],
        {
          cwd: os.tmpdir(),
          encoding: 'utf8',
        },
      ),
  };
}

test('追加スクリプトは両形式をUTC日付・draftで作り、日本語のタイトルを保つ', async (t) => {
  const { root, run } = await fixture(t);
  const before = new Date().toISOString().slice(0, 10);
  const title = '「今日の記録」: "試したこと" / it\'s / $&';
  assert.equal(run('note', 'first-note', '--title', title).status, 0);
  assert.equal(run('work', 'first-work').status, 0);
  const after = new Date().toISOString().slice(0, 10);
  const note = await readFile(
    path.join(root, 'src/content/notes/first-note.md'),
    'utf8',
  );
  const work = await readFile(
    path.join(root, 'src/content/works/first-work.md'),
    'utf8',
  );
  const generatedTitle = note
    .match(/^title: '(.+)'$/m)[1]
    .replaceAll("''", "'");
  const generatedDate = note.match(/^date: '(.+)'$/m)[1];
  assert.equal(generatedTitle, title);
  assert.ok([before, after].includes(generatedDate));
  assert.match(note, /^draft: true$/m);
  assert.match(note, /^category: ['"]雑記['"]$/m);
  assert.match(work, /^draft: true$/m);
  assert.match(work, /^status: ['"]記録['"]$/m);
  assert.doesNotMatch(work, /^(?:url|repository):/m);
});

test('重複作成は本文を変えずに失敗する', async (t) => {
  const { root, run } = await fixture(t);
  assert.equal(run('note', 'kept-note', '--title', '元のタイトル').status, 0);
  const filename = path.join(root, 'src/content/notes/kept-note.md');
  const before = await readFile(filename, 'utf8');
  const duplicate = run('note', 'kept-note', '--title', '変更しないタイトル');
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /すでにあります/);
  assert.equal(await readFile(filename, 'utf8'), before);
});

test('見本のdraftが変更されても新規作成は下書きから始まる', async (t) => {
  const { root, run } = await fixture(t);
  const example = path.join(root, 'src/content/notes/_example.md');
  const template = await readFile(example, 'utf8');
  await writeFile(example, template.replace(/^draft: true$/m, 'draft: false'));
  assert.equal(run('note', 'still-draft').status, 0);
  const content = await readFile(
    path.join(root, 'src/content/notes/still-draft.md'),
    'utf8',
  );
  assert.match(content, /^draft: true$/m);
});

test('不正slug・種類・引数はファイルを作らずに拒否する', async (t) => {
  const { root, run } = await fixture(t);
  const directory = path.join(root, 'src/content/notes');
  const before = await readdir(directory);
  for (const args of [
    ['note', '../outside'],
    ['note', 'nested/name'],
    ['note', 'Uppercase'],
    ['note', '-start'],
    ['note', 'end-'],
    ['note', 'a'.repeat(65)],
    ['article', 'valid-name'],
    ['note', 'valid-name', '--title'],
    ['note', 'valid-name', '--title', '   '],
    ['note', 'valid-name', '--title', '複数\n行'],
    ['note', 'valid-name', '--unknown', 'x'],
  ]) {
    const result = run(...args);
    assert.equal(result.status, 1, args.join(' '));
    assert.match(result.stderr, /作成できませんでした/);
  }
  assert.deepEqual(await readdir(directory), before);
});

test('ヘルプは日本語で表示され、下書きを作らない', async (t) => {
  const { root, run } = await fixture(t);
  const before = await readdir(path.join(root, 'src/content/notes'));
  for (const args of [[], ['--help'], ['-h']]) {
    const result = run(...args);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /使い方/);
    assert.match(result.stdout, /draft: true/);
  }
  assert.deepEqual(await readdir(path.join(root, 'src/content/notes')), before);
});
