# SysBio Group website — plan

Mockup (clickable): https://claude.ai/artifact/7QpyRohJVgjbQMjioL1nHj
Old site (reference only, WordPress mirror): `www.sysbio.polito.it/`

## Who it is for

Scientists anywhere in the world who might want to collaborate. The site answers four questions
fast — *who are you, what do you work on, what have you published, what have you built* — and
makes it one click to get in touch. Everything else (news archive, blog, "Tales of Bio-Land",
contact form) is deliberately left out.

## Pages

| Page | Content | Where the data comes from |
|---|---|---|
| Home | one-line positioning, 4 stat tiles, **Recent work** (2 features), research areas, 3 latest papers, tools strip, contact footer | stats + latest papers generated at build time |
| People | Alfredo Benso, Gianfranco Politano: role, bio, keywords, email, links (polito.it, IRIS, ORCID, Scholar, Scopus); alumni & collaborators; "collaborate with us" tile | role, keywords, links scraped from polito.it staff pages at build time; bios hand-written |
| Publications | full list with search, author filter, clickable per-year histogram, DOI / open-access badge / copy-BibTeX | **IRIS** (Porto@Iris) at build time; ORCID as fallback |
| Projects & Tools | ongoing (ECDC / LLM surveillance), completed grants (BIGMECH, DIDES, FISHUB, OK il pesce è giusto, IBIO OSDD, MIND), 7 tools with "cite" | hand-written Markdown, one file per project / tool |

Recent work to feature now:
- **Epigenetics** — E. Roviera, V. S. Gambino, A. Benso, *Biologically-constrained CpG panel for breast
  field cancerisation classification*, IWBBIO 2026, Best Paper Award.
- **ECDC** — LLM extraction of clinical variables from free-text hospital records + deterministic
  ECDC case-definition classifier for (HA-)BSI, validated against physician labels.
  ⚠ Wording to confirm before publishing: the work is tied to a tender; check what can be public.

## Data sources (verified 2026-10-23)

| Source | Status | Use |
|---|---|---|
| `https://www.polito.it/personale?p=alfredo.benso` (and `gianfranco.politano`, `/en/staff?p=`) | server-rendered HTML, 200 OK | role, department, keywords, ORCID/Scholar/Scopus links, project list, ~10 recent pubs with IRIS handles. No CORS → scrape at build time only. |
| IRIS / Porto@Iris `https://iris.polito.it/cris/rp/rp06317` (Benso), `rp21564` (Politano) | HTML + BibTeX export + **OAI-PMH** at `https://iris.polito.it/oai/request` | **primary publication source**: complete, authoritative. REST API is closed (401). |
| ORCID public API `https://pub.orcid.org/v3.0/{id}/works` | JSON, `access-control-allow-origin: *` | fallback / cross-check only: **incomplete** (Benso 50 works, gap 2013–2018; Politano 14). Could be read client-side if ever needed. |
| Google Scholar | Politano: `oC-BGgUAAAAJ`; Benso: no profile found | link only. No API, scraping is blocked/fragile — do **not** depend on it. Citation counts could come from OpenAlex / Crossref instead if wanted. |

## Architecture: static site, no server code

The single biggest security decision: **there is nothing to attack**.

- **Astro** (static output) + plain CSS. Content in Markdown/JSON in git. Builds to HTML/CSS/JS files.
- **Build-time fetcher** (`scripts/fetch-data.{ts,py}`): pulls IRIS (OAI-PMH + BibTeX), ORCID and the
  polito.it staff pages → `src/data/*.json`, committed to the repo. The *site* never calls external
  APIs from the browser; a source outage can't break it.
- **GitHub Actions**: nightly cron runs the fetcher, commits changes, rebuilds, deploys. Manual
  "run workflow" button for an immediate refresh.
- **Hosting**: GitHub Pages or Cloudflare Pages (free, CDN, HTTPS automatic) with the
  `www.sysbio.polito.it` CNAME pointed at it; or hand the built folder to Polito IT if they host.
- **Adding a project / member / news item** = add a Markdown file, commit (or edit on GitHub web).

## Security ("cyber attack safe")

| Threat | Mitigation |
|---|---|
| CMS exploits, plugin CVEs, brute-force login | no CMS, no PHP, no database, no login page, no admin panel |
| Content injection via fetched data | fetcher runs in CI, treats IRIS/polito output as data: escapes everything, allowlists fields, size-limits, validates DOIs/URLs by regex |
| XSS | static HTML; strict `Content-Security-Policy` (self-only scripts, no inline), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` headers via `_headers` (Cloudflare) or meta tags |
| Dependency compromise | lockfile, Dependabot, minimal deps (Astro only), no third-party scripts, **self-hosted fonts** (no Google Fonts call at runtime) |
| Repo takeover | 2FA on GitHub, branch protection on `main`, deploy only from CI |
| Contact form abuse / spam | no form: `mailto:` links only |
| Privacy | no cookies, no analytics, no trackers → no GDPR banner needed |
| DDoS | CDN-hosted static files; nothing to overload |

## Visual direction (what the mockup shows)

- Playful "lab notebook" look: white ground, near-black ink, 2 px outlines, hard offset shadows,
  rounded 14 px corners, cards lift on hover.
- Each section owns a colour: violet research · coral people · cyan publications · yellow projects ·
  lime tools.
- Type: Space Grotesk (display), Inter (body), JetBrains Mono (labels/meta).
- Interactive touches: hover-reactive regulatory network in the hero, clickable year histogram and
  live filters on Publications, lift-on-hover tiles. No gradients, no stock photos.
- Fully responsive (phone artboard in the mockup).

## Build steps

1. `npm create astro@latest` in this folder (`site/`), add pages + components from the mockup.
2. Write `scripts/fetch-data` for IRIS (OAI-PMH, author filter by IRIS rp id), polito.it staff pages,
   ORCID. Commit the resulting JSON.
3. Content files: `content/people/*.md`, `content/projects/*.md`, `content/tools/*.md`,
   `content/recent/*.md`.
4. GitHub repo + Actions (nightly fetch + deploy) + Pages/Cloudflare + security headers.
5. DNS: point `www.sysbio.polito.it` to the new host; keep the old WordPress mirror in this folder as
   archive only (do not deploy it).

## Open questions

- Confirm the alumni/collaborators list (Di Carlo, Savino, Bardini, Rehman, Vasciaveo, Natale).
- DIDES one-line description; BIGMECH funder.
- What can be said publicly about the ECDC work (tender).
- Hosting preference: GitHub Pages / Cloudflare Pages vs Polito servers (affects custom headers).
- Should the ANTHEA Lab (Olmo, Borzì et al., listed on the old site) be mentioned or dropped?
