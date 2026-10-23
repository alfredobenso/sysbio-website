#!/usr/bin/env node
// Build-time data fetcher. Pulls public data about the group members from
//   - polito.it staff pages      (role, keywords, links, funded projects)
//   - IRIS / Porto@Iris          (complete publication list, BibTeX)
//   - ORCID public API           (cross-check: works IRIS does not know about)
// and writes src/data/*.json. The site itself never talks to these services:
// everything fetched here is treated as untrusted text and sanitised before
// it is written.
//
// Usage: node scripts/fetch-data.mjs [--offline]

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'src', 'data');
const sources = JSON.parse(await readFile(path.join(here, 'sources.json'), 'utf8'));

const UA = 'sysbio-site-builder/1.0 (+https://www.sysbio.polito.it)';
const MAX_TEXT = 600;      // longest string we keep (titles, venues)
const MAX_ABSTRACT = 0;    // abstracts are not shown; keep none

// ---------------------------------------------------------------- helpers

async function get(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { 'user-agent': UA, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function decode(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 31 && n < 0x10ffff ? String.fromCodePoint(n) : '';
    }
    return entities[e.toLowerCase()] ?? m;
  });
}

// Strip every tag, decode entities, collapse whitespace, cap length.
function clean(s, max = MAX_TEXT) {
  if (!s) return '';
  const t = decode(String(s).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

// Only http(s) URLs survive; everything else is dropped.
function safeUrl(u) {
  try {
    const url = new URL(decode(String(u).trim()));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    url.protocol = 'https:';
    return url.href.length > 500 ? '' : url.href;
  } catch {
    return '';
  }
}

const DOI_RE = /^10\.\d{4,9}\/[^\s]+$/i;
function safeDoi(d) {
  if (!d) return '';
  let doi = clean(d, 200).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim();
  return DOI_RE.test(doi) ? doi : '';
}

// IRIS stores journal names in capitals ("NATURE COMMUNICATIONS"); make them readable.
const SMALL = new Set(['of', 'and', 'the', 'in', 'on', 'for', 'to', 'an', 'de', 'di', 'del', 'della', 'et', 'la', 'le', 'und', 'für']);
function titleCase(s) {
  if (!s || s !== s.toUpperCase() || !/[A-Z]{3}/.test(s)) return s;
  return s.toLowerCase().split(/(\s+|-|\/)/).map((w, i) => {
    if (!/^[a-zà-ú]/.test(w)) return w;
    if (/^(ieee|acm|ai|dna|rna|mirna|ncrna|bmc|plos|ijcnn|bibm|iwbbio|jucs|usa|uk|eu|iet|vlsi|ic|soc|ii|iii|iv|cnr)$/.test(w)) return w.toUpperCase();
    if (i > 0 && SMALL.has(w)) return w;
    return w[0].toUpperCase() + w.slice(1);
  }).join('');
}

function normTitle(t) {
  return clean(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// -------------------------------------------------------------- polito.it

function parseStaff(html, m) {
  const out = {
    role: '', department: '', center: '', phone: '', email: '',
    keywords: [], links: {}, projects: [], researchLines: [],
  };
  const dett = html.match(/<section class="dettagli">([\s\S]*?)<\/section>\s*<\/section>/);
  if (dett) {
    const h2 = dett[1].match(/<h2>([\s\S]*?)<\/h2>/);
    if (h2) {
      const parts = h2[1].split(/<br\s*\/?>/);
      out.role = clean(parts[0]);
      out.department = clean(parts[1] || '');
    }
    const ruoli = dett[1].match(/<ul class="ruoli">([\s\S]*?)<\/ul>/);
    if (ruoli) out.center = clean(ruoli[1]).replace(/^Member of Interdepartmental Center\s*/i, '');
    const tel = dett[1].match(/href="tel:([^"]+)"/);
    if (tel) out.phone = clean(tel[1], 40);
    const mail = dett[1].match(/href="mailto:([^"]+)"/);
    if (mail) out.email = clean(mail[1], 100);
    for (const [, href, title] of dett[1].matchAll(/<a href="([^"]+)" title="View ([A-Za-z ]+) profile"/g)) {
      const url = safeUrl(href);
      if (url) out.links[title.toLowerCase().replace(/\s+/g, '_')] = url;
    }
  }
  // polito.it mixes free keywords, ERC sector codes and UN SDGs in one tag list
  out.erc = [];
  out.sdg = [];
  for (const [, kw] of html.matchAll(/<article class="tag">([\s\S]*?)<\/article>/g)) {
    const k = clean(kw, 200);
    if (!k) continue;
    if (/^[A-Z]{2}\d+_\d+\s*-\s*/.test(k)) out.erc.push(k);
    else if (/^Goal \d+/i.test(k)) out.sdg.push(k);
    else if ((k.match(/,/g) || []).length >= 2) out.keywords.push(...k.split(/\s*,\s*/).filter(Boolean)); // one tag holding a list
    else out.keywords.push(k);
  }
  const lines = html.match(/<h3>Research (?:lines|topics)<\/h3>\s*<section>([\s\S]*?)<\/section>/i);
  if (lines) {
    for (const [, li] of lines[1].matchAll(/<li>([\s\S]*?)<\/li>/g)) {
      const l = clean(li, 160);
      if (l) out.researchLines.push(l);
    }
  }
  const proj = html.match(/<h3>Research projects<\/h3>\s*<section>([\s\S]*?)<\/section>/);
  if (proj) {
    let kind = '';
    for (const chunk of proj[1].split(/(?=<h4>)/)) {
      const h4 = chunk.match(/<h4>([\s\S]*?)<\/h4>/);
      if (h4) kind = clean(h4[1], 80);
      for (const [, li] of chunk.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
        const a = li.match(/<a [^>]*>([\s\S]*?)<\/a>/);
        const yrs = li.match(/\((\d{4})-(\d{4})\)/);
        // after the link: ", (2016-2018) - Responsabile Scientifico <br>UE-funded research"
        const tail = li.replace(/<a [^>]*>[\s\S]*?<\/a>/, '').replace(/\(\d{4}-\d{4}\)/, '');
        const [rolePart, fundingPart] = tail.split(/<br\s*\/?>/);
        const role = clean(rolePart, 120).replace(/^[\s,–-]+/, '');
        const funding = clean(fundingPart || '', 80);
        if (!a) continue;
        const title = clean(a[1], 300);
        const [acronym, ...titleRest] = title.split(/\s+-\s+/);
        out.projects.push({
          acronym: titleRest.length ? acronym : '',
          title: titleRest.length ? titleRest.join(' - ') : title,
          start: yrs ? Number(yrs[1]) : null,
          end: yrs ? Number(yrs[2]) : null,
          role,
          funding,
          kind,
        });
      }
    }
  }
  return out;
}

async function fetchStaff(m) {
  const html = await get(`https://www.polito.it/en/staff?p=${encodeURIComponent(m.polito)}`);
  const data = parseStaff(html, m);
  data.url = `https://www.polito.it/en/staff?p=${m.polito}`;
  return data;
}

// -------------------------------------------------------------------- IRIS

// Minimal BibTeX parser for the well-formed output of IRIS' references.htm.
function parseBibtex(src) {
  const entries = [];
  let i = 0;
  while ((i = src.indexOf('@', i)) !== -1) {
    const typeEnd = src.indexOf('{', i);
    if (typeEnd === -1) break;
    const type = src.slice(i + 1, typeEnd).trim().toLowerCase();
    // find the matching closing brace of the entry
    let depth = 0, j = typeEnd;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (depth === 0) break; }
    }
    const body = src.slice(typeEnd + 1, j);
    i = j + 1;
    const firstComma = body.indexOf(',');
    const key = body.slice(0, firstComma).trim();
    const fields = {};
    let rest = body.slice(firstComma + 1);
    const re = /\s*([a-zA-Z_]+)\s*=\s*/y;
    let pos = 0;
    while (pos < rest.length) {
      re.lastIndex = pos;
      const m = re.exec(rest);
      if (!m) break;
      pos = re.lastIndex;
      let value = '';
      if (rest[pos] === '{') {
        let d = 0, k = pos;
        for (; k < rest.length; k++) {
          if (rest[k] === '{') d++;
          else if (rest[k] === '}') { d--; if (d === 0) break; }
        }
        value = rest.slice(pos + 1, k);
        pos = k + 1;
      } else {
        const k = rest.indexOf(',', pos);
        value = rest.slice(pos, k === -1 ? undefined : k);
        pos = k === -1 ? rest.length : k;
      }
      fields[m[1].toLowerCase()] = value.replace(/[{}]/g, '').trim();
      const c = rest.indexOf(',', pos);
      pos = c === -1 ? rest.length : c + 1;
    }
    entries.push({ type, key, fields });
  }
  return entries;
}

