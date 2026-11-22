/**
 * The spoken text of an article (feature 12, Listen).
 *
 * The page's rendered block elements become an ordered list of speech
 * segments. The core, `buildSegments`, works on a small description of each
 * block so it can be tested without a DOM; `collectSpeechBlocks` is the thin
 * adapter that reads those descriptions from the rendered article. Words that
 * are spoken but not on the page ("Code block skipped", "Image:") arrive as
 * translated labels from the component, so this module holds no strings.
 */

export type SpeechBlockKind = 'text' | 'code' | 'image';

/** One block of the page, in document order. `E` is whatever the caller highlights. */
export interface SpeechBlock<E> {
  kind: SpeechBlockKind;
  /** Text content, or the alt text for an image. Ignored for code. */
  text: string;
  element: E;
}

export interface SpeechLabels {
  codeSkipped: string;
  /** The spoken form of an image's alt text. */
  image: (alt: string) => string;
}

export interface SpeechSegment<E> {
  /** Position in the list, which is also the paragraph index the reader reports. */
  index: number;
  text: string;
  element: E;
}

/** `[^1]` style markers and bare bracketed numbers (`[3]`) that point at a note. */
const FOOTNOTE_MARKER = /\[\^[A-Za-z0-9_-]{1,40}\]|\[\d{1,3}\]/g;

/** Collapse whitespace and drop footnote reference markers. */
export function cleanSpeechText(raw: string): string {
  return raw.replace(FOOTNOTE_MARKER, '').replace(/\s+/g, ' ').trim();
}

export function buildSegments<E>(blocks: readonly SpeechBlock<E>[], labels: SpeechLabels): SpeechSegment<E>[] {
  const out: SpeechSegment<E>[] = [];
  for (const block of blocks) {
    let text: string;
    if (block.kind === 'code') text = labels.codeSkipped;
    else if (block.kind === 'image') {
      const alt = cleanSpeechText(block.text);
      if (!alt) continue;
      text = labels.image(alt);
    } else text = cleanSpeechText(block.text);
    if (!text) continue;
    out.push({
      index: out.length,
      text,
      element: block.element,
    });
  }
  return out;
}

/** Elements whose text is never read: footnote refs, the notes list, tool chrome. */
const SKIPPED = '[data-rf-skip],[aria-hidden="true"],[hidden]';
/** Descendants a list item hands to their own block. */
const OWN_BLOCK = 'ul,ol,p,pre,blockquote,table';
const BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,pre,img';

/** Text of `el`, leaving out skipped subtrees and (for `own`) nested blocks. */
function textOf(el: Element, own: boolean): string {
  let out = '';
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) out += child.textContent ?? '';
      else if (child.nodeType === 1) {
        const c = child as Element;
        if (c.matches(SKIPPED) || (own && c.matches(OWN_BLOCK))) continue;
        if (c.tagName === 'BR') out += ' ';
        else walk(c);
      }
    }
  };
  walk(el);
  return out;
}

/** Read the block descriptions from a rendered article, in document order. */
export function collectSpeechBlocks(root: Element): SpeechBlock<Element>[] {
  const blocks: SpeechBlock<Element>[] = [];
  for (const el of Array.from(root.querySelectorAll(BLOCKS))) {
    if (el.closest(SKIPPED)) continue;
    const tag = el.tagName;
    if (tag === 'PRE')
      blocks.push({
        kind: 'code',
        text: '',
        element: el,
      });
    else if (tag === 'IMG')
      blocks.push({
        kind: 'image',
        text: el.getAttribute('alt') ?? '',
        element: el.closest('figure') ?? el,
      });
    else if (el.closest('pre')) continue;
    else
      blocks.push({
        kind: 'text',
        text: textOf(el, tag === 'LI'),
        element: el,
      });
  }
  return blocks;
}
