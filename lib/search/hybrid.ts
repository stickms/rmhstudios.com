/**
 * Hybrid retrieval (M1) — fusing a lexical result list with a semantic one.
 *
 * Pure and client-safe so it can be tested without a database or a model.
 *
 * ## Why fuse instead of replace
 *
 * Semantic search is better at "the post about the thing with the spheres" and
 * worse at "Rebar & Rutabaga". Lexical is the reverse. Replacing one with the
 * other trades one set of misses for another, and the set it starts missing is
 * the one people notice: an exact title match that no longer comes first reads
 * as the search being broken, however good the rest of the page is.
 *
 * ## Why reciprocal rank and not a score blend
 *
 * `ts_rank` and cosine similarity are not on the same scale and there is no
 * principled conversion between them — any weighting is a magic number that
 * drifts as the corpus changes. Reciprocal-rank fusion throws the scores away
 * and uses only the ORDER each retriever produced, which is the part each one
 * is actually good at. It needs one constant (`k`), and that constant's only
 * job is to flatten the difference between rank 1 and rank 2 so a single
 * confident retriever cannot dominate.
 */

/** One retriever's ordered result list. Order is the only thing that is used. */
export interface RankedList {
  /** Entity ids, best first. */
  ids: readonly string[];
  /**
   * Relative trust in this retriever, default 1. Not a score blend: it scales
   * the whole list's contribution, so it cannot reintroduce the incomparable-
   * units problem RRF exists to avoid.
   */
  weight?: number;
}

/**
 * The RRF constant. 60 is the value from the original paper and is a fine
 * default; it is exposed because a corpus where the top result is nearly always
 * right wants a smaller one.
 */
export const RRF_K = 60;

export interface FusedHit {
  id: string;
  score: number;
  /** Which retrievers found it, and at what rank (0-based). */
  ranks: Record<string, number>;
}

/**
 * Fuse any number of ranked lists.
 *
 * A document found by both retrievers outranks one found by either alone, even
 * when it was second in both — which is the whole point, and the reason a
 * hybrid search feels better than its halves rather than like an average of
 * them.
 *
 * Ties break on the better single rank, then on id, so the order is total and
 * stable. An unstable order is invisible in a test and maddening in a UI: the
 * same query re-rendered puts the same results in a different sequence.
 */
export function fuse(lists: Record<string, RankedList>, k: number = RRF_K): FusedHit[] {
  const acc = new Map<string, FusedHit>();

  for (const [name, list] of Object.entries(lists)) {
    const weight = list.weight ?? 1;
    list.ids.forEach((id, rank) => {
      let hit = acc.get(id);
      if (!hit) {
        hit = { id, score: 0, ranks: {} };
        acc.set(id, hit);
      }
      // A retriever listing the same id twice contributes ONCE, at its better
      // rank. Scoring both occurrences would let a retriever inflate a result
      // by repeating it — which a buggy or hostile one would do for free.
      // The check has to come before the score is added, not after.
      if (name in hit.ranks) {
        hit.ranks[name] = Math.min(hit.ranks[name], rank);
        return;
      }
      hit.ranks[name] = rank;
      hit.score += weight / (k + rank + 1);
    });
  }

  return [...acc.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const bestA = Math.min(...Object.values(a.ranks));
    const bestB = Math.min(...Object.values(b.ranks));
    if (bestA !== bestB) return bestA - bestB;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Promote an exact match to the top, whatever the fusion said.
 *
 * The one place a rule beats the ranking. Somebody typing a title in full is
 * not expressing an interest in that topic, they are asking for that thing, and
 * no amount of semantic neighbourhood should put something else above it.
 */
export function pinExact(hits: FusedHit[], exactIds: readonly string[]): FusedHit[] {
  if (exactIds.length === 0) return hits;
  const exact = new Set(exactIds);
  const pinned = hits.filter((h) => exact.has(h.id));
  const rest = hits.filter((h) => !exact.has(h.id));
  return [...pinned, ...rest];
}

/**
 * Normalise text before it is embedded or hashed.
 *
 * Collapsing whitespace matters more than it looks: the same post re-saved with
 * a trailing newline would otherwise hash differently and be re-embedded, which
 * turns an idle backfill into a recurring bill.
 */
export function prepareText(raw: string, maxChars = 8_000): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, maxChars);
}
