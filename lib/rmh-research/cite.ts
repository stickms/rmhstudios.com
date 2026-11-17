/**
 * Citation formats for an archive paper: the one-line reference shown on the
 * site and the BibTeX entry behind the "Cite" control. Pure string builders.
 */
import type { Author, Paper } from './types';

/** `Mara Ellison-Vance` → `Ellison-Vance, M.` */
export function invertName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const family = parts.pop() ?? name;
  const initials = parts.map((p) => `${p.charAt(0)}.`).join(' ');
  return initials ? `${family}, ${initials}` : family;
}

/** The family name, for a short byline and a BibTeX key. */
export function familyName(name: string): string {
  return name.trim().split(/\s+/).pop() ?? name;
}

/** `Ellison-Vance, M., Okafor, T., & Brandt, L.`, or the institutional byline. */
export function authorLine(paper: Paper, authors: readonly Author[]): string {
  if (authors.length === 0) return paper.byline ?? 'RMH Research';
  const names = authors.map((a) => invertName(a.name));
  if (names.length === 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`;
}

/** A one-line reference: authors (year). Title. Venue. */
export function formatReference(paper: Paper, authors: readonly Author[]): string {
  return `${authorLine(paper, authors)} (${paper.year}). ${paper.title}. ${paper.venue}.`;
}

const bibEscape = (s: string) => s.replace(/([{}&%$#_])/g, '\\$1');

export function bibtex(paper: Paper, authors: readonly Author[], url: string): string {
  const first = authors[0];
  const stem = first ? familyName(first.name) : 'rmhresearch';
  const key = `${stem.toLowerCase().replace(/[^a-z]/g, '')}${paper.year}${paper.id.replace(/[^a-z0-9]/g, '').slice(0, 12)}`;
  const author = authors.length ? authors.map((a) => a.name).join(' and ') : `{${paper.byline ?? 'RMH Research'}}`;
  return [
    `@article{${key},`,
    `  title   = {${bibEscape(paper.title)}},`,
    `  author  = {${bibEscape(author)}},`,
    `  journal = {${bibEscape(paper.venue)}},`,
    `  year    = {${paper.year}},`,
    `  url     = {${url}}`,
    `}`,
  ].join('\n');
}
