import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { imageMetadata } from 'astro/assets/utils';
import { checkPublicAssets } from '../../scripts/check-public-assets.mjs';
import { validImagePath } from './content-safety.mjs';

let cache;

/**
 * Read dimensions only after the existing public-asset adoption check succeeds.
 * The default directories are relative to the project root used by Astro/npm.
 * No article URL is passed to the filesystem or a remote image service.
 * @param {{publicDir?: string, approvedAssets?: unknown}} [options]
 */
export async function loadPublicImageMetadata({
  publicDir = path.resolve('public'),
  approvedAssets,
} = {}) {
  if (approvedAssets === undefined)
    approvedAssets = JSON.parse(
      await readFile(path.resolve('src/data/public-assets.json'), 'utf8'),
    );
  await checkPublicAssets({ publicDir, approvedAssets });

  // Recheck adoption and symlinks on every call, but decode unchanged files once.
  // File signatures also refresh dimensions during development after image edits.
  const files = await Promise.all(
    approvedAssets.map(async (name) => {
      const filename = path.join(publicDir, name);
      const stats = await lstat(filename, { bigint: true });
      return {
        name,
        filename,
        signature: `${name}:${stats.ino}:${stats.size}:${stats.mtimeNs}:${stats.ctimeNs}`,
      };
    }),
  );
  const key = `${path.resolve(publicDir)}\n${files.map((file) => file.signature).join('\n')}`;
  if (cache?.key === key) return cache.value;

  const dimensions = Object.create(null);
  for (const { name, filename } of files) {
    const bytes = await readFile(filename);
    try {
      const { width, height } = await imageMetadata(bytes, name);
      if (
        Number.isSafeInteger(width) &&
        Number.isSafeInteger(height) &&
        width > 0 &&
        height > 0
      )
        dimensions[name] = Object.freeze({ width, height });
    } catch {
      // An unreadable image keeps the browser's ordinary fallback, not a made-up ratio.
    }
  }
  const value = Object.freeze(dimensions);
  cache = { key, value };
  return value;
}

/** Look up a known adopted image; this never reads a path supplied by content. */
export function publicImageDimensions(metadata, src, base = '/') {
  if (typeof src !== 'string') return undefined;
  const prefix = `/${base.replace(/^\/+|\/+$/g, '')}`;
  const relative =
    prefix !== '/' && src.startsWith(`${prefix}/`)
      ? src.slice(prefix.length + 1)
      : src.replace(/^\//, '');
  if (!validImagePath(relative) || !Object.hasOwn(metadata, relative))
    return undefined;
  return metadata[relative];
}
