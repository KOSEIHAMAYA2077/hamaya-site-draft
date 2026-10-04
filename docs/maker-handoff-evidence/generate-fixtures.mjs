import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.dirname(new URL(import.meta.url).pathname);
const directory = path.join(root, 'fixtures');
await mkdir(directory, { recursive: true });
const marker = 'SYNTHETIC_MAKER_QA_ONLY_20261004';
const hostile = `${marker}\n<script>window.__makerUnexpected=true;alert("SYNTHETIC");fetch("https://example.invalid/${marker}")</script>\n<img src="https://example.invalid/${marker}.png" onerror="window.__makerUnexpected=true">\n[文字のリンク](javascript:alert(1))\n\`\`\`\`\`\`text\n記号も原文です。\n\`\`\`\`\`\`\n`;
const body =
  hostile +
  '合成の長文です。日本語と改行、😀を保ちます。\n'.repeat(5200) +
  `${marker}_END`;
const record = {
  id: 'synthetic-long',
  title: '【合成検証】日本語とHTMLを文字のまま',
  date: '2026-10-04',
  body,
  tags: ['合成', '検証'],
  sample: true,
  beforeImage:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
};
const valid = {
  version: 1,
  logs: [
    record,
    {
      id: 'no-title',
      date: '2026-10-04',
      body: '合成。題なし。',
      sample: true,
    },
    {
      id: 'no-date',
      title: '【合成検証】日付なし',
      body: '合成。日付なし。',
      sample: true,
    },
  ],
  experiments: [
    {
      id: 'synthetic-short',
      title: '【合成検証】短い比較',
      date: '2026-10-04',
      hypothesis: '表示だけを変えたらどうなるか。',
      observation: '合成データです。',
      sample: true,
    },
  ],
  ideas: [],
};
const cases = {
  'synthetic-valid.json': JSON.stringify(valid),
  'synthetic-replacement.json': JSON.stringify({
    version: 1,
    logs: [
      {
        id: 'replacement',
        title: '【合成検証】置き換え候補',
        date: '2026-10-04',
        body: '取り消したら元の入力を保つ。',
        sample: true,
      },
    ],
    experiments: [],
    ideas: [],
  }),
  'synthetic-empty.json': JSON.stringify({
    version: 1,
    logs: [],
    experiments: [],
    ideas: [],
  }),
  'synthetic-duplicate-id.json': JSON.stringify({
    version: 1,
    logs: [{ id: 'same' }, { id: 'same' }],
    experiments: [],
    ideas: [],
  }),
  'synthetic-escaped-duplicate.json':
    '{"version":1,"logs":[],"lo\\u0067s":[],"experiments":[],"ideas":[]}',
  'synthetic-unknown-field.json': JSON.stringify({
    version: 1,
    logs: [{ id: 'unknown', futureField: '合成・未知項目を黙って捨てない' }],
    experiments: [],
    ideas: [],
  }),
  'synthetic-surrogate-high.json':
    '{"version":1,"logs":[{"id":"high","body":"\\ud800"}],"experiments":[],"ideas":[]}',
  'synthetic-surrogate-low.json':
    '{"version":1,"logs":[{"id":"low","body":"\\udc00"}],"experiments":[],"ideas":[]}',
  'synthetic-malformed.json': '{"version":1,',
  'synthetic-invalid-utf8.json': Buffer.from([
    0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d,
  ]),
  'synthetic-too-large.json': Buffer.alloc(8 * 1024 * 1024 + 1, 0x20),
};
for (const [name, value] of Object.entries(cases))
  await writeFile(path.join(directory, name), value);
await writeFile(
  path.join(root, 'expected.json'),
  JSON.stringify(
    {
      marker,
      title: record.title,
      body,
      fixtureDescription:
        'すべてこのQAのために作成した合成データ。本人や第三者の制作内容を含まない。',
    },
    null,
    2,
  ),
);
console.log(
  `Created ${Object.keys(cases).length} synthetic fixtures; valid body ${body.length} UTF-16 units.`,
);
