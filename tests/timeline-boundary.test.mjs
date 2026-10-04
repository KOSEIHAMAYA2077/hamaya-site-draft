import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { decodeHTMLAttribute } from 'entities';
import { localBuildEnabled, localFeatures } from '../src/lib/build-mode.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const base = (process.env.BASE_PATH || '/').replace(/\/+$/, '');
const features = localFeatures(process.env);
const workroomOn = features.workroom;
const timelineOn = features.timeline;
const candidateOn = features.candidates;
const timelinePage = 'compare/timeline/index.html';
const candidatePage = 'compare/candidates/index.html';
const timelineHref = `${base}/compare/timeline/`;
const origin = 'https://timeline-test.invalid';
const candidates = JSON.parse(
  await readFile(path.join(root, 'src/data/work-candidates.json'), 'utf8'),
);

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const filename = path.join(directory, entry.name);
        return entry.isDirectory() ? filesIn(filename) : [filename];
      }),
    )
  ).flat();
}

let builtPromise;
function builtArtifacts() {
  builtPromise ??= (async () => {
    const files = await filesIn(dist).catch(() => {
      throw new Error(
        '先に対象modeでbuildし、同じ環境変数でテストしてください。',
      );
    });
    return new Map(
      await Promise.all(
        files
          .filter((file) => /\.(?:html|js|mjs|css|json|map)$/.test(file))
          .map(async (file) => [
            path.relative(dist, file).split(path.sep).join('/'),
            await readFile(file, 'utf8'),
          ]),
      ),
    );
  })();
  return builtPromise;
}

function decodedText(source) {
  return decodeHTMLAttribute(source).replace(
    /\\u([a-f0-9]{4})|\\x([a-f0-9]{2})/gi,
    (_, unicode, ascii) => String.fromCharCode(parseInt(unicode || ascii, 16)),
  );
}

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(
      (match) => [
        match[1].toLowerCase(),
        decodeHTMLAttribute(match[2] ?? match[3] ?? match[4]),
      ],
    ),
  );
}

test('LOCAL_TIMELINEは文字列1だけで既存のローカル執筆境界を有効にする', () => {
  for (const value of [undefined, '', '0', 'true', '01', '1 ', ' 1', 1, true])
    assert.equal(localBuildEnabled({ LOCAL_TIMELINE: value }), false);
  assert.equal(localBuildEnabled({ LOCAL_TIMELINE: '1' }), true);
  assert.equal(localBuildEnabled({}, true), true);
});

test('timelineのルートと入口は独立flagか明示した統合modeだけで生成する', async () => {
  const artifacts = await builtArtifacts();
  assert.equal(artifacts.has(timelinePage), timelineOn);
  for (const [filename, source] of artifacts) {
    if (!timelineOn) {
      assert.doesNotMatch(filename, /timeline/i);
      assert.doesNotMatch(
        decodedText(source),
        /data-timeline-|TimelineStudy|LOCAL_TIMELINE|\/compare\/timeline\/|\.timeline-/,
        filename,
      );
    }
    if (!filename.endsWith('.html')) continue;
    const links = [...source.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)]
      .map(([tag]) => tag)
      .filter((tag) => /\bdata-timeline-entry(?:[\s=>])/.test(tag));
    assert.equal(links.length > 0, timelineOn, filename);
    for (const tag of links) {
      const attrs = attributes(tag.slice(0, tag.indexOf('>') + 1));
      assert.equal(attrs.href, timelineHref);
      if (workroomOn) {
        assert.equal(attrs.target, undefined);
        assert.match(tag, /時系列/);
        assert.match(tag, /\bdata-local-tool(?:[\s=>])/);
        assert.doesNotMatch(tag, /\bhidden(?:[\s=>])/);
        const nav = source.match(
          /<nav\b[^>]*data-workroom-nav[\s\S]*?<\/nav>/,
        )?.[0];
        assert.ok(
          nav?.includes(tag),
          `${filename}: 統合navの入口ではありません。`,
        );
      } else {
        assert.equal(attrs.target, '_blank');
        assert.ok(attrs.rel?.split(/\s+/).includes('noopener'));
        assert.match(tag, /時間で見返す（別タブ）/);
        assert.match(tag, /\bdata-local-tool(?:[\s=>])/);
        assert.match(tag, /\bhidden(?:[\s=>])/);
        assert.match(source, /localhost/);
        assert.match(source, /127\.0\.0\.1/);
      }
    }
  }
  if (timelineOn) {
    assert.ok(artifacts.has('write/index.html'));
    assert.ok(artifacts.has('write/maker-field/index.html'));
  }
});

