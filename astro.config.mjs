import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import markdownBase from './src/lib/markdown-base.mjs';

// Set BASE_PATH=/repository-name for a GitHub Pages project site.
export default defineConfig({
  output: 'static',
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'always',
  markdown: {
    processor: satteri({
      hastPlugins: [markdownBase({ base: process.env.BASE_PATH || '/' })],
    }),
  },
  devToolbar: { enabled: false },
});
