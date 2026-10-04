import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import '../src/experiments/vendor/action-clock/model.test.mjs';
import '../src/experiments/vendor/motion-reaction/model.test.mjs';
import { experimentDocuments } from '../src/experiments/documents.mjs';

const root = new URL('../src/experiments/', import.meta.url);
test('Selected private model copies match the recorded source commit and SHA256', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('source-manifest.json', root), 'utf8'),
  );
  assert.equal(
    manifest.sourceCommit,
    '5817d62483371c810bff7546b8277e7f2f806ce0',
  );
  assert.equal(manifest.files.length, 4);
  for (const file of manifest.files) {
    assert.match(
      file.copy,
      /^vendor\/(action-clock|motion-reaction)\/model(?:\.test)?\.mjs$/,
    );
    const bytes = await readFile(new URL(file.copy, root));
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      file.sha256,
      file.copy,
    );
  }
  assert.deepEqual(manifest.thirdPartyRuntimeDependencies, []);
});

test('Each isolated document contains one hashed script and style with no network or source maps', async () => {
  const documents = await experimentDocuments();
  assert.deepEqual(Object.keys(documents), ['motion', 'clock']);
  for (const [id, html] of Object.entries(documents)) {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
    assert.equal(scripts.length, 1);
    assert.equal(styles.length, 1);
    for (const [tag, contents] of [
      ['script', scripts[0][1]],
      ['style', styles[0][1]],
    ]) {
      const hash = createHash('sha256').update(contents).digest('base64');
      assert.ok(html.includes(`${tag}-src 'sha256-${hash}'`));
    }
    assert.ok(html.includes("default-src 'none'"));
    assert.ok(html.includes("connect-src 'none'"));
    assert.ok(html.includes("base-uri 'none'"));
    assert.ok(html.includes("form-action 'none'"));
    assert.ok(html.includes(`data-experiment="${id}" data-running="false"`));
    assert.doesNotMatch(
      html,
      /(?:src|href)\s*=|sourceMappingURL|\/Users\/|\/private\/tmp\//,
    );
  }
});
