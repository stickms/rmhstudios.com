/**
 * Article outline ("Contents") for long blog and news posts. Pure.
 *
 * `extractOutline` reads the `##` and `###` headings out of the Markdown source
 * (skipping fenced code), in document order, and gives each a stable, unique,
 * URL-safe id. The article renderer assigns those ids to the rendered headings
 * so the outline links — and a reader's own `#section` links — land on them.
 * The outline is derived from the source rather than the DOM so it can render
 * in the server HTML with no layout shift.
 */

export interface OutlineItem {
  id: string;
  text: string;
  /** 2 for `##`, 3 for `###`. */
  level: 2 | 3;
}

/** Fewer headings than this and a table of contents is clutter, not help. */
export const MIN_OUTLINE_ITEMS = 3;

const HEADING = /^ {0,3}(#{2,3})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const FENCE = /^ {0,3}(```|~~~)/;

/** Heading source → the plain text a reader sees (links, emphasis and code unwrapped). */
export function plainHeadingText(src: string): string {
  return src
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Text → id slug. Keeps letters and digits of any script; everything else becomes `-`. */
export function slugifyHeading(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'section';
}

export function extractOutline(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const seen = new Map<string, number>();
  let fence: string | null = null;
  for (const line of markdown.split('\n')) {
    const f = FENCE.exec(line);
    if (f) {
      if (fence === null) fence = f[1];
      else if (fence === f[1]) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const m = HEADING.exec(line);
    if (!m) continue;
    const text = plainHeadingText(m[2]);
    if (!text) continue;
    const base = slugifyHeading(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    items.push({ id: n === 0 ? base : `${base}-${n + 1}`, text, level: m[1].length as 2 | 3 });
  }
  return items;
}
