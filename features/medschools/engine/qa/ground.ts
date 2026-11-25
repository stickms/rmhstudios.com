/**
 * The grounding validator (spec section 12, plan R7): what a member sees is only what survives this. A segment is kept
 * only if every cite is a retrieved fact, it cites at least one, every number in it (digits or spelled out) is a number
 * of a cited numeric fact, it has no link or markup, and (optionally) it does not repeat the system prompt. Pure; the
 * prompt is guidance, this is the guarantee. Dropped segments are not repaired.
 *
 * What it guarantees, exactly (plan R17): digit figures and number words match a cited trusted fact (for a segment that
 * cites facts of several schools, a fact of a school the sentence names); no link, bare domain (lookalike dots and
 * zero-width characters included) or markup; no long run of the system prompt; no format characters (bidi, zero-width)
 * in what is shown. What it does NOT guarantee: that digit-free prose is true. A sentence may paraphrase or quote
 * member-reported (untrusted) text such as interview questions, because that is what such an answer is; it is shown
 * with its citation and the page says those facts are member-reported.
 */
import { extractNumberTokens, tokensEqual } from './numbers';
import type { DropReason, Grounded, GroundedSegment, RetrievedFact } from './types';

export const LIMITS = { segments: 8, segmentChars: 400, totalChars: 1200 } as const;

