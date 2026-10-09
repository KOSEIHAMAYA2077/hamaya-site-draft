import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'yaml';
import { DraftExportError, exportDraft } from '../src/lib/draft-export.mjs';

const note = {
  kind: 'note',
  slug: 'test-note',
  title: 'テスト用の題',
  description: '書き出しを確認するための要約。',
  date: '2026-10-03',
  category: '学び',
  tags: '',
  body: '## テスト用の本文\n\nMarkdownを書きます。',
};
const work = {
  ...note,
  kind: 'work',
  slug: 'test-work',
  category: undefined,
  status: '記録',
};

function unpack(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/);
  assert.ok(match, 'frontmatterと本文を分けられる');
  return { data: parse(match[1]), body: match[2] };
}

function invalid(input, field) {
  assert.throws(
    () => exportDraft(input),
    (error) => {
      assert.ok(error instanceof DraftExportError);
      assert.ok(error.issues[field], `${field}の日本語エラーがある`);
      assert.match(error.issues[field], /[ぁ-んァ-ヶ一-龠]/);
      return true;
    },
  );
}

test('記事と作品はschemaに合う設定と固定の追加先で書き出す', () => {
  const generatedNote = exportDraft(note);
  const generatedWork = exportDraft(work);
  assert.equal(generatedNote.filename, 'test-note.md');
  assert.equal(generatedNote.directory, 'src/content/notes/');
  assert.equal(generatedWork.filename, 'test-work.md');
  assert.equal(generatedWork.directory, 'src/content/works/');
  const noteData = unpack(generatedNote.markdown).data;
  const workData = unpack(generatedWork.markdown).data;
  assert.deepEqual(noteData, {
    title: note.title,
    description: note.description,
    date: note.date,
    tags: [],
    draft: true,
    category: '学び',
  });
  assert.deepEqual(workData, {
    title: work.title,
    description: work.description,
    date: work.date,
    tags: [],
    draft: true,
    status: '記録',
  });
});

test('ゲーム・感想を含む記事の種類を選んで下書きに書き出せる', () => {
  for (const category of ['学び', '雑記', 'ゲーム', '感想']) {
    const generated = exportDraft({ ...note, category, tags: ['ゲーム'] });
    const { data, body } = unpack(generated.markdown);
    assert.equal(data.category, category);
    assert.equal(data.draft, true);
    assert.deepEqual(data.tags, ['ゲーム']);
    assert.equal(body, `${note.body}\n`);
    assert.equal(generated.directory, 'src/content/notes/');
  }
});

test('Unicode・引用符・複数行の要約・YAMLに見える入力を文字列として保つ', () => {
  const title = '「記録」: "文字列" / it\'s / 🛰️ / $&';
  const description =
    '1行目: "説明"\r\n---\r\ndraft: false\r\ntags: [置き換えない]\u0085NEL\u2028LS\u2029PS';
  const tags =
    ' 日本語, "引用符", it\'s, 🛰️, ---\n日本語\n\u2028区切りではない';
  const generated = exportDraft({ ...note, title, description, tags });
  const { data } = unpack(generated.markdown);
  assert.equal(data.title, title);
  assert.equal(data.description, description.replace(/\r\n/g, '\n'));
  assert.deepEqual(data.tags, [
    '日本語',
    '"引用符"',
    "it's",
    '🛰️',
    '---',
    '区切りではない',
  ]);
  assert.equal(data.draft, true);
  assert.equal((generated.markdown.match(/^draft: /gm) || []).length, 1);
});

test('タグが空・空白・空区切りでも空の配列にし、重複を除く', () => {
  for (const tags of ['', '  ', ' , , \r\n,\n\t']) {
    assert.deepEqual(
      unpack(exportDraft({ ...note, tags }).markdown).data.tags,
      [],
    );
  }
  assert.deepEqual(
    unpack(
      exportDraft({ ...note, tags: '学び, Astro\n学び, 日本語 ,Astro' })
        .markdown,
    ).data.tags,
    ['学び', 'Astro', '日本語'],
  );
});

test('本文の改行をLFに揃え、HTMLやfrontmatter風の本文も実行せず保つ', () => {
  const body =
    '## 本文\r\n\r\n<script>alert("テスト")</script>\r\n---\r\ndraft: false\r\n\t末尾の空白  ';
  const { data, body: result } = unpack(
    exportDraft({ ...note, body }).markdown,
  );
  assert.equal(data.draft, true);
  assert.equal(result, `${body.replace(/\r\n/g, '\n')}\n`);
  assert.equal(
    unpack(exportDraft({ ...note, body: '本文\n' }).markdown).body,
    '本文\n',
  );
});

