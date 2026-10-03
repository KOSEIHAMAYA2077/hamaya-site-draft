import { lstat, readdir, readFile, open } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

const fixed = new Set(['.nojekyll', 'favicon.svg', 'third-party-notices.txt']);
const raster =
  /^images\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp|gif|avif)$/;
const reviewedFavicon =
  '19b59e1c5b9902f239acef855945a3c354d0bde170ea5df8b4e8384848a3ca33';

async function checkRasterHeader(filename) {
  const handle = await open(filename, 'r');
  const buffer = Buffer.alloc(64);
  let bytesRead;
  try {
    ({ bytesRead } = await handle.read(buffer, 0, 64, 0));
  } finally {
    await handle.close();
  }
  const head = buffer.subarray(0, bytesRead);
  const extension = path.extname(filename).slice(1);
  const valid = {
    png: head
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    jpg: head.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
    jpeg: head.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
    gif: /^GIF8[79]a/.test(head.toString('ascii', 0, 6)),
    webp:
      head.toString('ascii', 0, 4) === 'RIFF' &&
      head.toString('ascii', 8, 12) === 'WEBP',
    avif:
      head.toString('ascii', 4, 8) === 'ftyp' &&
      [8, 16, 20, 24, 28].some((offset) =>
        ['avif', 'avis'].includes(head.toString('ascii', offset, offset + 4)),
      ),
  }[extension];
  if (!valid)
    throw new Error(
      `画像の拡張子と形式が一致しません: ${path.basename(filename)}`,
    );
}

/**
 * Everything in public/ is copied by Astro, including unused draft images.
 * Require an explicit adoption list before reading or copying extra assets.
 * @param {{publicDir: string, approvedAssets: unknown}} options
 */
export async function checkPublicAssets({ publicDir, approvedAssets }) {
  const publicInfo = await lstat(publicDir);
  if (!publicInfo.isDirectory() || publicInfo.isSymbolicLink())
    throw new Error('public/ の保存先にシンボリックリンクは使えません。');
  if (
    !Array.isArray(approvedAssets) ||
    approvedAssets.some(
      (name) => typeof name !== 'string' || !raster.test(name),
    ) ||
    new Set(approvedAssets).size !== approvedAssets.length
  ) {
    throw new Error(
      'public-assets.json は採用済みの images/ 配下の画像パスだけを重複なく指定してください。SVGは画像の受け渡し対象外です。',
    );
  }
  const allowed = new Set([...fixed, ...approvedAssets]);
  const found = new Set();
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      const relative = path.relative(publicDir, full).split(path.sep).join('/');
      const stats = await lstat(full);
      if (stats.isSymbolicLink())
        throw new Error(
          `public/ にシンボリックリンクは置けません: ${relative}`,
        );
      if (stats.isDirectory()) {
        if (relative !== 'images' && !relative.startsWith('images/'))
          throw new Error(`public/ の未採用フォルダです: ${relative}`);
        await visit(full);
      } else {
        if (!stats.isFile() || !allowed.has(relative))
          throw new Error(
            `public/ の未採用ファイルです: ${relative}。画像の採用を確認して public-assets.json へ指定してください。`,
          );
        if (relative.startsWith('images/')) await checkRasterHeader(full);
        found.add(relative);
      }
    }
  }
  await visit(publicDir);
  for (const name of approvedAssets) {
    if (!found.has(name))
      throw new Error(`採用済み画像が public/ にありません: ${name}`);
  }
  // This file is an authored, fixed project asset rather than an uploaded image.
  // Pin this reviewed exception instead of pretending a regex sanitizes SVG.
  if (found.has('favicon.svg')) {
    const icon = await readFile(path.join(publicDir, 'favicon.svg'), 'utf8');
    if (createHash('sha256').update(icon).digest('hex') !== reviewedFavicon)
      throw new Error(
        'favicon.svg が監査済みの内容から変わっています。SVGの実行要素・外部参照を確認してから監査済みdigestを更新してください。',
      );
  }
  return [...found].sort();
}
