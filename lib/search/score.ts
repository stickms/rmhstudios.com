/**
 * Universal search — fuzzy relevance scoring.
 *
 * Every hit the site returns, from any corpus, is scored by these functions on
 * one 0..1 scale. That single scale is what makes a cross-corpus "Top" tab
 * possible: a person, a blog post and a game can be interleaved because their
 * scores mean the same thing.
 *
 * The design goal is that a *reasonable human attempt* at a name finds the
 * thing. In rough order of strength, a query is matched by: exact equality,
 * whole-string prefix, whole-word equality, word prefix, substring, acronym,
 * per-token coverage (which is where typo tolerance lives), and finally raw
 * trigram overlap as a floor.
 *
 * Client-safe and pure — unit-tested in `lib/search/__tests__/score.test.ts`.
 */

import { foldWords, initials, normalizeQuery, tokenize, trigramSet } from './normalize';

/** How a field matched, for debugging and for explaining a result in the UI. */
export type MatchReason =
  | 'exact'
  | 'prefix'
  | 'word'
  | 'word-prefix'
  | 'substring'
  | 'acronym'
  | 'tokens'
  | 'trigram'
  | 'none';

export interface FieldScore {
  score: number;
  reason: MatchReason;
}

/** Below this a field is treated as noise rather than a weak match. */
export const MATCH_FLOOR = 0.3;

/**
 * Confidence bands. These drive UI grouping ("did you mean" vs. a plain list)
 * and the decision to spend a model call on query expansion, so they are named
 * rather than left as bare numbers scattered through call sites.
 */
export const CONFIDENCE = { high: 0.72, medium: 0.45 } as const;

export type Confidence = 'high' | 'medium' | 'low';

export function confidenceOf(score: number): Confidence {
  if (score >= CONFIDENCE.high) return 'high';
  if (score >= CONFIDENCE.medium) return 'medium';
  return 'low';
}

/**
 * Sørensen–Dice coefficient over trigram sets: `2|A∩B| / (|A|+|B|)`.
 * This is the same family of measure as Postgres `similarity()`, so a hit the
 * database surfaced scores comparably once it reaches JS.
 */
export function diceCoefficient(a: string, b: string): number {
  const ga = trigramSet(a);
  const gb = trigramSet(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared++;
  return (2 * shared) / (ga.size + gb.size);
}

/**
 * Optimal string alignment distance (Damerau–Levenshtein restricted to adjacent
 * transpositions), bounded by `max` for an early exit.
 *
 * Transpositions cost 1, not 2, because `jhon`→`john` is the single most common
 * real typo and plain Levenshtein punishes it as harshly as two unrelated edits.
 * Returns `max + 1` when the true distance exceeds `max`.
 */
export function boundedEditDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Two rolling rows plus the row before them (needed for transpositions).
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr: number[] = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    // Every remaining edit can only add to the best value in this row.
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = curr;
    curr = new Array(b.length + 1);
  }
  return prev[b.length];
}

/** How many edits a token of this length may absorb and still count as a typo. */
function editBudget(len: number): number {
  if (len <= 3) return 1;
  if (len <= 6) return 2;
  return 3;
}

/**
 * Similarity of one query token against one target token, 0..1.
 *
 * Single-character queries are capped hard: `a` prefixes an enormous number of
 * words, and letting it score like a real match would flood every result list.
 */
export function tokenSimilarity(q: string, t: string): number {
  if (!q || !t) return 0;
  if (q === t) return 1;

  const ratio = q.length / t.length;
  if (t.startsWith(q)) {
    const s = 0.82 + 0.18 * ratio;
    return q.length < 2 ? Math.min(s, 0.55) : s;
  }
  if (q.length >= 3 && t.includes(q)) return 0.62 + 0.18 * ratio;

  // Typo tolerance. Only worth attempting when the lengths are comparable.
  if (q.length >= 3) {
    const budget = editBudget(Math.min(q.length, t.length));
    const d = boundedEditDistance(q, t, budget);
    if (d <= budget) return Math.max(0, 1 - d / Math.max(q.length, t.length)) * 0.95;
  }

  return diceCoefficient(q, t) * 0.6;
}

/**
 * Fraction of the query covered by the target's tokens, weighted by token
 * length so a match on `studios` counts for more than a match on `of`.
 *
 * Each query token takes its best target token; targets may be reused. That
 * asymmetry is deliberate — the question is "is all of what they typed present
 * here?", not "is this field entirely about what they typed?".
 */
function tokenCoverage(queryTokens: string[], targetTokens: string[]): number {
  if (queryTokens.length === 0 || targetTokens.length === 0) return 0;
  let weighted = 0;
  let weight = 0;
  for (const q of queryTokens) {
    let best = 0;
    for (const t of targetTokens) {
      const s = tokenSimilarity(q, t);
      if (s > best) best = s;
      if (best === 1) break;
    }
    const w = Math.max(1, q.length);
    weighted += best * w;
    weight += w;
  }
  return weight === 0 ? 0 : weighted / weight;
}

/**
 * Score a normalised query against one raw field value.
 *
 * `query` must already be normalised (via {@link normalizeQuery}); the field is
 * normalised here so callers can pass raw database text.
 */
