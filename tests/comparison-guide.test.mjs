import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import {
  guideFiles,
  loadGuide,
  renderGuide,
} from '../scripts/comparison-guide.mjs';

test('比較ガイドは7案の実画像とlocalhost入口だけを提供し、調査データやソースを配信しない', async () => {
  const guide = await loadGuide();
  const files = await guideFiles();
  assert.equal(guide.draft, true);
  assert.equal(files.size, 10);
  for (const view of guide.views) {
    assert.ok(files.has(`/images/${view.id}.png`));
    assert.ok(files.get(`/images/${view.id}.png`).body.length > 1000);
    assert.equal(new URL(view.url).hostname, '127.0.0.1');
  }
  for (const privatePath of [
    '/guide.json',
    '/AGENTS.md',
    '/package.json',
    '/src/data/work-candidates.json',
    '/.git/config',
  ])
    assert.equal(files.has(privatePath), false);
  const html = await renderGuide();
  assert.equal((html.match(/data-preview=/g) || []).length, 7);
  assert.doesNotMatch(html, /<!-- GUIDE_CARDS -->|<iframe|<canvas|\/Users\//);
  assert.match(html, /全ファイル一致/);
  assert.match(html, /合成の検証用記事/);
});

test('通常サイト配布物に比較ガイド・スクリーンショット・判断UIを含めない', async () => {
  const distRoot = new URL('../dist', import.meta.url).pathname;
  async function scan(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await scan(path);
      else {
        assert.doesNotMatch(
          path.slice(distRoot.length),
          /local-review|comparison-guide|images\/(?:home|signal|desk|collection|focus|experiments|candidates)\.png/,
        );
        if (/\.(html|css|js|json)$/.test(path))
          assert.doesNotMatch(
            await readFile(path, 'utf8'),
            /data-guide-cards|data-choice-form|サイト案を見比べる|127\.0\.0\.1:4347/,
          );
      }
    }
  }
  await scan(distRoot);
});

test('7枚の実画像は確認済み撮影記録と一致し、異なる画面へ黙って差し替えない', async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL('../local-review/capture-manifest.json', import.meta.url),
      'utf8',
    ),
  );
  const guide = await loadGuide();
  assert.deepEqual(
    manifest.views.map((view) => view.id),
    guide.views.map((view) => view.id),
  );
  for (const capture of manifest.views) {
    const file = await readFile(
      new URL(`../local-review/images/${capture.id}.png`, import.meta.url),
    );
    assert.equal(
      createHash('sha256').update(file).digest('hex'),
      capture.sha256,
    );
    assert.equal(capture.status, 200);
    assert.equal(capture.width, 1280);
    assert.equal(capture.height, 900);
    assert.equal(
      capture.url,
      guide.views.find((view) => view.id === capture.id).url,
    );
  }
});
