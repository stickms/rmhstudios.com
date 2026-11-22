/**
 * Category Crash — answer matching for shared-answer detection.
 *
 * Two answers are "the same" when their WHOLE normalised strings are equal,
 * equal after dropping a plural ending, or within a small edit distance (a
 * typo). The old Fuse.js grouping scored substrings, so "bear" and "bearded
 * dragon" (score 0.008) were grouped and both answers lost their points.
 *
 * Client-safe and dependency-free: the server scores with it and PeerReview
 * marks the same answers as shared.
 */

import { similarityRatio } from '../emoji-cinema/guess-matcher';

/** Similarity at or above which two answers count as one (a typo). Design spec §3.3.5: 0.85. */
export const CC_ANSWER_MATCH_RATIO = 0.85;
/** Shorter answers must match exactly (after normalisation): one typo in "cat" is "car". */
const MIN_FUZZY_LENGTH = 5;

/** Lowercase, strip accents and punctuation, collapse spaces. */
export function normalizeAnswer(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/['’‘`.]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Drop a plural ending: "bears" -> "bear", "boxes" -> "box", "berries" -> "berry". */
function singular(s: string): string {
  if (s.length > 4 && s.endsWith('ies')) return `${s.slice(0, -3)}y`;
  if (s.length > 4 && /(s|x|z|ch|sh)es$/.test(s)) return s.slice(0, -2);
  if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) return s.slice(0, -1);
  return s;
}

/** Whether two already-normalised answers are the same answer. */
export function normalizedAnswersMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const ca = a.replace(/ /g, '');
  const cb = b.replace(/ /g, '');
  if (ca === cb) return true;
  if (singular(ca) === singular(cb)) return true;
  if (Math.min(ca.length, cb.length) < MIN_FUZZY_LENGTH) return false;
  return similarityRatio(ca, cb) >= CC_ANSWER_MATCH_RATIO;
}

/** Whether two raw answers are the same answer. */
export function answersMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizedAnswersMatch(normalizeAnswer(a), normalizeAnswer(b));
}

/**
 * Group entries whose answers match (transitively). Returns every group,
 * singletons included, as arrays of ids in input order.
 */
export function groupMatchingAnswers(
  entries: Array<{
    id: string;
    answer: string | null | undefined;
  }>,
): string[][] {
  const norm = entries.map((e) => normalizeAnswer(e.answer));
  const parent = entries.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  for (let i = 0; i < entries.length; i++) {
    if (!norm[i]) continue;
    for (let j = i + 1; j < entries.length; j++) {
      if (norm[j] && normalizedAnswersMatch(norm[i]!, norm[j]!)) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, string[]>();
  entries.forEach((e, i) => {
    if (!norm[i]) return;
    const root = find(i);
    const g = groups.get(root) ?? [];
    g.push(e.id);
    groups.set(root, g);
  });
  return [...groups.values()];
}
