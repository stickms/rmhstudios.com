/**
 * SDN text rules shared by the parser and the extractor: the cheap prefilter, redaction of person-shaped strings
 * from forum text, the checks that a model output does not repeat a page handle, and the deterministic guards
 * that confirm (never originate) what the model claims. Pure: no I/O.
 */
import { cycleYearOf } from './cycle';
import type { MedEventType, MedProgram } from './types';

/** Handles shorter than this are matched as exact-case whole tokens (Q20), longer ones case-insensitively. */
const MIN_LONG_HANDLE_LENGTH = 3;

/**
 * Short handles that are ordinary words or forum shorthand: redacting or rejecting on them would shred normal
 * text, so they are never matched (compared case-insensitively).
 */
const SHORT_HANDLE_STOPLIST: ReadonlySet<string> = new Set([
  'a',
  'i',
  'r',
  'am',
  'an',
  'as',
  'at',
  'be',
  'by',
  'do',
  'go',
  'he',
  'hi',
  'id',
  'if',
  'ii',
  'in',
  'is',
  'it',
  'md',
  'me',
  'my',
  'no',
  'of',
  'oh',
  'ok',
  'on',
  'or',
  'so',
  'to',
  'up',
  'us',
  'wl',
  'we',
  'um',
  'uh',
  'ha',
  'ya',
  'yo',
  'ex',
  'ah',
]);

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const MENTION_RE = /@\w(?:[\w.-]*\w)?/g;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueTrimmed(handles: Iterable<string>): string[] {
  return [...new Set([...handles].map((h) => h.trim()).filter((h) => h.length > 0))];
}

function alternation(handles: string[]): string {
  // Longest first so "abc_def" wins over "abc_".
  return [...handles]
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
    .join('|');
}

/** Matchers for the handles: long ones case-insensitive, 1-2 character ones exact-case (Q20). Null when none qualify. */
function handleMatchers(handles: Iterable<string>): RegExp[] {
  const all = uniqueTrimmed(handles);
  const long = all.filter((h) => h.length >= MIN_LONG_HANDLE_LENGTH);
  const short = all.filter((h) => h.length < MIN_LONG_HANDLE_LENGTH && !SHORT_HANDLE_STOPLIST.has(h.toLowerCase()));
  const out: RegExp[] = [];
  if (long.length) out.push(new RegExp(`(?<![\\w])(?:${alternation(long)})(?![\\w])`, 'gi'));
  // A single character is a handle only as a standalone token: "x-ray" and "x2" stay untouched.
  const one = short.filter((h) => h.length === 1);
  const two = short.filter((h) => h.length === 2);
  if (two.length) out.push(new RegExp(`(?<![\\w])(?:${alternation(two)})(?![\\w])`, 'g'));
  if (one.length) out.push(new RegExp(`(?<![\\w-])(?:${alternation(one)})(?![\\w-])`, 'g'));
  return out;
}

/** Replaces URLs with [link], emails with [email], @mentions and any page handle with [user]. */
export function redactForModel(text: string, handles: Iterable<string> = []): string {
  let out = text.replace(URL_RE, '[link]').replace(EMAIL_RE, '[email]').replace(MENTION_RE, '[user]');
  for (const re of handleMatchers(handles)) out = out.replace(re, '[user]');
  return out;
}

