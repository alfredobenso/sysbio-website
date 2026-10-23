// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// SITE_BASE lets the same build live under a sub-path (e.g. /sysbio on
// a user.github.io page) before the real domain is pointed at it.
const base = process.env.SITE_BASE || '/';

export default defineConfig({
  site: 'https://www.sysbio.polito.it',
  base,
  output: 'static',
  trailingSlash: 'always',
  build: {
    // Keep CSS in files so the Content-Security-Policy can stay `style-src 'self'`.
    inlineStylesheets: 'never',
  },
  // No Shiki: syntax-highlighted code would add inline style attributes, which the CSP forbids.
  markdown: { syntaxHighlight: false },
  // Never inline bundled scripts into the HTML, for the same reason (script-src 'self').
  vite: { build: { assetsInlineLimit: 0 } },
  integrations: [sitemap()],
  devToolbar: { enabled: false },
});