const TYPE_MAP = { article: 'journal', conference: 'conference', inproceedings: 'conference', inbook: 'chapter', incollection: 'chapter', book: 'book', misc: 'other', patent: 'patent' };

function authorsFromBib(a) {
  return a.split(/\s+and\s+/).map((p) => {
    const [last, first] = p.split(',').map((x) => clean(x, 80));
    if (!first) return last;
    const initials = first.split(/[\s.-]+/).filter(Boolean).map((n) => n[0].toUpperCase() + '.').join(' ');
    return `${initials} ${last}`;
  });
}

async function fetchIris(m) {
  const base = 'https://iris.polito.it';
  const html = await get(`${base}/cris/rp/${encodeURIComponent(m.iris)}?type=all&rpp=500`);
  const ids = [...new Set([...html.matchAll(/name="item_id" value="([0-9a-f-]{36})"/g)].map((x) => x[1]))];
  // open-access hint per handle from the list icons
  const oa = {};
  for (const [, handle, icon] of html.matchAll(/href="(?:https:\/\/iris\.polito\.it)?\/handle\/(11583\/\d+)"[\s\S]*?<small>([\s\S]*?)<\/small>/g)) {
    oa[handle] = /accesso aperto|open access/i.test(icon); // title="file in accesso aperto"
  }
  if (!ids.length) throw new Error(`no IRIS items for ${m.iris}`);
  const body = new URLSearchParams();
  body.set('format', 'bibtex');
  for (const id of ids) body.append('item_id', id);
  const bib = await get(`${base}/references.htm`, { method: 'POST', body });
  const entries = parseBibtex(bib);
  const pubs = [];
  for (const e of entries) {
    const f = e.fields;
    const handle = e.key.replace('_', '/');
    const yearNum = parseInt(f.year, 10);
    const inPress = !yearNum || yearNum > new Date().getFullYear() + 1;
    const title = clean(f.title, 400);
    if (!title) continue;
    pubs.push({
      id: handle,
      source: 'iris',
      title,
      authors: f.author ? authorsFromBib(f.author) : [],
      year: inPress ? null : yearNum,
      inPress,
      type: TYPE_MAP[e.type] || 'other',
      venue: titleCase(clean(f.journal || f.booktitle || f.publisher || '', 300)),
      volume: clean(f.volume, 20),
      number: clean(f.number, 20),
      pages: clean(f.pages, 30),
      doi: safeDoi(f.doi),
      url: safeUrl(f.url),
      iris: `${base}/handle/${handle}`,
      oa: Boolean(oa[handle]),
      bibtex: bibtexFor(e, handle),
    });
  }
  return pubs;
}