test('timelineは確認待ち9件の題・説明・commit日時と固定SHAの入口だけを表示する', async () => {
  if (!timelineOn) return;
  const html = (await builtArtifacts()).get(timelinePage);
  assert.ok(html);
  assert.match(html, /data-timeline-study(?:[\s=>])/);
  const panels = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)]
    .map(([source]) => ({
      source,
      attrs: attributes(source.slice(0, source.indexOf('>') + 1)),
    }))
    .filter(({ attrs }) => Object.hasOwn(attrs, 'data-timeline-panel'));
  assert.equal(panels.length, candidates.length);
  assert.deepEqual(
    panels.map(({ attrs }) => attrs['data-timeline-panel']).sort(),
    candidates.map(({ id }) => id).sort(),
  );
  for (const candidate of candidates) {
    assert.equal(candidate.draft, true, candidate.id);
    assert.equal(candidate.decision, 'pending', candidate.id);
    const panel = panels.find(
      ({ attrs }) => attrs['data-timeline-panel'] === candidate.id,
    );
    assert.equal(panel.attrs.id, `record-${candidate.id}`);
    assert.equal(panel.attrs.tabindex, '-1');
    const visibleText = decodeHTMLAttribute(
      panel.source.replace(/<[^>]*>/g, ''),
    );
    assert.ok(visibleText.includes(candidate.title), candidate.id);
    assert.ok(visibleText.includes(candidate.summary), candidate.id);
    const times = [...panel.source.matchAll(/<time\b[^>]*>/g)].map(
      ([tag]) => attributes(tag).datetime,
    );
    assert.ok(
      times.some(
        (datetime) =>
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(
            datetime || '',
          ) && Date.parse(datetime) === Date.parse(candidate.commitDate),
      ),
      `${candidate.id}: 確認済みcommit日時がありません。`,
    );
    const commitUrl = `${candidate.repositoryUrl}/commit/${candidate.commit}`;
    const links = [...panel.source.matchAll(/<a\b[^>]*>/g)].map(
      ([tag]) => attributes(tag).href,
    );
    assert.ok(links.includes(commitUrl), candidate.id);
    for (const href of links.filter((href) => /^https?:/.test(href || '')))
      assert.ok([candidate.repositoryUrl, commitUrl].includes(href), href);
  }
  const choices = [...html.matchAll(/<a\b[^>]*>/g)]
    .map(([tag]) => ({ tag, attrs: attributes(tag) }))
    .filter(({ attrs }) => Object.hasOwn(attrs, 'data-timeline-choice'));
  const ids = new Set(candidates.map(({ id }) => id));
  for (const { attrs } of choices) {
    assert.ok(ids.has(attrs['data-timeline-choice']));
    assert.equal(attrs.href, `#record-${attrs['data-timeline-choice']}`);
  }
  const indexChoices = choices.filter(({ tag }) =>
    /\bdata-timeline-index(?:[\s=>])/.test(tag),
  );
  assert.deepEqual(
    indexChoices.map(({ attrs }) => attrs['data-timeline-choice']).sort(),
    [...ids].sort(),
  );
});

test('候補のcommit日時・追加3作品のデータを専用HTML以外へ埋め込まない', async () => {
  for (const [filename, source] of await builtArtifacts()) {
    if (
      (timelineOn && filename === timelinePage) ||
      (candidateOn && filename === candidatePage)
    )
      continue;
    const text = decodedText(source);
    for (const candidate of candidates) {
      for (const value of [
        candidate.commitDate,
        new Date(candidate.commitDate).toISOString(),
      ])
        assert.ok(
          !text.includes(value),
          `${filename}: ${candidate.id} のcommit日時`,
        );
      assert.ok(
        !text.includes(`${candidate.repositoryUrl}/commit/${candidate.commit}`),
        `${filename}: ${candidate.id} のcommitリンク`,
      );
      if (!candidate.existingDraft) {
        for (const value of [
          candidate.title,
          candidate.summary,
          candidate.repositoryUrl,
        ])
          assert.ok(
            !text.includes(value),
            `${filename}: 追加候補 ${candidate.id}`,
          );
      }
    }
  }
});

test('timelineの操作JSとパネルを他のページに接続しない', async () => {
  if (!timelineOn) return;
  const artifacts = await builtArtifacts();
  const dedicatedScripts = new Set(
    [...artifacts]
      .filter(
        ([filename, source]) =>
          /\.m?js$/.test(filename) &&
          /data-timeline-(?:study|panel|choice)/.test(source),
      )
      .map(([filename]) => filename),
  );
  const timelineHtml = artifacts.get(timelinePage);
  const inlineRuntime = [
    ...timelineHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g),
  ].some(([, source]) => /data-timeline-(?:study|panel|choice)/.test(source));
  assert.ok(
    dedicatedScripts.size > 0 || inlineRuntime,
    'timeline操作のコードがありません。',
  );
  for (const [filename, source] of artifacts) {
    if (!filename.endsWith('.html') || filename === timelinePage) continue;
    assert.doesNotMatch(
      source,
      /data-timeline-(?:study|panel|choice|index)(?:[\s=>])/,
    );
    for (const [tag] of source.matchAll(/<script\b[^>]*>/g)) {
      const src = attributes(tag).src;
      if (!src) continue;
      const resolved = new URL(src, `${origin}${base}/${filename}`);
      if (resolved.origin !== origin) continue;
      const target = decodeURIComponent(
        resolved.pathname.slice(base.length),
      ).replace(/^\/+/, '');
      assert.ok(!dedicatedScripts.has(target), `${filename}: timelineの操作JS`);
    }
  }
});