/** True when `text` contains any of the handles (whole tokens; case-insensitive from 3 characters, exact-case below). */
export function containsHandle(text: string, handles: Iterable<string>): boolean {
  return handleMatchers(handles).some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

/* ------------------------------------------------------------------ */
/* Prefilter                                                          */
/* ------------------------------------------------------------------ */

/** The spec's capital-letter tokens; case-sensitive on purpose, otherwise "a" matches everything. */
export const SDN_PREFILTER_TOKENS = /\bII\b|\bA\b|\bWL\b|\bR\b/;
/** The spec's words plus secondary terms (S0b, Q16): the filter is a cost filter, secondary reports must pass. */
export const SDN_PREFILTER_WORDS = /interview|accept|waitlist|reject|question|secondar|2ndary/i;

/** True when a post is worth sending to the model. */
export function passesPrefilter(text: string): boolean {
  return SDN_PREFILTER_TOKENS.test(text) || SDN_PREFILTER_WORDS.test(text);
}

/* ------------------------------------------------------------------ */
/* Guards                                                             */
/* ------------------------------------------------------------------ */

/** SDN posts that do not label a program count as regular MD/DO (D1), like the owner Admit rule. */
export const SDN_UNLABELLED_PROGRAM: MedProgram = 'REG';

const PHD_TEXT_RE = /\b(?:md|do)[\s/\-–]*ph\.?d\b|\bmstp\b|\bph\.?d track\b/i;

/** PHD only when the model claims it AND the text says so; the guard confirms a claim, it never originates PHD. */
export function programGuard(claimed: MedProgram | undefined, text: string): MedProgram {
  return claimed === 'PHD' && PHD_TEXT_RE.test(text) ? 'PHD' : SDN_UNLABELLED_PROGRAM;
}

// "IS" is only the abbreviation in capitals ("is" is a word), and "OOS" likewise.
const IN_STATE_STRICT = (t: string) => /\bIS\b/.test(t) || /\bin[\s-]state\b/i.test(t);
const OUT_STATE_STRICT = (t: string) => /\bOOS\b/.test(t) || /\bout[\s-]of[\s-]state\b/i.test(t);

/** The claim stands only when the text states the same residency and not the opposite; otherwise unknown. */
export function inStateGuard(claimed: boolean | undefined, text: string): boolean | null {
  if (claimed === undefined) return null;
  const inState = IN_STATE_STRICT(text);
  const out = OUT_STATE_STRICT(text);
  if (claimed) return inState && !out ? true : null;
  return out && !inState ? false : null;
}

const DAY_MS = 86_400_000;
/** The furthest back from the post an event may be dated (Q12). */
export const EVENT_MAX_AGE_DAYS = 400;

function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * An event date is valid only if it belongs to the thread's cycle by its type's own rule, is not after the
 * post's UTC day, and is at most 400 days before it (Q12).
 */
export function eventDateOk(date: Date, type: MedEventType, postedAt: Date, cycleYear: number): boolean {
  if (cycleYearOf(date, type) !== cycleYear) return false;
  const post = utcDay(postedAt);
  const day = utcDay(date);
  return day <= post && post - day <= EVENT_MAX_AGE_DAYS * DAY_MS;
}

/* ------------------------------------------------------------------ */
/* Questions                                                          */
/* ------------------------------------------------------------------ */

/** Dedupe key only: lowercase, punctuation stripped, whitespace collapsed. */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits a blob of questions on newlines and after each question mark. */
export function splitQuestions(blob: string): string[] {
  return blob
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=\?)\s+/))
    .map((q) => q.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter((q) => q.length > 0);
}

const QUESTION_MIN = 12;
const QUESTION_MAX = 300;
const QUESTION_START_RE =
  /^(?:who|what|when|where|why|how|which|whose|do|does|did|is|are|was|were|can|could|would|should|will|have|has|tell|describe|explain|walk|give|discuss|name|talk|share|list|rank|compare|defend|justify)\b/i;
const PHONE_RE = /\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b|\+\d[\d\s().-]{7,}/;
const HONORIFIC_RE = /\b(?:Dr|Drs|Mr|Mrs|Ms|Mx|Prof|Professor)\.?\s+[A-Z][a-z]+/;

/** What a page can tell us about its handles: a set to match, or the page's own `containsHandle` closure. */
export type HandleSource =
  | Iterable<string>
  | {
      containsHandle(text: string): boolean;
    };

function hasHandle(text: string, handles: HandleSource): boolean {
  if (
    typeof (
      handles as {
        containsHandle?: unknown;
      }
    ).containsHandle === 'function'
  ) {
    return (
      handles as {
        containsHandle(text: string): boolean;
      }
    ).containsHandle(text);
  }
  return containsHandle(text, handles as Iterable<string>);
}

/**
 * Accepts a question only if it carries no person-shaped string; rejects, never redacts (D4). Returns the
 * trimmed, whitespace-collapsed text or null.
 */
export function scrubQuestion(text: string, handles: HandleSource): string | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length < QUESTION_MIN || t.length > QUESTION_MAX) return null;
  if (!t.includes('?') && !QUESTION_START_RE.test(t)) return null;
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]/.test(t)) return null;
  if (/(?:https?:\/\/|www\.)\S+/i.test(t)) return null;
  if (/@\w/.test(t)) return null;
  if (PHONE_RE.test(t)) return null;
  if (HONORIFIC_RE.test(t)) return null;
  if (hasHandle(t, handles)) return null;
  return t;
}