// Re-emit a compact, sanitised BibTeX record (we never pass the raw one through).
function bibtexFor(e, handle) {
  const keep = ['author', 'title', 'year', 'journal', 'booktitle', 'publisher', 'volume', 'number', 'pages', 'doi'];
  const fields = { ...e.fields };
  if (!(parseInt(fields.year, 10) <= new Date().getFullYear() + 1)) { delete fields.year; fields.note = 'in press'; keep.push('note'); }
  const lines = keep.filter((k) => fields[k]).map((k) => `  ${k} = {${clean(fields[k], 600).replace(/[{}]/g, '')}}`);
  const type = ({ journal: 'article', conference: 'inproceedings', chapter: 'incollection', book: 'book' })[TYPE_MAP[e.type] || 'other'] || 'misc';
  return `@${type}{iris_${handle.replace('/', '_')},\n${lines.join(',\n')}\n}`;
}

// ------------------------------------------------------------------- ORCID

async function fetchOrcid(m) {
  const json = JSON.parse(await get(`https://pub.orcid.org/v3.0/${encodeURIComponent(m.orcid)}/works`, { headers: { accept: 'application/json' } }));
  const works = [];
  for (const g of json.group || []) {
    const s = g['work-summary']?.[0];
    if (!s) continue;
    const ids = s['external-ids']?.['external-id'] || [];
    const doi = safeDoi(ids.find((x) => x['external-id-type'] === 'doi')?.['external-id-value']);
    works.push({
      title: clean(s.title?.title?.value, 400),
      year: parseInt(s['publication-date']?.year?.value, 10) || null,
      type: ({ 'journal-article': 'journal', 'conference-paper': 'conference', 'book-chapter': 'chapter', book: 'book' })[s.type] || 'other',
      venue: clean(s['journal-title']?.value, 300),
      doi,
      url: safeUrl(s.url?.value || (doi ? `https://doi.org/${doi}` : '')),
    });
  }
  return works;
}

