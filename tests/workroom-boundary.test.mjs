import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { decodeHTMLAttribute } from 'entities';
import { parse as parseYaml } from 'yaml';
import {
  localBuildEnabled,
  localFeatures,
  privateRoutePrefixes,
  workroomEnabled,
} from '../src/lib/build-mode.mjs';
import { comparisonSources } from '../src/lib/collection-study.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const base = (process.env.BASE_PATH || '/').replace(/\/+$/, '');
const origin = 'https://workroom-boundary.invalid';
const enabled = workroomEnabled(process.env.LOCAL_WORKROOM);
const legacyId = 'legacy-cyberpunk2077-1';
const legacyPage = `room/notes/${legacyId}/index.html`;
const roomPages = [
  'room/archive/index.html',
  'room/compare/index.html',
  'room/notes/index.html',
  legacyPage,
  'room/settings/index.html',
].sort();
const legacySource = await readFile(
  path.join(root, `src/content/notes/${legacyId}.md`),
  'utf8',
);
const legacyHeader = parseYaml(
  legacySource.match(/^---\s*\n([\s\S]*?)\n---(?:\n|$)/)[1],
);
// These original, continuous passages must never become a search index, bundle,
// home-page excerpt, or public route. They are not a rewritten article fixture.
const legacyPassages = legacySource
  .replace(/^---\s*\n[\s\S]*?\n---(?:\n|$)/, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .split(/\n\s*\n/)
  .map((paragraph) => paragraph.trim())
  .filter((paragraph) => !paragraph.startsWith('#') && paragraph.length > 80)
  .map((paragraph) => paragraph.split(/\*\*|\n/)[0])
  .filter((passage) => passage.length > 60)
  .map((passage) => passage.slice(0, 60));

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

let artifactsPromise;
function artifacts() {
  artifactsPromise ??= (async () => {
    const files = await filesIn(dist).catch(() => {
      throw new Error('対象modeでbuildし、同じ環境変数でテストしてください。');
    });
    return new Map(
      await Promise.all(
        files
          .filter((filename) =>
            /\.(?:html|js|mjs|css|json|txt|map)$/.test(filename),
          )
          .map(async (filename) => [
            path.relative(dist, filename).split(path.sep).join('/'),
            await readFile(filename, 'utf8'),
          ]),
      ),
    );
  })();
  return artifactsPromise;
}

function decoded(source) {
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

function localAsset(reference, parent) {
  const url = new URL(reference, `${origin}${base}/${parent}`);
  assert.equal(url.origin, origin, `${parent}: 外部asset ${reference}`);
  assert.ok(url.pathname.startsWith(`${base}/`), reference);
  return decodeURIComponent(url.pathname.slice(base.length)).replace(
    /^\/+/,
    '',
  );
}

test('LOCAL_WORKROOMは文字列1だけで有効になり、既存の独立flagを上書きしない', () => {
  const off = {
    workroom: false,
    comparison: false,
    experiments: false,
    candidates: false,
    timeline: false,
  };
  for (const value of [
    undefined,
    '',
    '0',
    'true',
    '01',
    '1 ',
    ' 1',
    1,
    true,
    {},
  ]) {
    assert.equal(workroomEnabled(value), false);
    assert.equal(localBuildEnabled({ LOCAL_WORKROOM: value }), false);
    assert.deepEqual(localFeatures({ LOCAL_WORKROOM: value }), off);
  }
  assert.equal(workroomEnabled('1'), true);
  assert.equal(localBuildEnabled({ LOCAL_WORKROOM: '1' }), true);
  assert.deepEqual(localFeatures({ LOCAL_WORKROOM: '1' }), {
    workroom: true,
    comparison: true,
    experiments: true,
    candidates: true,
    timeline: true,
  });
  for (const [flag, feature] of [
    ['LOCAL_COMPARISON', 'comparison'],
    ['LOCAL_EXPERIMENTS', 'experiments'],
    ['LOCAL_CANDIDATES', 'candidates'],
    ['LOCAL_TIMELINE', 'timeline'],
  ])
    assert.deepEqual(localFeatures({ [flag]: '1' }), {
      ...off,
      [feature]: true,
    });
  assert.deepEqual(localFeatures({ LOCAL_STUDIO: '1' }), off);
  assert.ok(privateRoutePrefixes.includes('room'));
});

test('統合専用の5ページはLOCAL_WORKROOMだけで生成される', async () => {
  const output = await artifacts();
  assert.deepEqual(
    [...output.keys()]
      .filter((filename) => filename.startsWith('room/'))
      .sort(),
    enabled ? roomPages : [],
  );
  if (enabled) {
    for (const filename of roomPages) {
      const html = output.get(filename);
      assert.match(html, /data-workroom-nav(?:[\s=>])/);
      assert.match(
        html,
        /<meta\b[^>]*name="robots"[^>]*content="noindex, nofollow"/,
      );
      assert.doesNotMatch(html, /rel="canonical"|property="og:url"/);
    }
    return;
  }
  for (const [filename, source] of output) {
    assert.ok(!source.includes(`${base}/room/`), `${filename}: roomへの入口`);
    if (!localBuildEnabled(process.env)) {
      assert.doesNotMatch(
        decoded(source),
        /data-workroom-|hamaya-workroom-display|workroom:preferences-change|workroom:motion-change|LOCAL_WORKROOM|統合候補・非公開/,
        filename,
      );
      assert.ok(!source.includes(legacyHeader.title), filename);
    }
  }
});

test('原文の本文はallowlistのローカル記事HTMLだけに含め、公開ルートやbundleへ混ぜない', async () => {
  const output = await artifacts();
  assert.ok(
    legacyPassages.length >= 8,
    '本文検査用の原文を十分に抽出できていない',
  );
  assert.equal(legacyHeader.draft, true);
  assert.equal(output.has(`notes/${legacyId}/index.html`), false);
  for (const [filename, source] of output) {
    const text = decoded(source);
    if (enabled && filename === legacyPage) {
      assert.match(text, /下書き・本人確認待ち/);
      for (const passage of legacyPassages)
        assert.ok(
          text.includes(passage),
          `${filename}: 原文の段落がありません`,
        );
      continue;
    }
    for (const passage of legacyPassages)
      assert.ok(
        !text.includes(passage),
        `${filename}: 原文の本文が専用HTML外にあります`,
      );
  }
  for (const filename of ['notes/index.html', 'works/index.html']) {
    const html = output.get(filename);
    assert.doesNotMatch(html, /\bdata-entry(?:[\s=>])/);
    assert.ok(!decoded(html).includes(legacyHeader.title), filename);
  }
});

test('統合ホームと作品一覧は既存6作品だけを投影し、記事の要約や比較案の本体を重ねない', async () => {
  if (!enabled) return;
  const output = await artifacts();
  for (const filename of ['index.html', 'works/index.html']) {
    const html = output.get(filename);
    assert.match(html, /data-simple-home(?:[\s=>])/);
    const list = html.match(
      /<ul\b[^>]*class="simple-works"[^>]*>[\s\S]*?<\/ul>/,
    )?.[0];
    assert.ok(list, `${filename}: 作品一覧がありません`);
    const items = [...list.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)].map(
      ([item]) => item,
    );
    assert.equal(items.length, comparisonSources.length, filename);
    for (const [index, source] of comparisonSources.entries()) {
      const item = items[index];
      assert.equal(
        attributes(item.match(/^<li\b[^>]*>/)[0]).id,
        `piece-${source.id}`,
      );
      const links = [...item.matchAll(/<a\b[^>]*>/g)].map(
        ([tag]) => attributes(tag).href,
      );
      assert.deepEqual(links, [source.repository], `${filename}: ${source.id}`);
    }
    assert.ok(!decoded(html).includes(legacyHeader.description), filename);
    const links = [...html.matchAll(/<a\b[^>]*>/g)].map(
      ([tag]) => attributes(tag).href,
    );
    assert.ok(!links.includes(`${base}/room/notes/${legacyId}/`), filename);
    assert.doesNotMatch(
      html,
      /data-(?:focus-study|collection-study|desk-surface|candidate-study|timeline-study|experiment-study|maker-field)(?:[\s=>])|\bid="draft-writer"|<iframe\b/,
    );
  }

  const html = output.get('index.html');

  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(
    ([, source]) => source,
  );
  const scriptFiles = new Set();
  const inlineScripts = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/g)) {
    const attrs = attributes(tag);
    if (attrs.rel === 'stylesheet') {
      const filename = localAsset(attrs.href, 'index.html');
      assert.ok(output.has(filename), filename);
      styles.push(output.get(filename));
    }
    if (attrs.rel === 'modulepreload')
      scriptFiles.add(localAsset(attrs.href, 'index.html'));
  }
  for (const [tag, body] of html.matchAll(
    /<script\b[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    const attrs = attributes(tag.slice(0, tag.indexOf('>') + 1));
    if (attrs.src) scriptFiles.add(localAsset(attrs.src, 'index.html'));
    else inlineScripts.push(body);
  }
  const css = styles.join('\n');
  assert.doesNotMatch(
    css,
    /\.(?:focus-study|collection-study|desk-surface|timeline-study|candidate-study|experiment-study|maker-page)(?:[\s[{.:>#]|$)/,
  );
  // Follow imported chunks too: a small nav bundle may otherwise hide an eager
  // experiment, candidate, timeline or YAML-parser dependency.
  const loadedScripts = [...inlineScripts];
  for (const filename of scriptFiles) {
    assert.ok(output.has(filename), filename);
    const source = output.get(filename);
    loadedScripts.push(source);
    for (const [, reference] of source.matchAll(
      /(?:\bfrom\s*|\bimport\s*|\bimport\s*\(\s*)["']([^"']+\.m?js)["']/g,
    ))
      scriptFiles.add(localAsset(reference, filename));
  }
  assert.doesNotMatch(
    loadedScripts.join('\n'),
    /data-(?:candidate-study|timeline-study|timeline-panel|experiment-study|maker-field)|experiment:pause|peakDisplayedCargo|YAMLParseError|YAMLWarning|MULTIPLE_DOCS/,
  );
});

test('主navは作品・雑記・自己紹介にし、編集と設定はfooterへ置く', async () => {
  if (!enabled) return;
  const output = await artifacts();
  for (const [filename, html] of output) {
    if (!filename.endsWith('.html')) continue;
    const nav = html.match(/<nav\b[^>]*data-workroom-nav[\s\S]*?<\/nav>/)?.[0];
    assert.ok(nav, filename);
    const links = [...nav.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map(
      ([tag, label]) => ({
        href: attributes(tag.slice(0, tag.indexOf('>') + 1)).href,
        label: decoded(label)
          .replace(/<[^>]*>/g, '')
          .trim(),
      }),
    );
    assert.deepEqual(
      links,
      [
        { href: `${base}/`, label: '作品' },
        { href: `${base}/room/notes/`, label: '雑記' },
        { href: `${base}/about/`, label: '自己紹介' },
      ],
      filename,
    );
    const footer = html.match(
      /<footer\b[^>]*class="[^"\n]*\bsite-footer\b[^"\n]*"[^>]*>[\s\S]*?<\/footer>/,
    )?.[0];
    const tools = footer?.match(/<details\b[^>]*>[\s\S]*?<\/details>/)?.[0];
    assert.ok(tools, `${filename}: footerの編集入口がありません`);
    assert.match(tools, /<summary\b[^>]*>\s*編集\s*<\/summary>/);
    assert.doesNotMatch(
      tools.match(/^<details\b[^>]*>/)[0],
      /\bopen(?:[\s=>])/,
    );
    // The home page retains its resume panel inside this closed details. Check
    // the primary editing links before that nested panel, not its history links.
    const directTools = tools
      .slice(tools.indexOf('>') + 1)
      .split(/<details\b/, 1)[0];
    const toolHrefs = [...directTools.matchAll(/<a\b[^>]*>/g)].map(
      ([tag]) => attributes(tag).href,
    );
    assert.deepEqual(
      toolHrefs,
      [
        `${base}/write/?kind=note`,
        `${base}/write/?kind=work`,
        `${base}/room/settings/`,
      ],
      filename,
    );
  }
  const compare = output.get('room/compare/index.html');
  for (const href of [
    'compare/focus/',
    'compare/collection/',
    'directions/',
    'room/archive/',
  ])
    assert.ok(
      compare.includes(`href="${base}/${href}"`),
      `${href}: 比較入口がありません`,
    );
});
