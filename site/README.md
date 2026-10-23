# SysBio Group website

Static site for the Systems Biology Group, Politecnico di Torino. Built with [Astro](https://astro.build); no CMS, no database, no server-side code.

## Everyday tasks

| I want to… | Do this |
|---|---|
| add a project | add `src/content/projects/<slug>.md` (copy an existing one; `status: ongoing` or `completed`) |
| add a tool | add `src/content/tools/<slug>.md`; put the BibTeX in a fenced ```bibtex block |
| change the "Recent work" cards on the home page | edit `src/content/recent/*.md` (two are shown, by `order`) |
| edit a bio or photo | `src/content/people/<slug>.md` and `public/img/` |
| add a member | add them to `scripts/sources.json` (polito.it id, IRIS `rp` id, ORCID) and a `src/content/people/<slug>.md` |
| change text that is not in Markdown | `src/pages/*.astro` |

Commit and push to `main`: GitHub Actions rebuilds (see Hosting).

## Hosting on the Politecnico server

GitHub Actions does not deploy anywhere. On every push and every night it builds the site and publishes the result in two places:

- the **`build` branch** of the repository, which contains only the built files (`dist/`);
- a downloadable **artifact** on the workflow run (Actions tab).

On the server, serve the `build` branch as the document root and refresh it on a cron job:

```
git clone -b build --single-branch https://github.com/<owner>/<repo>.git /var/www/sysbio
# then, e.g. hourly:
cd /var/www/sysbio && git pull -q
```

`public/.htaccess` (copied into the build) sets the security headers and the 404 page for Apache. If the server runs nginx, copy the headers from `public/_headers` into the server block instead. Turn on the `Strict-Transport-Security` line once HTTPS is live on the final domain.

## Data that is fetched, not written

`npm run fetch` (`scripts/fetch-data.mjs`) pulls into `src/data/`:

- **publications.json** — every record of each member from [Porto@Iris](https://iris.polito.it) (`/cris/rp/<id>?type=all` → BibTeX export), merged across members, deduplicated by DOI/title, cross-checked with the ORCID public API (works ORCID has and IRIS does not are added, marked `source: "orcid"`).
- **people.json** — role, department, keywords, profile links and funded projects from the polito.it staff pages.
- **meta.json** — sync time and counts.

The nightly GitHub Action runs the fetch before every build. If IRIS or polito.it are down, the committed snapshot in `src/data/` is used instead. Run `npm run fetch` locally and commit when you want to refresh that snapshot.

Everything fetched is treated as untrusted text: tags are stripped, lengths capped, URLs must be http(s), DOIs must match the DOI pattern.

## Security posture

- Fully static: nothing to log into, no PHP, no database, no forms.
- Strict Content-Security-Policy (`default-src 'none'`, scripts and styles only from this origin). The build is configured so Astro never inlines scripts or styles (`astro.config.mjs`), and Markdown code blocks are not syntax-highlighted for the same reason. Do not add inline `style=""` attributes or `<script>` without `src` in templates.
- `public/.htaccess` (Apache) and `public/_headers` (Cloudflare/Netlify style) carry the full header set; the same CSP is also in a `<meta>` tag in every page, so it holds even on a host that sets no headers.
- Fonts are self-hosted (`@fontsource/*`); no third-party requests at runtime, no cookies, no analytics.

## Commands

```
npm install
npm run fetch      # refresh src/data from IRIS, polito.it, ORCID
npm run dev        # http://localhost:4321
npm run build      # → dist/
npm run preview
```

`SITE_BASE=/sub/path npm run build` builds for a sub-path if the site is ever served from one.
