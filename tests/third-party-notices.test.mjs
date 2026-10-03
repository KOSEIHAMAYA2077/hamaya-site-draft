import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.resolve(root, process.env.DIST_DIR || 'dist');
const noticePath = path.join(root, 'public/third-party-notices.txt');
const dependencies = [
  { name: 'entities', file: 'LICENSE' },
  { name: 'yaml', file: 'LICENSE' },
  { name: 'vite', file: 'LICENSE.md', coreOnly: true },
];

test('third-party notices retain installed versions and complete license texts', async () => {
  const notices = await readFile(noticePath, 'utf8');
  const lock = JSON.parse(
    await readFile(path.join(root, 'package-lock.json'), 'utf8'),
  );
  for (const { name, file, coreOnly } of dependencies) {
    const directory = path.join(root, 'node_modules', name);
    const installed = JSON.parse(
      await readFile(path.join(directory, 'package.json'), 'utf8'),
    );
    assert.equal(
      installed.version,
      lock.packages[`node_modules/${name}`].version,
      `${name}: installed version must match the lockfile`,
    );
    assert.ok(
      notices.includes(`${name} ${installed.version} (${installed.license})\n`),
      `${name}: update the notice when the installed dependency changes`,
    );
    let license = await readFile(path.join(directory, file), 'utf8');
    if (coreOnly) {
      const bundled = license.indexOf('# Licenses of bundled dependencies');
      assert.ok(bundled > 0, 'Vite core license must remain identifiable');
      license = license.slice(0, bundled);
    }
    assert.ok(
      notices.includes(license.trim()),
      `${name}: copyright, permission, conditions and disclaimer must remain complete`,
    );
  }
});

test('static output includes the complete third-party notice file', async () => {
  const [source, built] = await Promise.all([
    readFile(noticePath),
    readFile(path.join(dist, 'third-party-notices.txt')),
  ]);
  assert.deepEqual(built, source, 'ship the notice unchanged with every build');
});
