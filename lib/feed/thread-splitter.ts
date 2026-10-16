/**
 * Thread composer — split one long draft into a numbered RMHark thread.
 * Pure and client-safe (feature idea X1 in
 * docs/plans/2026-10-12-feature-ideas-every-surface.md).
 *
 * Typefully and Threads both do this: you write one long thing, the composer
 * shows it as N posts, each under the limit, each ending in "k/N". The work
 * worth doing carefully is WHERE it cuts — a thread that breaks mid-word or
 * strands a two-word tail reads like a bug — so the cut preference is:
 *
 *   1. an explicit break the author typed (a line that is only `---`)
 *   2. a paragraph boundary (blank line)
 *   3. a sentence end (`.`, `!`, `?`, `…` followed by whitespace)
 *   4. any whitespace
 *   5. a hard cut at the budget (a single token longer than a post — a URL)
 *
 * Rungs 2–4 only accept a cut that keeps at least `MIN_FILL` of the budget in
 * the chunk; otherwise a paragraph break three words in would produce a
 * three-word post. Lengths are UTF-16 code units because that is what the
 * server's zod `.max(MAX_RMHARK_LENGTH)` counts, and a hard cut never lands
 * between the two halves of a surrogate pair.
 */

import { MAX_RMHARK_LENGTH } from '@/lib/rmhark-limits';

export interface SplitOptions {
  /** Per-post limit. Defaults to the RMHark limit. */
  max?: number;
  /** Append " k/N" to every post when the thread has more than one. */
  numbered?: boolean;
}

/** A chunk must keep at least this share of its budget before a soft cut is taken. */
const MIN_FILL = 0.4;
const EXPLICIT_BREAK = /^\s*---\s*$/m;
const SENTENCE_END = /[.!?…]["')\]]?(?=\s)/g;

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/** Index to cut `text` at so the head is at most `budget` long. */
function cutIndex(text: string, budget: number): number {
  const window = text.slice(0, budget + 1);
  const floor = Math.floor(budget * MIN_FILL);

  const para = window.lastIndexOf('\n\n', budget);
  if (para >= floor) return para;

  let sentence = -1;
  for (const m of window.matchAll(SENTENCE_END)) {
    const end = m.index + m[0].length;
    if (end <= budget) sentence = end;
  }
  if (sentence >= floor) return sentence;

  for (let i = Math.min(budget, window.length - 1); i >= floor; i--) {
    if (/\s/.test(window[i]!)) return i;
  }

  // Hard cut: never split a surrogate pair.
  return isHighSurrogate(text.charCodeAt(budget - 1)) ? budget - 1 : budget;
}

function splitSection(section: string, budget: number): string[] {
  const out: string[] = [];
  let rest = section.trim();
  while (rest.length > budget) {
    const at = cutIndex(rest, budget);
    const head = rest.slice(0, at).trimEnd();
    if (head) out.push(head);
    rest = rest.slice(at).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

function suffix(k: number, n: number): string {
  return ` ${k}/${n}`;
}

/**
 * Split `text` into posts. Returns `[]` for blank input and a single
 * un-numbered post when everything fits in one.
 */
export function splitThread(text: string, opts: SplitOptions = {}): string[] {
  const max = opts.max ?? MAX_RMHARK_LENGTH;
  const numbered = opts.numbered ?? true;
  const sections = text
    .split(EXPLICIT_BREAK)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sections.length === 0) return [];
  if (sections.length === 1 && sections[0]!.length <= max) return [sections[0]!];

  // The suffix width depends on N, and N depends on the suffix width. Start
  // by guessing one digit and widen until the guess is stable — it converges
  // in at most a couple of passes because widening only ever adds chunks.
  let digits = 1;
  for (;;) {
    const reserve = numbered ? suffix(10 ** digits - 1, 10 ** digits - 1).length : 0;
    const budget = Math.max(1, max - reserve);
    const chunks = sections.flatMap((s) => splitSection(s, budget));
    const needed = String(chunks.length).length;
    if (!numbered) return chunks;
    if (needed <= digits) return chunks.map((c, i) => c + suffix(i + 1, chunks.length));
    digits = needed;
  }
}
