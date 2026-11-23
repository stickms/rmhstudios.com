/**
 * Retrieved forum text is data, twice (plan R8): it was redacted and rewritten at ingest, and it is cleaned again here
 * before it reaches a prompt. Pure.
 */

const ZERO_WIDTH = new RegExp('[\\u200b-\\u200d\\u2060\\ufeff]', 'g');
const TAGS = /<\s*\/?\s*user-content\s*>/gi;
const URLS = /\b(?:https?:\/\/|www\.)\S+/gi;
const HANDLES = /(?<![\p{L}\p{N}_])(?:@|u\/|r\/)[\p{L}\p{N}_-]+/giu;

/** Control characters, `<user-content>` tags, URLs and handles removed, whitespace collapsed, capped at `max` on a word. */
export function cleanForPrompt(text: string, max = 300): string {
  const cleaned = text
    .replace(/\p{Cc}/gu, ' ')
    .replace(ZERO_WIDTH, '')
    .replace(TAGS, ' ')
    .replace(URLS, ' ')
    .replace(HANDLES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= max) return cleaned;
  // Cut on a code-point boundary, then back to the last space when that does not discard most of the text.
  const chars = [...cleaned];
  let cut = chars.slice(0, max).join('');
  const nextIsBreak = /\s/.test(chars[max] ?? ' ');
  if (!nextIsBreak) {
    const at = cut.lastIndexOf(' ');
    if (at > max / 2) cut = cut.slice(0, at);
  }
  return cut.trimEnd();
}
