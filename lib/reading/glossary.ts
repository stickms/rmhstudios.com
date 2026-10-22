/**
 * Lore glossary matching (idea L6) — pure and client-safe.
 *
 * Known terms (and their aliases) auto-link to a popover, at most once per term
 * per page. This module builds one case-insensitive matcher from the cached term
 * list and finds first occurrences; it never runs per keystroke — only when an
 * article or reader unit renders.
 */

import type { GlossaryTermView } from './schema';

export interface GlossaryMatcher {
  regex: RegExp;
  byPhrase: Map<string, GlossaryTermView>;
}

export interface GlossaryMatch {
  start: number;
  end: number;
  term: GlossaryTermView;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildGlossaryMatcher(terms: GlossaryTermView[]): GlossaryMatcher | null {
  const byPhrase = new Map<string, GlossaryTermView>();
  for (const t of terms) {
    for (const phrase of [t.term, ...t.aliases]) {
      const key = norm(phrase);
      if (key.length >= 2 && !byPhrase.has(key)) byPhrase.set(key, t);
    }
  }
  if (byPhrase.size === 0) return null;
  // Longest phrase first, so "Lunar Court" wins over "Lunar".
  const alternation = [...byPhrase.keys()]
    .sort((a, b) => b.length - a.length)
    .map((p) => escapeRe(p).replace(/ /g, '\\s+'))
    .join('|');
  const regex = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternation})(?![\\p{L}\\p{N}_])`, 'giu');
  return { regex, byPhrase };
}

/**
 * First occurrences in `text` of terms not already in `seen` (which is updated).
 * `seen` is shared across calls so "once per page" holds over many text nodes.
 */
export function findGlossaryMatches(
  text: string,
  matcher: GlossaryMatcher,
  seen: Set<string>,
): GlossaryMatch[] {
  const out: GlossaryMatch[] = [];
  matcher.regex.lastIndex = 0;
  for (const m of text.matchAll(matcher.regex)) {
    const term = matcher.byPhrase.get(norm(m[0]));
    if (!term || seen.has(term.id)) continue;
    seen.add(term.id);
    out.push({ start: m.index, end: m.index + m[0].length, term });
  }
  return out;
}

/* ── rehype plugin: wrap first occurrences in <span data-glossary="id"> ── */

interface HastText {
  type: 'text';
  value: string;
}
interface HastElement {
  type: 'element';
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastNode[];
}
type HastNode = HastText | HastElement | { type: string; children?: HastNode[] };

const SKIP_TAGS = new Set([
  'a',
  'code',
  'pre',
  'button',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'script',
  'style',
]);

/** A rehype plugin factory; pass the result in `rehypePlugins={[…]}`. */
export function rehypeGlossary(matcher: GlossaryMatcher | null) {
  return () => (tree: HastNode) => {
    if (!matcher) return;
    const seen = new Set<string>();
    const walk = (node: HastNode) => {
      const children = (node as HastElement).children;
      if (!children) return;
      if (node.type === 'element') {
        const el = node as HastElement;
        if (SKIP_TAGS.has(el.tagName) || el.properties?.['dataRfSkip'] !== undefined) return;
      }
      const next: HastNode[] = [];
      for (const child of children) {
        if (child.type !== 'text') {
          walk(child);
          next.push(child);
          continue;
        }
        const value = (child as HastText).value;
        const matches = findGlossaryMatches(value, matcher, seen);
        if (matches.length === 0) {
          next.push(child);
          continue;
        }
        let at = 0;
        for (const m of matches) {
          if (m.start > at) next.push({ type: 'text', value: value.slice(at, m.start) });
          next.push({
            type: 'element',
            tagName: 'span',
            properties: { 'data-glossary': m.term.id },
            children: [{ type: 'text', value: value.slice(m.start, m.end) }],
          });
          at = m.end;
        }
        if (at < value.length) next.push({ type: 'text', value: value.slice(at) });
      }
      (node as HastElement).children = next;
    };
    walk(tree);
  };
}
