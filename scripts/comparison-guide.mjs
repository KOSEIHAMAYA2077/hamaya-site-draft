import { readFile } from 'node:fs/promises';
const root = new URL('../local-review/', import.meta.url);
const groupInfo = [
  ['home', '01 ホームの見せ方', '3案から、戻ってきたい入口を選ぶ。'],
  ['reading', '02 作品の開き方', '同じ6件を使った、読み方の比較。'],
  ['review', '03 内容と実験', '追加するものと掲載候補は、別に考える。'],
];
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ],
  );
export async function loadGuide() {
  const guide = JSON.parse(await readFile(new URL('guide.json', root), 'utf8'));
  const ids = [
    'home',
    'signal',
    'desk',
    'collection',
    'focus',
    'experiments',
    'candidates',
  ];
  if (
    guide.draft !== true ||
    guide.views.length !== ids.length ||
    guide.views.some((view, i) => view.id !== ids[i])
  )
    throw new Error('7案の非公開ガイドを指定してください。');
  if (
    guide.toolConnection.status !== 'received-unconnected' ||
    guide.toolConnection.libraryFileId !==
      'libfile_caabd1ee7a5c8191b8303e1b05a5ae81' ||
    guide.toolConnection.url !== null
  )
    throw new Error(
      '制作道具は受領済み・サイト未接続です。未確認URLへ自動接続しないでください。',
    );
  for (const view of guide.views) {
    const url = new URL(view.url);
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      !/^[a-f0-9]{40}$/.test(view.commit) ||
      !groupInfo.some(([id]) => id === view.group)
    )
      throw new Error('ローカルの確認済み入口・参照commitが必要です。');
    for (const key of [
      'name',
      'subtitle',
      'difference',
      'effect',
      'content',
      'unverified',
      'try',
      'branch',
    ])
      if (typeof view[key] !== 'string' || !view[key].trim())
        throw new Error(`未入力: ${view.id} ${key}`);
  }
  return guide;
}
export async function renderGuide() {
  const guide = await loadGuide();
  const card = (view) =>
    `<article class="card" id="view-${escape(view.id)}" data-view="${escape(view.id)}"><a class="card-image" href="images/${escape(view.id)}.png" target="_blank" rel="noopener noreferrer" aria-label="${escape(view.name)}の実画面を大きく見る"><img src="images/${escape(view.id)}.png" width="1280" height="900" alt="${escape(view.name)}の実際のプレビュー画面" loading="lazy"></a><div class="card-body"><p class="card-kicker"><span class="card-id">${escape(view.id)}</span><span>${escape(view.subtitle)}</span></p><h3>${escape(view.name)}</h3><p class="difference">${escape(view.difference)}</p><dl><div><dt>${view.id === 'candidates' ? 'この道具でできること' : '採用すると'}</dt><dd>${escape(view.effect)}</dd></div><div><dt>いま表示している内容</dt><dd>${escape(view.content)}</dd></div><div><dt>まだ確かめていないこと</dt><dd>${escape(view.unverified)}</dd></div></dl><p class="try"><strong>ここを試す</strong>${escape(view.try)}</p><div class="card-actions"><a class="try-link" data-preview="${escape(view.id)}" href="${escape(view.url)}" target="_blank" rel="noopener noreferrer">実際に開く ↗</a><a class="image-link" href="images/${escape(view.id)}.png" target="_blank" rel="noopener noreferrer">画像を大きく ↗</a></div><p class="source">参照コード ${escape(view.branch)} · ${escape(view.commit.slice(0, 8))}</p></div></article>`;
  const groups = groupInfo
    .map(
      ([id, title, description]) =>
        `<section id="${id}" class="group group-${id}"><header class="group-header"><h2>${title}</h2><p>${description}</p></header><div class="cards">${guide.views
          .filter((v) => v.group === id)
          .map(card)
          .join('')}</div></section>`,
    )
    .join('');
  return (await readFile(new URL('index.html', root), 'utf8')).replace(
    '<!-- GUIDE_CARDS -->',
    groups,
  );
}
export async function guideFiles() {
  const guide = await loadGuide();
  const files = new Map([
    [
      '/',
      {
        type: 'text/html; charset=utf-8',
        body: Buffer.from(await renderGuide()),
      },
    ],
  ]);
  for (const name of [
    'guide.css',
    'guide.js',
    ...guide.views.map((view) => `images/${view.id}.png`),
  ])
    files.set('/' + name, {
      type: name.endsWith('.png')
        ? 'image/png'
        : name.endsWith('.css')
          ? 'text/css; charset=utf-8'
          : 'text/javascript; charset=utf-8',
      body: await readFile(new URL(name, root)),
    });
  return files;
}
