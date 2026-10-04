import {
  cp,
  mkdir,
  readFile,
  writeFile,
  symlink,
  readdir,
} from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const qa = path.dirname(new URL(import.meta.url).pathname);
const source = path.resolve(qa, '../site-portable');
const fixture = path.join(qa, 'fixture-site');
const sample = path.join(source, 'docs/portable-sample');
await mkdir(fixture, { recursive: true });
for (const name of [
  'src',
  'public',
  'scripts',
  'astro.config.mjs',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
])
  await cp(path.join(source, name), path.join(fixture, name), {
    recursive: true,
  });
await symlink(
  path.join(source, 'node_modules'),
  path.join(fixture, 'node_modules'),
).catch((error) => {
  if (error.code !== 'EEXIST') throw error;
});
const names = [
  'portable-writer-note.md',
  'portable-writer-work.md',
  'portable-maker-note.md',
];
const images = [
  'images/synthetic.png',
  'images/portable-maker-note-before.png',
];
const hashes = {};
for (const name of names) {
  const bytes = await readFile(path.join(sample, name));
  hashes[name] = createHash('sha256').update(bytes).digest('hex');
  const text = bytes.toString();
  assert.match(text, /^draft: true$/m);
  // Only this disposable, synthetic-only QA copy may use distribution routes.
  // The downloadable Markdown, owner content and actual source checkout stay draft:true.
  const collection = name.includes('writer-work') ? 'works' : 'notes';
  await writeFile(
    path.join(fixture, 'src/content', collection, name),
    text.replace(/^draft: true$/m, 'draft: false'),
  );
}
for (const name of images) {
  await mkdir(path.dirname(path.join(fixture, 'public', name)), {
    recursive: true,
  });
  await cp(path.join(sample, name), path.join(fixture, 'public', name));
  hashes[name] = createHash('sha256')
    .update(await readFile(path.join(sample, name)))
    .digest('hex');
}
await writeFile(
  path.join(fixture, 'src/data/public-assets.json'),
  JSON.stringify(images),
);
const checks = [];
for (const base of ['/portable-first', '/moved/nested']) {
  const env = {
    ...process.env,
    ASTRO_TELEMETRY_DISABLED: '1',
    BASE_PATH: base,
  };
  for (const key of Object.keys(env))
    if (key.startsWith('LOCAL_')) delete env[key];
  const log = execFileSync('npm', ['run', 'build'], {
    cwd: fixture,
    env,
    encoding: 'utf8',
  });
  assert.match(log, /8 page\(s\) built/);
  await writeFile(
    path.join(
      qa,
      `fixture-build-${base === '/portable-first' ? 'first' : 'moved'}.log`,
    ),
    log,
  );
  await cp(
    path.join(fixture, 'dist'),
    path.join(qa, 'relocated-preview', base.slice(1)),
    { recursive: true },
  );
  for (const name of images)
    assert.deepEqual(
      await readFile(path.join(fixture, 'dist', name)),
      await readFile(path.join(sample, name)),
    );
  for (const name of names) {
    const collection = name.includes('writer-work') ? 'works' : 'notes';
    const staged = await readFile(
      path.join(fixture, 'src/content', collection, name),
      'utf8',
    );
    assert.equal(
      staged.replace(/^draft: false$/m, 'draft: true'),
      await readFile(path.join(sample, name), 'utf8'),
    );
  }
  checks.push({
    base,
    pages: 8,
    sampleBytesUnchanged: true,
    imageBytesUnchanged: true,
  });
}
// Missing body images and missing adopted files must stop before a successful build.
const env = {
  ...process.env,
  ASTRO_TELEMETRY_DISABLED: '1',
  BASE_PATH: '/moved/nested',
};
for (const key of Object.keys(env))
  if (key.startsWith('LOCAL_')) delete env[key];
await writeFile(
  path.join(fixture, 'src/data/public-assets.json'),
  JSON.stringify([...images, 'images/missing.png']),
);
try {
  execFileSync('npm', ['run', 'build'], {
    cwd: fixture,
    env,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  throw new Error('Missing image build unexpectedly succeeded');
} catch (error) {
  assert.match(
    `${error.stdout}\n${error.stderr}`,
    /採用済み画像が public\/ にありません/,
  );
  checks.push({ missingImageBuildStopped: true });
}
await writeFile(
  path.join(fixture, 'src/data/public-assets.json'),
  JSON.stringify(images),
);
await writeFile(
  path.join(qa, 'relocation-build.json'),
  JSON.stringify(
    {
      hashes,
      checks,
      scope:
        'Only disposable synthetic files switch draft:false for local distribution-route QA. Downloaded source files remain draft:true.',
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ checks, hashes }));
