import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import markdownBase from './src/lib/markdown-base.mjs';

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
  markdown: {
    processor: satteri({
      hastPlugins: [markdownBase({ base: process.env.BASE_PATH || '/' })],
    }),
  },
  devToolbar: { enabled: false },
});