export function scoreField(query: string, field: string | null | undefined): FieldScore {
  if (!query || !field) return { score: 0, reason: 'none' };
  const target = foldWords(field);
  if (!target) return { score: 0, reason: 'none' };

  if (target === query) return { score: 1, reason: 'exact' };

  const qTokens = tokenize(query);
  const tTokens = tokenize(target);

  // Whole-string prefix: "john s" inside "john smith". Slightly discounted the
  // further the target runs past the query, so an exact-length prefix wins.
  if (target.startsWith(query)) {
    const s = 0.95 - 0.1 * (1 - query.length / target.length);
    return { score: s, reason: 'prefix' };
  }

  // A complete word of the target is exactly the query — "smith" in "john smith".
  if (qTokens.length === 1 && tTokens.includes(query)) {
    return { score: 0.9, reason: 'word' };
  }

  // Any word starts with the query — "smi" in "john smith". This is the case
  // plain `similarity()` handles worst: the longer the display name, the lower
  // its whole-string similarity, which is exactly why long names were unfindable.
  if (qTokens.length === 1 && query.length >= 2 && tTokens.some((t) => t.startsWith(query))) {
    return { score: 0.86, reason: 'word-prefix' };
  }

  // Substring anywhere, including across word boundaries.
  if (query.length >= 3 && target.includes(query)) {
    return { score: 0.78, reason: 'substring' };
  }

  // Acronym: "rs" finds "RMH Studios".
  if (qTokens.length === 1 && query.length >= 2 && tTokens.length >= 2) {
    const acro = initials(target);
    if (acro === query) return { score: 0.8, reason: 'acronym' };
    if (acro.startsWith(query)) return { score: 0.72, reason: 'acronym' };
  }

  const coverage = tokenCoverage(qTokens, tTokens);
  const dice = diceCoefficient(query, target);
  // Coverage is the more meaningful signal (it understands typos and word
  // order); trigram overlap is a floor that catches everything else. The
  // coverage discount is small on purpose — `tokenSimilarity` has already
  // priced the typo, and discounting twice pushed one-character misses on a
  // game's name below the confidence band they belong in.
  const tokenScore = coverage * 0.9;
  const trigramScore = dice * 0.7;

  return tokenScore >= trigramScore
    ? { score: tokenScore, reason: 'tokens' }
    : { score: trigramScore, reason: 'trigram' };
}

/** A field to score, with the weight its corpus gives it. */
export interface WeightedField {
  value: string | null | undefined;
  /** 0..1 — how much a match here is worth relative to a title/name match. */
  weight: number;
}

export interface RecordScore {
  score: number;
  reason: MatchReason;
}

/**
 * Score a record made of several weighted fields.
 *
 * The best single field wins rather than the fields being summed: a person
 * whose name is an exact match should outrank one whose bio happens to mention
 * the term three times. Other matching fields contribute a small corroboration
 * bonus, capped so they can never promote a record past a stronger primary match.
 */
export function scoreRecord(query: string, fields: WeightedField[]): RecordScore {
  let best = 0;
  let bestReason: MatchReason = 'none';
  let corroboration = 0;

  for (const { value, weight } of fields) {
    if (!value || weight <= 0) continue;
    const { score, reason } = scoreField(query, value);
    if (score < MATCH_FLOOR) continue;
    const weighted = score * weight;
    if (weighted > best) {
      if (best > 0) corroboration += best * 0.08;
      best = weighted;
      bestReason = reason;
    } else {
      corroboration += weighted * 0.08;
    }
  }

  if (best === 0) return { score: 0, reason: 'none' };
  return { score: Math.min(1, best + Math.min(corroboration, 0.06)), reason: bestReason };
}

/**
 * Blend textual relevance with a popularity signal.
 *
 * Popularity only ever breaks ties: it is capped at a few points so a wildly
 * popular near-miss can't outrank an exact match on something obscure. `count`
 * is any non-negative engagement number (likes, followers, views).
 */
export function withPopularity(score: number, count: number, cap = 0.06): number {
  if (score <= 0) return 0;
  const boost = Math.min(cap, (Math.log10(Math.max(0, count) + 1) / 5) * cap);
  return Math.min(1, score + boost);
}

/**
 * Freshness nudge for time-ordered corpora (news, posts). Same idea as
 * {@link withPopularity}: a tiebreaker, never a ranker.
 */
export function withRecency(
  score: number,
  date: Date | string | null | undefined,
  cap = 0.04,
): number {
  if (score <= 0 || !date) return score;
  const ts = typeof date === 'string' ? Date.parse(date) : date.getTime();
  if (!Number.isFinite(ts)) return score;
  const days = (Date.now() - ts) / 86_400_000;
  if (days < 0) return score;
  // Full bonus for today, decaying to nothing over ~a year.
  const boost = cap * Math.max(0, 1 - days / 365);
  return Math.min(1, score + boost);
}

/**
 * Convenience wrapper for callers holding a raw (un-normalised) query.
 * Prefer normalising once and reusing it across a whole result set.
 */
export function scoreAgainst(rawQuery: string, fields: WeightedField[]): RecordScore {
  return scoreRecord(normalizeQuery(rawQuery), fields);
}
