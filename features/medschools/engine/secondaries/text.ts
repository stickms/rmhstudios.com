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

/** More prompts than this under one cycle heading is a page we misread, not a school with that many essays. */
export const MAX_PER_SECTION = 40;
/** The oldest entry year a page label may name (the cycle table starts later; this only rejects typos). */
export const MIN_CYCLE_YEAR = 2005;

const RANGE_LABEL_RE = /^(\d{4})\s*[-‐-―/]\s*(\d{2}|\d{4})$/;
const YEAR_LABEL_RE = /^(\d{4})$/;

/**
 * Entry year from a cycle label as a source writes it: "2024-2025", "2024–2025" and "2024-25" are 2025 (the
 * 2024–2025 cycle, entry year 2025); a bare "2025" is read as the entry year as written. No live source writes a bare year (verified
 * 2026-11-23): SDN writes ranges, and Admit's numeric year is the APPLICATION year, so its adapter passes `${y}-${y + 1}`. Null for anything else, for a range whose second year is not the first plus one, for a
 * year below 2005 and, when `currentCycle` is given, for a year after it (a cycle that has not begun).
 */
export function cycleLabelToEntryYear(label: string, currentCycle?: number): number | null {
  const t = label.normalize('NFKC').trim();
  let year: number;
  const range = RANGE_LABEL_RE.exec(t);
  if (range) {
    const first = Number(range[1]);
    const rawSecond = range[2] ?? '';
    const second = rawSecond.length === 2 ? Math.floor(first / 100) * 100 + Number(rawSecond) : Number(rawSecond);
    if (second !== first + 1) return null;
    year = second;
  } else {
    const bare = YEAR_LABEL_RE.exec(t);
    if (!bare) return null;
    year = Number(bare[1]);
  }
  if (year < MIN_CYCLE_YEAR) return null;
  if (currentCycle !== undefined && year > currentCycle) return null;
  return year;
}