test('日付は実在するYYYY-MM-DDだけ受け入れる', () => {
  for (const date of ['2024-02-29', '2026-01-01', '2026-12-31']) {
    assert.equal(
      unpack(exportDraft({ ...note, date }).markdown).data.date,
      date,
    );
  }
  for (const date of [
    '',
    '2026-02-29',
    '2026-02-31',
    '2026-04-31',
    '2026-13-01',
    '2026-00-01',
    '2026-01-00',
    '2026-1-01',
    '2026-10-03T00:00:00Z',
    'not-a-date',
  ]) {
    invalid({ ...note, date }, 'date');
  }
});

test('slugは単一の安全なbasenameに限定し、任意パスを採用しない', () => {
  assert.equal(
    exportDraft({ ...note, slug: 'a'.repeat(64) }).filename,
    `${'a'.repeat(64)}.md`,
  );
  assert.equal(
    exportDraft({
      ...note,
      slug: '  year-2026  ',
      directory: '../outside',
      path: '/etc/passwd',
    }).filename,
    'year-2026.md',
  );
  assert.equal(
    exportDraft({ ...note, directory: '../outside' }).directory,
    'src/content/notes/',
  );
  for (const slug of [
    '',
    '../outside',
    '..',
    '/outside',
    'nested/name',
    'nested\\name',
    '%2e%2e',
    'name.md',
    '_example',
    'Uppercase',
    '-name',
    'name-',
    'name--part',
    'name\nnext',
    'a'.repeat(65),
    'con',
    'nul',
    'lpt1',
  ]) {
    invalid({ ...note, slug }, 'slug');
  }
});

test('外部URLは作品だけで任意、空なら設定自体を省く', () => {
  const empty = unpack(
    exportDraft({ ...work, url: ' ', repository: '' }).markdown,
  ).data;
  assert.ok(!Object.hasOwn(empty, 'url'));
  assert.ok(!Object.hasOwn(empty, 'repository'));
  const urls = {
    url: 'https://example.com/作品?q=1#記録',
    repository: 'https://github.com/example/test',
  };
  const data = unpack(exportDraft({ ...work, ...urls }).markdown).data;
  assert.equal(data.url, urls.url);
  assert.equal(data.repository, urls.repository);
  assert.equal(
    unpack(exportDraft({ ...work, url: 'HTTPS://example.com/' }).markdown).data
      .url,
    'HTTPS://example.com/',
  );
  const article = unpack(
    exportDraft({
      ...note,
      url: 'javascript:alert(1)',
      repository: 'http://example.com/',
    }).markdown,
  ).data;
  assert.ok(!Object.hasOwn(article, 'url'));
  assert.ok(!Object.hasOwn(article, 'repository'));
});

test('作品URLはHTTP・相対path・別protocol・ログイン情報・壊れたURLを拒否する', () => {
  for (const url of [
    'http://example.com/',
    '/works/',
    'example.com',
    'javascript:alert(1)',
    'data:text/html,test',
    'https://',
    'https:/example.com',
    'https://user:password@example.com/',
    'https://example.com/\nnext',
    'https://example.com\\next',
  ]) {
    invalid({ ...work, url }, 'url');
    invalid({ ...work, repository: url }, 'repository');
  }
});

test('必要な入力・記事の種類・作品の状態を確認し、題の改行を拒否する', () => {
  for (const field of ['kind', 'title', 'description', 'body']) {
    invalid({ ...note, [field]: ' ' }, field);
  }
  invalid({ ...note, category: '' }, 'category');
  invalid({ ...note, category: 'その他' }, 'category');
  invalid({ ...work, status: '' }, 'status');
  invalid({ ...work, status: '公開済み' }, 'status');
  for (const title of ['複数\n行', '複数\r\n行', '複数\u2028行']) {
    invalid({ ...note, title }, 'title');
  }
  for (const field of ['title', 'description', 'body', 'tags']) {
    invalid({ ...note, [field]: '含まれる\u0000文字' }, field);
  }
});

test('呼び出し側がdraft falseを渡しても必ず下書きになる', () => {
  for (const input of [note, work]) {
    const generated = exportDraft({ ...input, draft: false });
    assert.equal(unpack(generated.markdown).data.draft, true);
    assert.match(generated.markdown, /^draft: true$/m);
  }
});
