// Small helpers shared by pages and components.

/** Prefix a root-relative path with the configured base (see astro.config.mjs). */
export function href(path: string): string {
  if (/^(https?:|mailto:|#)/.test(path)) return path;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

export const nav = [
  { label: 'Research', path: '/#research' },
  { label: 'People', path: '/people/' },
  { label: 'Publications', path: '/publications/' },
  { label: 'Projects & Tools', path: '/projects/' },
] as const;

export type Pub = {
  id: string;
  source: 'iris' | 'orcid';
  title: string;
  authors: string[];
  year: number | null;
  inPress: boolean;
  type: 'journal' | 'conference' | 'chapter' | 'book' | 'patent' | 'other';
  venue: string;
  volume: string;
  number: string;
  pages: string;
  doi: string;
  url: string;
  iris: string;
  oa: boolean;
  bibtex: string;
  members: string[];
};

export const typeLabel: Record<Pub['type'], string> = {
  journal: 'journal',
  conference: 'conference',
  chapter: 'chapter',
  book: 'book',
  patent: 'patent',
  other: 'other',
};

/** "A. Benso, G. Politano et al." style author line. */
export function authorLine(authors: string[], max = 6): string {
  if (!authors.length) return '';
  return authors.length > max ? `${authors.slice(0, max).join(', ')} et al.` : authors.join(', ');
}

export function venueLine(p: Pub): string {
  const bits = [p.venue];
  if (p.volume) bits.push(p.number ? `${p.volume}(${p.number})` : p.volume);
  if (p.pages) bits.push(p.pages.replace('--', '–'));
  return bits.filter(Boolean).join(', ');
}