// -------------------------------------------------------------------- main

const offline = process.argv.includes('--offline');
await mkdir(outDir, { recursive: true });

const people = [];
const pubIndex = new Map(); // key (doi or normalised title) -> pub
const log = (...a) => console.error('[fetch]', ...a);

for (const m of sources.members) {
  const person = { slug: m.slug, name: m.name, short: m.short, polito: null, orcid: m.orcid, iris: `https://iris.polito.it/cris/rp/${m.iris}`, counts: { iris: 0, orcidOnly: 0 } };

  try {
    person.polito = await fetchStaff(m);
    log(m.name, 'polito.it ok:', person.polito.keywords.length, 'keywords,', person.polito.projects.length, 'projects');
  } catch (err) {
    log(m.name, 'polito.it FAILED:', err.message);
  }

  let pubs = [];
  try {
    pubs = await fetchIris(m);
    person.counts.iris = pubs.length;
    log(m.name, 'IRIS ok:', pubs.length, 'records');
  } catch (err) {
    log(m.name, 'IRIS FAILED:', err.message);
  }

  try {
    const works = await fetchOrcid(m);
    const known = new Set(pubs.flatMap((p) => [p.doi && p.doi.toLowerCase(), normTitle(p.title)].filter(Boolean)));
    const extra = works.filter((w) => !(w.doi && known.has(w.doi.toLowerCase())) && !known.has(normTitle(w.title)));
    person.counts.orcidOnly = extra.length;
    log(m.name, 'ORCID ok:', works.length, 'works,', extra.length, 'not in IRIS');
    for (const w of extra) {
      pubs.push({ id: `orcid:${w.doi || normTitle(w.title).slice(0, 60)}`, source: 'orcid', ...w, authors: [], inPress: false, volume: '', number: '', pages: '', iris: '', oa: false, bibtex: '' });
    }
  } catch (err) {
    log(m.name, 'ORCID FAILED:', err.message);
  }

  for (const p of pubs) {
    const key = (p.doi && p.doi.toLowerCase()) || normTitle(p.title);
    const existing = pubIndex.get(key);
    if (existing) {
      if (!existing.members.includes(m.slug)) existing.members.push(m.slug);
      // prefer the IRIS record over an ORCID one
      if (existing.source === 'orcid' && p.source === 'iris') Object.assign(existing, p, { members: existing.members });
    } else {
      pubIndex.set(key, { ...p, members: [m.slug] });
    }
  }
  people.push(person);
}

const publications = [...pubIndex.values()].sort((a, b) => {
  const ya = a.inPress ? 9999 : a.year || 0, yb = b.inPress ? 9999 : b.year || 0;
  return yb - ya || a.title.localeCompare(b.title);
});

const meta = {
  fetchedAt: new Date().toISOString(),
  publications: publications.length,
  byMember: Object.fromEntries(people.map((p) => [p.slug, publications.filter((x) => x.members.includes(p.slug)).length])),
  sources: { iris: 'https://iris.polito.it', polito: 'https://www.polito.it/en/staff', orcid: 'https://orcid.org' },
};

if (!people.some((p) => p.counts.iris > 0)) {
  log('No publications fetched from IRIS; keeping the committed snapshot.');
  process.exit(offline ? 0 : 1);
}

await writeFile(path.join(outDir, 'people.json'), JSON.stringify(people, null, 2));
await writeFile(path.join(outDir, 'publications.json'), JSON.stringify(publications, null, 2));
await writeFile(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
log('wrote', publications.length, 'publications →', path.relative(process.cwd(), outDir));
