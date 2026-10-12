/**
 * Text anchors for highlights and margin notes — pure and client-safe.
 * Feature idea L1 in docs/plans/2026-10-12-feature-ideas-every-surface.md.
 *
 * Kindle highlights, Medium highlights and Hypothesis annotations all solve
 * the same problem: a highlight has to survive the text it points at being
 * edited. Storing character offsets alone does not — fix one typo above the
 * highlight and it slides onto the wrong words. The W3C Web Annotation model
 * stores a TextQuoteSelector (the exact text plus a little context on each
 * side) alongside a TextPositionSelector (the offsets) and re-anchors with
 * the quote when the offsets no longer match. This is that, minus the spec's
 * ceremony.
 *
 * Re-anchoring, cheapest first:
 *   1. the stored offsets still hold the exact quote → done;
 *   2. the quote occurs exactly once → done;
 *   3. it occurs several times → pick the occurrence whose surrounding text
 *      best matches the stored prefix/suffix, ties broken by closeness to the
 *      old offset;
 *   4. it occurs nowhere → the highlight is orphaned. The UI lists orphans
 *      under the document ("2 highlights no longer match the text") rather
 *      than guessing, because a highlight on the wrong sentence is worse than
 *      a missing one.
 */

export interface TextAnchor {
  /** The exact highlighted text. */
  exact: string;
  /** Up to CONTEXT chars immediately before / after. */
  prefix: string;
  suffix: string;
  /** Offsets at the time of highlighting. */
  start: number;
  end: number;
}

export type Resolved = { start: number; end: number; how: 'position' | 'unique' | 'context' };

const CONTEXT = 32;

export function createAnchor(text: string, start: number, end: number): TextAnchor | null {
  if (start < 0 || end > text.length || end <= start) return null;
  return {
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT), start),
    suffix: text.slice(end, end + CONTEXT),
    start,
    end,
  };
}

/** Length of the common suffix of a and b (how well a prefix matches). */
function tailMatch(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

/** Length of the common prefix of a and b (how well a suffix matches). */
function headMatch(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

export function resolveAnchor(text: string, anchor: TextAnchor): Resolved | null {
  const { exact, start, end } = anchor;
  if (!exact) return null;
  if (text.slice(start, end) === exact) return { start, end, how: 'position' };

  const hits: number[] = [];
  for (let i = text.indexOf(exact); i !== -1; i = text.indexOf(exact, i + 1)) hits.push(i);
  if (hits.length === 0) return null;
  if (hits.length === 1) return { start: hits[0]!, end: hits[0]! + exact.length, how: 'unique' };

  let best = hits[0]!;
  let bestScore = -Infinity;
  for (const h of hits) {
    const before = text.slice(Math.max(0, h - CONTEXT), h);
    const after = text.slice(h + exact.length, h + exact.length + CONTEXT);
    // Context dominates; distance only breaks ties.
    const score =
      (tailMatch(before, anchor.prefix) + headMatch(after, anchor.suffix)) * 1_000_000 -
      Math.abs(h - start);
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return { start: best, end: best + exact.length, how: 'context' };
}
