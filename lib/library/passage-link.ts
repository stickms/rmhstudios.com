/**
 * Passage links: a `?p=` code that names a stretch of a document's own text.
 *
 * The link carries the anchor, not a row. Nothing is stored and nothing is asked of the server, so any selection can
 * be linked whether or not it is highlighted, and the code holds the document's text only — a private highlight's
 * note is never part of it. The reader decodes the code and uses `exact` purely as a search string against the text it
 * already has (`resolveAnchor`); the decoded text is never rendered.
 *
 * Format: `v1.` + base64url(UTF-8 JSON `[unit, start, end, exact, prefix, suffix]`). Pure and client-safe; neither
 * function throws.
 */

import { createAnchor, type TextAnchor } from './text-anchor';
import { PASSAGE_CODE_MAX } from './passage-search';

export { PASSAGE_CODE_MAX, parsePassageSearch } from './passage-search';

export const PASSAGE_VERSION = 'v1.';
export const PASSAGE_EXACT_MAX = 300;
export const PASSAGE_CONTEXT_MAX = 32;
/** A library unit is "p12" (PDF page) or "c3" (EPUB chapter); an article's unit is ''. */
const UNIT_RE = /^(?:[pc]\d{1,6})?$/;
/** A marked span longer than this is not taken from a truncated link's `end`. */
const SPAN_MAX = 5000;

export interface PassageRef {
  unit: string;
  anchor: TextAnchor;
}

export interface EncodeLimits {
  exact: number;
  context: number;
}

const DEFAULT_LIMITS: EncodeLimits = { exact: PASSAGE_EXACT_MAX, context: PASSAGE_CONTEXT_MAX };

/** Cut to at most `max` UTF-16 units without leaving half a surrogate pair at the cut. */
function clip(s: string, max: number, fromEnd = false): string {
  if (s.length <= max) return s;
  let out = fromEnd ? s.slice(s.length - max) : s.slice(0, max);
  if (!fromEnd && /[\uD800-\uDBFF]$/.test(out)) out = out.slice(0, -1);
  if (fromEnd && /^[\uDC00-\uDFFF]/.test(out)) out = out.slice(1);
  return out;
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Encode an anchor. `exact` is cut to its first 300 characters (`end` is kept, so the reader can still mark the whole
 * selection), the context to 32 each side; if the code would still pass 900 characters (wide scripts), the text is
 * shortened further until it fits. Returns null for an anchor with no text or a malformed unit.
 */
export function encodePassage(anchor: TextAnchor, unit: string, limits: EncodeLimits = DEFAULT_LIMITS): string | null {
  if (!UNIT_RE.test(unit) || !anchor.exact) return null;
  if (!Number.isSafeInteger(anchor.start) || !Number.isSafeInteger(anchor.end)) return null;
  if (anchor.start < 0 || anchor.end <= anchor.start) return null;
  let exactMax = Math.min(limits.exact, PASSAGE_EXACT_MAX);
  let ctxMax = Math.min(limits.context, PASSAGE_CONTEXT_MAX);
  for (let i = 0; i < 40; i++) {
    const code =
      PASSAGE_VERSION +
      toBase64Url(
        JSON.stringify([
          unit,
          anchor.start,
          anchor.end,
          clip(anchor.exact, exactMax),
          clip(anchor.prefix, ctxMax, true),
          clip(anchor.suffix, ctxMax),
        ]),
      );
    if (code.length <= PASSAGE_CODE_MAX) return code;
    if (ctxMax > 0) ctxMax = Math.max(0, ctxMax - 8);
    else exactMax = Math.floor(exactMax * 0.85);
    if (exactMax < 1) return null;
  }
  return null;
}

const isIndex = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

/** Decode a code, or null when it is not a well-formed v1 code within the bounds. */
export function decodePassage(code: unknown): PassageRef | null {
  if (typeof code !== 'string' || code.length > PASSAGE_CODE_MAX || !code.startsWith(PASSAGE_VERSION)) return null;
  const json = fromBase64Url(code.slice(PASSAGE_VERSION.length));
  if (json === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(v) || v.length !== 6) return null;
  const [unit, start, end, exact, prefix, suffix] = v as unknown[];
  if (typeof unit !== 'string' || !UNIT_RE.test(unit)) return null;
  if (!isIndex(start) || !isIndex(end) || end <= start) return null;
  if (typeof exact !== 'string' || exact.length === 0 || exact.length > PASSAGE_EXACT_MAX) return null;
  if (typeof prefix !== 'string' || prefix.length > PASSAGE_CONTEXT_MAX) return null;
  if (typeof suffix !== 'string' || suffix.length > PASSAGE_CONTEXT_MAX) return null;
  return { unit, anchor: { exact, prefix, suffix, start, end } };
}

/** The end offset to mark: a link truncated to 300 characters keeps `end`, so the whole selection is marked. */
export function passageMarkEnd(anchor: TextAnchor, resolvedStart: number, textLength: number): number {
  const span = anchor.end - anchor.start;
  const len = span > anchor.exact.length && span <= SPAN_MAX ? span : anchor.exact.length;
  return Math.min(textLength, resolvedStart + len);
}

/** Anchor for a selection in a unit's text, trimmed of surrounding whitespace. */
export function selectionAnchor(text: string, start: number, end: number): TextAnchor | null {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s]!)) s++;
  while (e > s && /\s/.test(text[e - 1]!)) e--;
  return createAnchor(text, s, e);
}

/** The shareable link: the page's own path with `?p=`. The canonical link of the document is untouched. */
export function buildPassageUrl(origin: string, pathname: string, code: string): string {
  return `${origin}${pathname}?p=${code}`;
}

/** The composer's draft limit (`buildShareDraft` cuts at this). */
const DRAFT_MAX = 500;
const TITLE_MAX = 60;
const QUOTE_MIN = 40;

export interface PassageShare {
  text: string;
  url: string;
}

/**
 * What `/share` gets for "Post this passage": `text` is the passage in the locale's quotation marks followed by the
 * title, `url` is the passage link. The composer keeps 500 characters in all, so the link is built compact and the
 * quote is shortened (with an ellipsis) to leave the whole link in the draft.
 * `format(quote, title)` is the translated "“quote” — title".
 */
export function buildPassageShare(input: {
  anchor: TextAnchor;
  unit: string;
  title: string;
  origin: string;
  pathname: string;
  format: (quote: string, title: string) => string;
}): PassageShare | null {
  const { anchor, unit, origin, pathname, format } = input;
  const title = input.title.replace(/\s+/g, ' ').trim();
  const shortTitle = title.length > TITLE_MAX ? `${clip(title, TITLE_MAX - 1)}…` : title;
  const tries: EncodeLimits[] = [
    { exact: 120, context: 16 },
    { exact: 60, context: 8 },
    { exact: 40, context: 0 },
  ];
  for (const limits of tries) {
    const code = encodePassage(anchor, unit, limits);
    if (!code) return null;
    const url = buildPassageUrl(origin, pathname, code);
    const quote = anchor.exact.replace(/\s+/g, ' ').trim();
    const fixed = format('', shortTitle).length + 2;
    const room = DRAFT_MAX - url.length - fixed;
    if (room < Math.min(QUOTE_MIN, quote.length)) continue;
    const shown = quote.length > room ? `${clip(quote, Math.max(1, room - 1)).trimEnd()}…` : quote;
    return { text: format(shown, shortTitle), url };
  }
  return null;
}
