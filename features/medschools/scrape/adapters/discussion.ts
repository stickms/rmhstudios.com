import type { HTMLElement } from 'node-html-parser';

/**
 * Shared by the secondary-prompt page parsers: true when an element sits inside a comment or discussion block (or an
 * `aside`), whatever it looks like. Prompt-shaped elements in there are people's replies, never the school's wording,
 * and a heading in there must not change which program the prompts after it belong to.
 */
const DISCUSSION_RE = /comment|discussion|reply|replies/i;

export function inDiscussion(el: HTMLElement): boolean {
  for (let n = el.parentNode as HTMLElement | null; n; n = n.parentNode as HTMLElement | null) {
    if (n.tagName === 'ASIDE') return true;
    if (DISCUSSION_RE.test(n.getAttribute?.('class') ?? '')) return true;
  }
  return false;
}
