import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkPublicAssets } from '../scripts/check-public-assets.mjs';
import { localBuildEnabled } from '../src/lib/build-mode.mjs';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'site-public-assets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const publicDir = path.join(root, 'public');
  await mkdir(path.join(publicDir, 'images'), { recursive: true });
  return { root, publicDir };
}

test('local routes require an exact opt-in or the development server', () => {
  for (const value of [undefined, '', '0', 'true', '01', '1 ', ' 1', 1, true]) {
    assert.equal(localBuildEnabled({ LOCAL_STUDIO: value }), false);
    assert.equal(localBuildEnabled({ LOCAL_COMPARISON: value }), false);
    assert.equal(localBuildEnabled({ LOCAL_EXPERIMENTS: value }), false);
    assert.equal(localBuildEnabled({ LOCAL_CANDIDATES: value }), false);
  }
  assert.equal(localBuildEnabled({ LOCAL_STUDIO: '1' }), true);
  assert.equal(localBuildEnabled({ LOCAL_COMPARISON: '1' }), true);
  assert.equal(localBuildEnabled({ LOCAL_EXPERIMENTS: '1' }), true);
  assert.equal(localBuildEnabled({ LOCAL_CANDIDATES: '1' }), true);
  assert.equal(localBuildEnabled({}, true), true);
});

test('unadopted images and arbitrary public files fail before copying', async (t) => {
  const { publicDir } = await fixture(t);
  await writeFile(path.join(publicDir, 'images/private-draft.png'), png);
  await assert.rejects(
    checkPublicAssets({ publicDir, approvedAssets: [] }),
    /未採用ファイル/,
  );
  assert.deepEqual(
    await checkPublicAssets({
      publicDir,
      approvedAssets: ['images/private-draft.png'],
    }),
    ['images/private-draft.png'],
  );
  await writeFile(
    path.join(publicDir, 'draft.md'),
    'SYNTHETIC_PRIVATE_DRAFT_CANARY',
  );
  await assert.rejects(
    checkPublicAssets({
      publicDir,
      approvedAssets: ['images/private-draft.png'],
    }),
    /未採用ファイル/,
  );
});

test('SVG, path escapes, duplicates, missing files, and disguised image data fail', async (t) => {
  const { publicDir } = await fixture(t);
  for (const approvedAssets of [
    ['images/active.svg'],
    ['images/../private.png'],
    ['../secret.png'],
    ['images/a.png', 'images/a.png'],
    ['images/missing.png'],
  ])
    await assert.rejects(checkPublicAssets({ publicDir, approvedAssets }));
  await writeFile(
    path.join(publicDir, 'images/disguised.png'),
    '<svg onload="window.fixture=true"></svg>',
  );
  await assert.rejects(
    checkPublicAssets({ publicDir, approvedAssets: ['images/disguised.png'] }),
    /拡張子と形式/,
  );
});

test('public symlinks and unreviewed favicon changes fail closed', async (t) => {
  const { root, publicDir } = await fixture(t);
  const linkedRoot = path.join(root, 'linked-public');
  await symlink(publicDir, linkedRoot);
  await assert.rejects(
    checkPublicAssets({ publicDir: linkedRoot, approvedAssets: [] }),
    /シンボリックリンク/,
  );
  await writeFile(path.join(root, 'outside.png'), png);
  await symlink(
    path.join(root, 'outside.png'),
    path.join(publicDir, 'images/link.png'),
  );
  await assert.rejects(
    checkPublicAssets({ publicDir, approvedAssets: ['images/link.png'] }),
    /シンボリックリンク/,
  );
  await rm(path.join(publicDir, 'images/link.png'));
  await writeFile(
    path.join(publicDir, 'favicon.svg'),
    '<svg><script>window.fixture=true</script></svg>',
  );
  await assert.rejects(
    checkPublicAssets({ publicDir, approvedAssets: [] }),
    /監査済み/,
  );
});
