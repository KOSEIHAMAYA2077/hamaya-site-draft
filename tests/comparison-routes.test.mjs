import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { localFeatures } from '../src/lib/build-mode.mjs';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const base = (process.env.BASE_PATH || '/').replace(/\/+$/, '');

test('比較ルートは明示時のみ生成し、相手の比較用CSSを読み込まない', async () => {
  for (const [view, other] of [
    ['focus', 'collection'],
    ['collection', 'focus'],
  ]) {
    const page = path.join(dist, 'compare', view, 'index.html');
    if (!localFeatures(process.env).comparison) {
      await assert.rejects(access(page), { code: 'ENOENT' });
      continue;
    }
    const html = await readFile(page, 'utf8');
    const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(
      (match) => match[1],
    );
    for (const [tag] of html.matchAll(/<link\b[^>]*>/g)) {
      if (!/\brel="stylesheet"/.test(tag)) continue;
      const href = tag.match(/\bhref="([^"]+)"/)?.[1];
      assert.ok(href?.startsWith(`${base}/_astro/`), href);
      styles.push(
        await readFile(path.join(dist, href.slice(base.length)), 'utf8'),
      );
    }
    const css = styles.join('\n');
    assert.ok(css.includes(`.${view}-study`), `${view} のCSSがありません。`);
    assert.ok(
      !css.includes(`.${other}-study`),
      `${view} が未使用の ${other} 用CSSを読み込んでいます。`,
    );
  }
});
