import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import {
  loadPublicImageMetadata,
  publicImageDimensions,
} from '../src/lib/public-image-metadata.mjs';

function png(width, height) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc((width * 3 + 1) * height))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'site-image-metadata-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const publicDir = path.join(root, 'public');
  await mkdir(path.join(publicDir, 'images'), { recursive: true });
  return { root, publicDir };
}

test('adopted landscape and portrait images keep actual dimensions and refresh after edits', async (t) => {
  const { publicDir } = await fixture(t);
  const options = {
    publicDir,
    approvedAssets: ['images/landscape.png', 'images/portrait.png'],
  };
  await writeFile(path.join(publicDir, 'images/landscape.png'), png(12, 4));
  await writeFile(path.join(publicDir, 'images/portrait.png'), png(3, 9));
  const metadata = await loadPublicImageMetadata(options);
  assert.deepEqual(metadata['images/landscape.png'], { width: 12, height: 4 });
  assert.deepEqual(metadata['images/portrait.png'], { width: 3, height: 9 });
  assert.ok(Object.isFrozen(metadata));
  assert.deepEqual(
    publicImageDimensions(
      metadata,
      '/qa-site/images/portrait.png',
      '/qa-site/',
    ),
    { width: 3, height: 9 },
  );
  assert.deepEqual(publicImageDimensions(metadata, 'images/landscape.png'), {
    width: 12,
    height: 4,
  });
  await writeFile(path.join(publicDir, 'images/portrait.png'), png(7, 2));
  const updated = await loadPublicImageMetadata(options);
  assert.deepEqual(updated['images/portrait.png'], { width: 7, height: 2 });
});

test('dimensions never resolve unadopted, external, escaped, or arbitrary file paths', async (t) => {
  const { publicDir } = await fixture(t);
  await writeFile(path.join(publicDir, 'images/allowed.png'), png(2, 3));
  const metadata = await loadPublicImageMetadata({
    publicDir,
    approvedAssets: ['images/allowed.png'],
  });
  for (const src of [
    '/images/missing.png',
    '/images/../private.png',
    '/images/%2e%2e/private.png',
    '../../private.png',
    'file:///tmp/private.png',
    'https://example.invalid/image.png',
    '//example.invalid/image.png',
    '/images/allowed.png?file=private',
    'toString',
    null,
  ])
    assert.equal(publicImageDimensions(metadata, src), undefined, String(src));

  await assert.rejects(
    loadPublicImageMetadata({ publicDir, approvedAssets: [] }),
    /未採用ファイル/,
  );
  await assert.rejects(
    loadPublicImageMetadata({ publicDir, approvedAssets: ['../private.png'] }),
    /採用済み/,
  );
});

test('symlink changes fail even after dimensions have been cached', async (t) => {
  const { root, publicDir } = await fixture(t);
  const filename = path.join(publicDir, 'images/allowed.png');
  const options = { publicDir, approvedAssets: ['images/allowed.png'] };
  await writeFile(filename, png(2, 3));
  await loadPublicImageMetadata(options);
  await writeFile(path.join(root, 'private.png'), png(8, 6));
  await rm(filename);
  await symlink(path.join(root, 'private.png'), filename);
  await assert.rejects(loadPublicImageMetadata(options), /シンボリックリンク/);
});

test('a raster without readable dimensions receives no invented aspect ratio', async (t) => {
  const { publicDir } = await fixture(t);
  await writeFile(
    path.join(publicDir, 'images/incomplete.png'),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  const metadata = await loadPublicImageMetadata({
    publicDir,
    approvedAssets: ['images/incomplete.png'],
  });
  assert.equal(
    publicImageDimensions(metadata, '/images/incomplete.png'),
    undefined,
  );
});
