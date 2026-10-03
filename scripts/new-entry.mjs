#!/usr/bin/env node
import { constants } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const help = `記事・作品の下書きを追加します。

使い方:
  npm run new -- note <slug> [--title "記事のタイトル"]
  npm run new -- work <slug> [--title "作品のタイトル"]

例:
  npm run new -- note first-note --title "今日学んだこと"
  npm run new -- work first-work --title "制作の記録"

slug は半角の小文字・数字・ハイフンで指定してください（最大64文字）。
新しいファイルは draft: true で作成します。既存ファイルは上書きしません。`;

function fail(message) {
  console.error(`作成できませんでした: ${message}`);
  process.exitCode = 1;
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length === 0 ||
    (args.length === 1 && ['--help', '-h'].includes(args[0]))
  ) {
    console.log(help);
    return;
  }

  const [kind, slug, ...options] = args;
  if (!['note', 'work'].includes(kind)) {
    fail(
      '種類は note または work を指定してください。--help で使い方を確認できます。',
    );
    return;
  }
  if (!slug || slug.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    fail(
      'slug は半角の小文字・数字・ハイフンで指定し、先頭と末尾にはハイフンを使わないでください。',
    );
    return;
  }

  let title = kind === 'note' ? '記事のタイトル' : '作品のタイトル';
  if (options.length > 0) {
    if (options.length !== 2 || options[0] !== '--title') {
      fail('追加の指定は --title "タイトル" の形式で入力してください。');
      return;
    }
    title = options[1].trim();
    if (!title || title.length > 120 || /[\r\n]/.test(title)) {
      fail('タイトルは1〜120文字の1行で入力してください。');
      return;
    }
  }

  const directory = path.join(
    projectRoot,
    'src',
    'content',
    kind === 'note' ? 'notes' : 'works',
  );
  const destination = path.join(directory, `${slug}.md`);
  const template = await readFile(path.join(directory, '_example.md'), 'utf8');
  const date = new Date().toISOString().slice(0, 10);
  const content = template
    .replace(/^title:.*$/m, () => `title: '${title.replaceAll("'", "''")}'`)
    .replace(/^date:.*$/m, `date: '${date}'`)
    .replace(/^draft:.*$/m, 'draft: true');

  await mkdir(directory, { recursive: true });
  await writeFile(destination, content, {
    encoding: 'utf8',
    flag: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
  });
  console.log(
    `下書きを作成しました: ${path.relative(projectRoot, destination)}`,
  );
  console.log(
    '本文と説明を編集してください。draft: true の間は一覧・詳細ページに出ません。',
  );
}

main().catch((error) => {
  if (error.code === 'EEXIST') {
    fail(
      '同じ slug のファイルがすでにあります。別の slug を指定してください。',
    );
  } else if (error.code === 'ENOENT') {
    fail(
      '見本ファイル _example.md が見つかりません。プロジェクトの構成を確認してください。',
    );
  } else {
    fail(error.message);
  }
});