const MARKUP_RE = /https?:|www\.|\]\(|<[a-z/]|\bhref\b|@\w/i;
const TLDS =
  'com|org|net|edu|gov|io|co|ai|app|dev|xyz|info|me|ly|us|uk|ru|cn|tv|cc|biz|online|site|link|top|club|example|test';
/**
 * What a reader (or a browser's address bar) takes for a dot: the ideographic, full-width, small and half-width full
 * stops, a bracketed "[.]" or "(dot)", and a dot with spaces round it before a common TLD ("evil . com", "evil .com").
 * Used only to look for a domain; the text that is kept is never rewritten with it.
 */
export function dotsNormalised(text: string): string {
  return text
    .replace(/\p{Cf}/gu, '')
    .replace(/[\u3002\uff0e\ufe52\uff61\u2024\u2e2e]/g, '.')
    .replace(/\s*[[({]\s*(?:\.|dot)\s*[\])}]\s*/gi, '.')
    .replace(new RegExp(`\\s+\\.\\s+(?=(?:${TLDS})(?![\\p{L}]))`, 'giu'), '.')
    .replace(new RegExp(`\\s\\.(?=(?:${TLDS})(?![\\p{L}]))`, 'giu'), '.');
}
// A bare domain ("evil.example"): a label, a dot and a letters-only tail.
const DOMAIN_SOURCE =
  '(?<![\\p{L}\\p{N}])[\\p{L}\\p{N}][\\p{L}\\p{N}-]*(?:\\.[\\p{L}\\p{N}-]+)*\\.\\p{L}{2,}(?![\\p{L}\\p{N}])';
const domainsIn = (s: string): string[] =>
  (dotsNormalised(s).match(new RegExp(DOMAIN_SOURCE, 'gu')) ?? []).map((d) => d.toLowerCase());
const LEAK_WINDOW = 6;

const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** True when `text` shares a run of `LEAK_WINDOW` words with any of `secrets` (the system prompt). */
function leaks(text: string, secrets: readonly string[]): boolean {
  const w = words(text);
  if (w.length < LEAK_WINDOW) return false;
  for (const secret of secrets) {
    const hay = ` ${words(secret).join(' ')} `;
    for (let i = 0; i + LEAK_WINDOW <= w.length; i++) {
      if (hay.includes(` ${w.slice(i, i + LEAK_WINDOW).join(' ')} `)) return true;
    }
  }
  return false;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The names a sentence may call a school by, per slug (short name, full name). */
export type SchoolNames = ReadonlyMap<string, readonly string[]>;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (text: string, name: string): boolean =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name)}(?![\\p{L}\\p{N}])`, 'iu').test(text);

/**
 * What the validator reads of a fact: its ref, its text (the allowed numbers), whether it is untrusted forum text and
 * its school. The Ask passes `RetrievedFact`s; the list builder (phase D) passes its own facts, the member's included
 * (`schoolSlug` null, trusted: figures the member typed about themselves).
 */
export type GroundFact = Pick<RetrievedFact, 'ref' | 'text' | 'untrusted' | 'schoolSlug'>;

export function groundAnswer(
  raw: unknown,
  facts: readonly GroundFact[],
  opts: { secrets?: readonly string[]; schoolNames?: SchoolNames } = {},
): Grounded {
  const empty: Grounded = { segments: [], dropped: 0, reasons: ['empty'], citedRefs: [] };
  if (!isObject(raw) || !Array.isArray(raw.segments) || raw.segments.length === 0) return empty;

  const byRef = new Map(facts.map((f) => [f.ref, f] as const));
  // A source's own name ("Admit.org") is a domain-shaped word in OUR fact text, so a sentence may say it. Only text that
  // came from our own columns counts: a domain planted in forum text (untrusted) is never allowed.
  const ownDomains = new Set(facts.filter((f) => !f.untrusted).flatMap((f) => domainsIn(f.text)));
  const reasons: DropReason[] = [];
  const note = (r: DropReason) => {
    if (!reasons.includes(r)) reasons.push(r);
  };
  const kept: GroundedSegment[] = [];
  const citedRefs: string[] = [];
  let dropped = 0;
  let totalChars = 0;

  const input: unknown[] = raw.segments;
  if (input.length > LIMITS.segments) {
    dropped += input.length - LIMITS.segments;
    note('over-limit');
  }
  for (const seg of input.slice(0, LIMITS.segments)) {
    const drop = (r: DropReason) => {
      dropped += 1;
      note(r);
    };
    if (!isObject(seg) || typeof seg.text !== 'string' || !Array.isArray(seg.cites)) {
      drop('empty');
      continue;
    }
    // What is shown is what is validated: bidi overrides/isolates and zero-width characters are removed, not judged.
    const text = seg.text.replace(/\p{Cf}/gu, '').trim();
    if (text.length === 0) {
      drop('empty');
      continue;
    }
    if (text.length > LIMITS.segmentChars || totalChars + text.length > LIMITS.totalChars) {
      drop('over-limit');
      continue;
    }
    if (MARKUP_RE.test(text) || MARKUP_RE.test(dotsNormalised(text)) || domainsIn(text).some((d) => !ownDomains.has(d))) {
      drop('link');
      continue;
    }
    if (opts.secrets && leaks(text, opts.secrets)) {
      drop('leak');
      continue;
    }
    if (!seg.cites.every((c): c is string => typeof c === 'string' && byRef.has(c))) {
      drop('unknown-cite');
      continue;
    }
    const cites = [...new Set(seg.cites as string[])];
    if (cites.length === 0) {
      drop('no-cite');
      continue;
    }
    const tokens = extractNumberTokens(text);
    if (tokens.length > 0) {
      const numeric = cites.map((c) => byRef.get(c)!).filter((f) => !f.untrusted);
      if (numeric.length === 0) {
        drop('untrusted-number');
        continue;
      }
      // A sentence that cites facts of more than one school may take a number only from a fact of a school it names.
      const schools = new Set(numeric.map((f) => f.schoolSlug).filter((x): x is string => x !== null));
      const names = opts.schoolNames;
      const usable =
        schools.size > 1 && names
          ? numeric.filter(
              (f) => f.schoolSlug === null || (names.get(f.schoolSlug) ?? []).some((n) => mentions(text, n)),
            )
          : numeric;
      const allowed = usable.flatMap((f) => extractNumberTokens(f.text));
      if (!tokens.every((t) => allowed.some((a) => tokensEqual(t, a)))) {
        drop('number-mismatch');
        continue;
      }
    }
    kept.push({ text, cites });
    totalChars += text.length;
    for (const c of cites) if (!citedRefs.includes(c)) citedRefs.push(c);
  }
  return {
    segments: kept,
    dropped,
    reasons: kept.length === 0 && reasons.length === 0 ? ['empty'] : reasons,
    citedRefs,
  };
}
