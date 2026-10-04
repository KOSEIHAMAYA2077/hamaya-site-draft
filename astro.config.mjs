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
import { localBuildEnabled } from './src/lib/build-mode.mjs';
import { checkPublicAssets } from './scripts/check-public-assets.mjs';
import { checkMarkdownContent } from './scripts/check-markdown-content.mjs';

import { parseWorkCandidates } from './src/lib/work-candidates.mjs';

// Set BASE_PATH=/repository-name for a GitHub Pages project site.
const siteOrigin = process.env.SITE_ORIGIN;
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
        'astro:config:setup': async ({ injectRoute, command }) => {
          // Fail before loaders: malformed draft data must not become an empty success.
          parseWorkCandidates(
            JSON.parse(
              await readFile(
                new URL('./src/data/work-candidates.json', import.meta.url),
                'utf8',
              ),
            ),
          );
          await checkMarkdownContent({ base: process.env.BASE_PATH || '/' });
          await checkPublicAssets({
            publicDir: fileURLToPath(new URL('./public/', import.meta.url)),
            approvedAssets: JSON.parse(
              await readFile(
                new URL('./src/data/public-assets.json', import.meta.url),
                'utf8',
              ),
            ),
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
          if (process.env.LOCAL_COMPARISON === '1') {
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
          if (process.env.LOCAL_CANDIDATES === '1')
            injectRoute({
              pattern: '/compare/candidates',
              entrypoint: fileURLToPath(
                new URL('./src/local-pages/candidates.astro', import.meta.url),
              ),
            });
          if (process.env.LOCAL_TIMELINE === '1')
            injectRoute({
              pattern: '/compare/timeline',
              entrypoint: fileURLToPath(
                new URL(
                  './src/local-pages/compare/timeline.astro',
                  import.meta.url,
                ),
              ),
            });
          if (process.env.LOCAL_EXPERIMENTS === '1')
            injectRoute({
              pattern: '/compare/experiments',
              entrypoint: fileURLToPath(
                new URL('./src/local-pages/experiments.astro', import.meta.url),
              ),
            });
        },
      },
    },
  ],
  vite: { build: { sourcemap: false } },
  markdown: {
    processor: satteri({
      mdastPlugins: [markdownSafety({ base: process.env.BASE_PATH || '/' })],
      hastPlugins: [
        markdownUrlSafety({ base: process.env.BASE_PATH || '/' }),
        markdownBase({
          base: process.env.BASE_PATH || '/',
          imageMetadata: await loadPublicImageMetadata(),
        }),
      ],
    }),
  },
  devToolbar: { enabled: false },
});
