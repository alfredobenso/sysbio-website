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

Commit and push to `main`: GitHub Actions rebuilds and deploys.

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
- `public/_headers` carries the full header set for Cloudflare Pages / Netlify; the same CSP is also in a `<meta>` tag for GitHub Pages.
- Fonts are self-hosted (`@fontsource/*`); no third-party requests at runtime, no cookies, no analytics.

## Commands

```
npm install
npm run fetch      # refresh src/data from IRIS, polito.it, ORCID
npm run dev        # http://localhost:4321
npm run build      # → dist/
npm run preview
```

`SITE_BASE=/sysbio npm run build` builds for a sub-path (e.g. a `user.github.io/sysbio` page before the DNS switch); set the `SITE_BASE` repository variable in GitHub for the same effect in CI.
