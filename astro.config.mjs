import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import markdownBase from './src/lib/markdown-base.mjs';
import { loadPublicImageMetadata } from './src/lib/public-image-metadata.mjs';
import {
  markdownSafety,
  markdownUrlSafety,
} from './src/lib/markdown-safety.mjs';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { localBuildEnabled, localFeatures } from './src/lib/build-mode.mjs';
import { checkPublicAssets } from './scripts/check-public-assets.mjs';
import { checkMarkdownContent } from './scripts/check-markdown-content.mjs';

import { parseWorkCandidates } from './src/lib/work-candidates.mjs';

// Set BASE_PATH=/repository-name for a GitHub Pages project site.
const siteOrigin = process.env.SITE_ORIGIN;
const features = localFeatures(process.env);
const approvedAssets = JSON.parse(
  await readFile(
    new URL('./src/data/public-assets.json', import.meta.url),
    'utf8',
  ),
);
if (siteOrigin) {
  const url = new URL(siteOrigin);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'SITE_ORIGIN は公開時に決めたHTTPSのoriginを指定してください。pathはBASE_PATHへ設定します。',
    );
}
export default defineConfig({
  output: 'static',
  base: process.env.BASE_PATH || '/',
  site: siteOrigin,
  trailingSlash: 'always',
  integrations: [
    {
      name: 'local-studio-boundary',
      hooks: {
        'astro:config:setup': async ({
          injectRoute,
          injectScript,
          command,
        }) => {
          // Fail before loaders: malformed draft data must not become an empty success.
          parseWorkCandidates(
            JSON.parse(
              await readFile(
                new URL('./src/data/work-candidates.json', import.meta.url),
                'utf8',
              ),
            ),
          );
          await checkMarkdownContent({
            base: process.env.BASE_PATH || '/',
            approvedAssets,
          });
          await checkPublicAssets({
            publicDir: fileURLToPath(new URL('./public/', import.meta.url)),
            approvedAssets,
          });
          if (localBuildEnabled(process.env, command === 'dev')) {
            for (const [pattern, entrypoint] of [
              ['/write', './src/local-pages/write.astro'],
              ['/write/maker-field', './src/local-pages/maker-field.astro'],
              ['/directions', './src/local-pages/directions/index.astro'],
              ['/directions/desk', './src/local-pages/directions/desk.astro'],
              [
                '/directions/[direction]',
                './src/local-pages/directions/[direction].astro',
              ],
            ])
              injectRoute({
                pattern,
                entrypoint: fileURLToPath(new URL(entrypoint, import.meta.url)),
              });
          }
          if (features.comparison) {
            for (const view of ['collection', 'focus'])
              injectRoute({
                pattern: `/compare/${view}`,
                entrypoint: fileURLToPath(
                  new URL(
                    `./src/local-pages/compare/${view}.astro`,
                    import.meta.url,
                  ),
                ),
              });
          }
          if (features.candidates)
            injectRoute({
              pattern: '/compare/candidates',
              entrypoint: fileURLToPath(
                new URL('./src/local-pages/candidates.astro', import.meta.url),
              ),
            });
          if (features.timeline)
            injectRoute({
              pattern: '/compare/timeline',
              entrypoint: fileURLToPath(
                new URL(
                  './src/local-pages/compare/timeline.astro',
                  import.meta.url,
                ),
              ),
            });
          if (features.experiments)
            injectRoute({
              pattern: '/compare/experiments',
              entrypoint: fileURLToPath(
                new URL('./src/local-pages/experiments.astro', import.meta.url),
              ),
            });
          if (features.workroom) {
            // A render condition alone still lets Astro discover and emit a
            // component script. Inject this client entry only in the explicit
            // private build, keeping its IDs and shared chunks out of ordinary output.
            injectScript(
              'page',
              `import { setupReturnEntry } from ${JSON.stringify(fileURLToPath(new URL('./src/workroom/return-controller.mjs', import.meta.url)))}; setupReturnEntry(import.meta.env.BASE_URL);`,
            );
            for (const [pattern, entrypoint] of [
              ['/room/notes', './src/local-pages/room/notes/index.astro'],
              ['/room/notes/[id]', './src/local-pages/room/notes/[id].astro'],
              ['/room/settings', './src/local-pages/room/settings.astro'],
              ['/room/compare', './src/local-pages/room/compare.astro'],
              ['/room/archive', './src/local-pages/room/archive.astro'],
            ])
              injectRoute({
                pattern,
                entrypoint: fileURLToPath(new URL(entrypoint, import.meta.url)),
              });
          }
        },
      },
    },
  ],
  vite: { build: { sourcemap: false } },
  markdown: {
    processor: satteri({
      mdastPlugins: [
        markdownSafety({ base: process.env.BASE_PATH || '/', approvedAssets }),
      ],
      hastPlugins: [
        markdownUrlSafety({
          base: process.env.BASE_PATH || '/',
          approvedAssets,
        }),
        markdownBase({
          base: process.env.BASE_PATH || '/',
          imageMetadata: await loadPublicImageMetadata(),
        }),
      ],
    }),
  },
  devToolbar: { enabled: false },
});
