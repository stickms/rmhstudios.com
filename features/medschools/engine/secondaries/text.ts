import type { MedProgram } from '../types';
import type { PromptLimit } from './types';

/**
 * Prompt text rules (pure, client-safe: no `node:`, no zod, no I/O). A prompt's wording arrives with its limit, its
 * optional marker and a list number mixed in; these functions pull them apart so two spellings of one prompt share a
 * key and the limit and optional flag are stored as facts, not text.
 */

export const MAX_TEXT = 1500;
export const MAX_KEY = 500;
export const MAX_LIMIT = 20000;

/** Control characters (tabs and newlines too) become spaces; format characters (zero-width, bidi marks, BOM) vanish. */
const CONTROL_RE = /\p{Cc}/gu;
const INVISIBLE_RE = /\p{Cf}/gu;

/** "250 words", "1,500 characters with spaces", "250-word limit", with a lead ("in", "max") and a tail ("or fewer"). */
const LIMIT_RE =
  /(?:\b(?:in\s+no\s+more\s+than|in\s+up\s+to|no\s+more\s+than|a\s+maximum\s+of|maximum\s+of|limit\s+of|limited\s+to|up\s+to|within|max(?:imum)?\.?|limit|in)\s*[:=]?\s*)?\b(\d[\d,]*)\s*-?\s*(words?|characters?|chars?)\b(?:\s+with(?:out)?\s+spaces)?(?:\s*(?:or\s+(?:fewer|less)|maximum|max|limit)\b)?/gi;

const LIST_MARKER_RE = /^(?:\(?[a-z0-9]{1,2}[.)]|q\s?\d+\s*[:.)])\s+/i;
const OPTIONAL_BRACKET_RE = /[([]\s*optional\s*[)\]]/gi;
const OPTIONAL_LEADING_RE = /^optional\s*[:\-–—]\s*/i;
const OPTIONAL_TRAILING_RE = /\s*[,:\-–—]\s*optional\.?$/i;

function clean(raw: string): string {
  return raw.normalize('NFKC').replace(INVISIBLE_RE, '').replace(CONTROL_RE, ' ').replace(/\s+/g, ' ').trim();
}

function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.5 ? cut.slice(0, space) : cut).trimEnd();
}

/** The display text (markers removed), the limit and the optional flag of one prompt as a source wrote it. */
export function parsePromptText(raw: string): { text: string; limit: PromptLimit | null; optional: boolean } {
  let t = clean(raw);
  t = t.replace(LIST_MARKER_RE, '');

  let limit: PromptLimit | null = null;
  let seen = false;
  t = t.replace(LIMIT_RE, (_m, num: string, unit: string) => {
    if (!seen) {
      seen = true;
      const value = Number(num.replace(/,/g, ''));
      if (Number.isInteger(value) && value >= 1 && value <= MAX_LIMIT) {
        limit = { kind: /^w/i.test(unit) ? 'WORDS' : 'CHARS', value };
      }
    }
    return ' ';
  });

  // What the limit phrase leaves behind: "(Optional, )", "()", "faced, .", " ."
  t = t
    .replace(/[,;:]\s*([)\]])/g, '$1')
    .replace(/[([]\s*[,;:.–—-]*\s*[)\]]/g, ' ')
    .replace(/\s+([.,;:?!])/g, '$1')
    .replace(/,\s*([.?!])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  let optional = false;
  const dropOptional = (re: RegExp) => {
    if (re.test(t)) {
      optional = true;
      t = t.replace(re, ' ');
    }
  };
  dropOptional(OPTIONAL_BRACKET_RE);
  t = t.trim();
  dropOptional(OPTIONAL_LEADING_RE);
  t = t.trim();
  dropOptional(OPTIONAL_TRAILING_RE);

  t = t
    .replace(/\s+([.,;:?!])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(LIST_MARKER_RE, '');
  return { text: cutAtWord(t, MAX_TEXT), limit, optional };
}

/** The identity of a prompt's wording (D2): equal keys are one prompt. Empty text has the empty key. */
export function secondaryKey(text: string): string {
  const cleaned = parsePromptText(text).text;
  const key = cleaned
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    // An apostrophe stays only inside a word ("don't"); a quote mark around one is punctuation.
    .replace(/(?<![\p{L}\p{N}])'|'(?![\p{L}\p{N}])/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return key.length > MAX_KEY ? key.slice(0, MAX_KEY).trimEnd() : key;
}

/** A combined-degree phrase in the prompt or in the heading it sits under (D7). */
export const PHD_RE =
  /\b(?:md[\s/-]*ph\.?d|do[\s/-]*ph\.?d|mstp|combined\s+(?:degree|program)|dual[\s-]degree|physician[\s-]scientist\s+program)\b/i;

/** `PHD` when the text or its section heading names a combined-degree program, otherwise `REG`. */
export function classifyProgram(text: string, heading?: string): MedProgram {
  return PHD_RE.test(text) || (heading !== undefined && PHD_RE.test(heading)) ? 'PHD' : 'REG';
}
