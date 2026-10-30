/**
 * Community Hub discussions as pure rules: how text is cleaned and validated, and the
 * limits. Client-safe. See docs/superpowers/specs/2026-10-30-game-community-hub-design.md.
 */

export const MIN_TITLE = 3;
export const MAX_TITLE = 120;
export const MAX_THREAD_BODY = 4000;
export const MAX_POST = 2000;
export const MAX_THREADS_PER_DAY = 10;
export const MAX_POSTS_PER_HOUR = 30;
export const PAGE_SIZE = 20;
export const MAX_REPLIES_SHOWN = 100;

/** Control characters other than tab and newline. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/**
 * Normalise user text: no control characters, `\n` line ends, runs of blank lines
 * collapsed to one, trimmed. Markup is NOT touched (it is rendered as text).
 */
export function cleanText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export type ThreadCheck =
  | { ok: true; title: string; body: string }
  | { ok: false; reason: 'title' | 'body' };

export function validateThread(input: { title: string; body: string }): ThreadCheck {
  // A title is one line.
  const title = cleanText(input.title).replace(/\s*\n\s*/g, ' ');
  if (title.length < MIN_TITLE || title.length > MAX_TITLE) return { ok: false, reason: 'title' };
  const body = cleanText(input.body);
  if (body.length < 1 || body.length > MAX_THREAD_BODY) return { ok: false, reason: 'body' };
  return { ok: true, title, body };
}

export type PostCheck = { ok: true; body: string } | { ok: false; reason: 'body' };

export function validatePost(input: string): PostCheck {
  const body = cleanText(input);
  if (body.length < 1 || body.length > MAX_POST) return { ok: false, reason: 'body' };
  return { ok: true, body };
}

/** A one-line preview, cut on a word boundary. */
export function snippet(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return `${(at > 0 ? cut.slice(0, at) : cut).trimEnd()}…`;
}
