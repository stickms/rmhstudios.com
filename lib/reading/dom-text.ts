/**
 * DOM ⇄ text-offset mapping for highlights (client-only; uses Range/Selection).
 *
 * `text-anchor.ts` works on a flat string. The page is a DOM, so a highlight has
 * to be translated both ways: a user's Selection becomes offsets into the
 * container's text (to create an anchor), and a resolved anchor becomes a Range
 * (to paint). The "document text" is the concatenation of the container's text
 * nodes in order, with a single "\n" inserted wherever a new block begins so
 * sentence detection does not glue paragraphs together. Anything inside an
 * element marked `data-rf-skip` (footnote bodies, popovers, tool chrome) is not
 * part of the document text, so injecting those never shifts an offset.
 */

export interface TextIndex {
  text: string;
  entries: Array<{ node: Text; start: number; end: number }>;
  byNode: Map<Node, { start: number; end: number }>;
}

const BLOCK = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,pre,figcaption,td,th,dt,dd,div,section,article';
const SKIP = '[data-rf-skip]';

export function buildTextIndex(root: Element): TextIndex {
  const entries: TextIndex['entries'] = [];
  const byNode: TextIndex['byNode'] = new Map();
  let text = '';
  let lastBlock: Element | null = null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP)) return NodeFilter.FILTER_REJECT;
      if (parent.closest('script,style')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text;
    const value = node.data;
    if (value.length === 0) continue;
    const block = node.parentElement!.closest(BLOCK);
    if (lastBlock !== null && block !== lastBlock && text.length > 0 && !text.endsWith('\n')) {
      text += '\n';
    }
    lastBlock = block;
    const start = text.length;
    text += value;
    const rec = { node, start, end: text.length };
    entries.push(rec);
    byNode.set(node, rec);
  }
  return { text, entries, byNode };
}

function pointToOffset(
  index: TextIndex,
  container: Node,
  offset: number,
  atEnd: boolean,
): number | null {
  const direct = index.byNode.get(container);
  if (direct) return direct.start + Math.min(offset, direct.end - direct.start);
  if (container.nodeType === Node.TEXT_NODE) return null; // a skipped text node
  const child = container.childNodes[offset];
  if (child) {
    for (const e of index.entries) {
      if (child === e.node || child.contains(e.node)) return e.start;
    }
  }
  // After the last child (or the child holds no indexed text): the end of the
  // last indexed text inside the container, or the start of the next one after it.
  let last: number | null = null;
  for (const e of index.entries) {
    if (container.contains(e.node)) last = e.end;
    else if (last !== null) break;
  }
  if (last !== null) return last;
  for (const e of index.entries) {
    if (container.compareDocumentPosition(e.node) & Node.DOCUMENT_POSITION_FOLLOWING)
      return e.start;
  }
  return atEnd ? index.text.length : 0;
}

/** Offsets of a Range within the indexed text, trimmed of surrounding whitespace. */
export function rangeToOffsets(
  index: TextIndex,
  range: Range,
): { start: number; end: number } | null {
  let start = pointToOffset(index, range.startContainer, range.startOffset, false);
  let end = pointToOffset(index, range.endContainer, range.endOffset, true);
  if (start === null || end === null) return null;
  if (end < start) [start, end] = [end, start];
  while (start < end && /\s/.test(index.text[start]!)) start++;
  while (end > start && /\s/.test(index.text[end - 1]!)) end--;
  return end > start ? { start, end } : null;
}

function locate(
  index: TextIndex,
  offset: number,
  preferNext: boolean,
): { node: Text; offset: number } | null {
  const { entries } = index;
  let lo = 0;
  let hi = entries.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const e = entries[mid]!;
    if (offset < e.start) hi = mid - 1;
    else if (offset > e.end) lo = mid + 1;
    else {
      // offset === e.end may also be the start of the next entry.
      if (
        preferNext &&
        offset === e.end &&
        entries[mid + 1] &&
        entries[mid + 1]!.start === offset
      ) {
        return { node: entries[mid + 1]!.node, offset: 0 };
      }
      return { node: e.node, offset: offset - e.start };
    }
  }
  // Fell in a virtual separator between blocks: snap forward / backward.
  const next = entries[lo];
  const prev = entries[lo - 1];
  if (preferNext && next) return { node: next.node, offset: 0 };
  if (prev) return { node: prev.node, offset: prev.node.data.length };
  return next ? { node: next.node, offset: 0 } : null;
}

export function offsetsToRange(index: TextIndex, start: number, end: number): Range | null {
  const a = locate(index, start, true);
  const b = locate(index, end, false);
  if (!a || !b) return null;
  try {
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    return range.collapsed ? null : range;
  } catch {
    return null;
  }
}

/* ── CSS Custom Highlight API (no DOM mutation, so React-owned markup is untouched) ── */

interface HighlightLike {
  add: (range: Range) => void;
}
interface HighlightRegistry {
  set: (name: string, h: HighlightLike) => void;
  delete: (name: string) => void;
}
type HighlightCtor = new (...ranges: Range[]) => HighlightLike;

export function supportsCustomHighlights(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    'highlights' in CSS &&
    typeof (globalThis as { Highlight?: unknown }).Highlight === 'function'
  );
}

export function paintHighlight(name: string, ranges: Range[]): void {
  if (!supportsCustomHighlights()) return;
  const registry = (CSS as unknown as { highlights: HighlightRegistry }).highlights;
  const Ctor = (globalThis as unknown as { Highlight: HighlightCtor }).Highlight;
  if (ranges.length === 0) {
    registry.delete(name);
    return;
  }
  registry.set(name, new Ctor(...ranges));
}

export function clearHighlight(name: string): void {
  if (!supportsCustomHighlights()) return;
  (CSS as unknown as { highlights: HighlightRegistry }).highlights.delete(name);
}
