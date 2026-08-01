/**
 * Universal search — shared SQL fragments for fuzzy candidate selection.
 *
 * Every corpus follows the same two-stage shape:
 *
 *   1. **Recall (Postgres).** Cast a wide, index-backed net for *candidates*.
 *      Trigram GIN indexes (see the 20260801150000_search_fuzzy_v2 migration)
 *      accelerate `LIKE '%…%'`, `%` (similarity) and `<%` (word similarity)
 *      alike, so this stage is cheap even though the predicate is broad.
 *   2. **Precision (JS).** Re-score the candidates with `lib/search/score.ts`,
 *      which understands typos, word order and acronyms far better than a
 *      single similarity number, and produces the cross-corpus 0..1 scale.
 *
 * Postgres alone can't do stage 2 well: `similarity()` compares whole strings,
 * so the longer a display name is, the lower it scores for the same query. That
 * is precisely why long display names were effectively unfindable.
 */

import { Prisma } from '@prisma/client';
import { normalizeQuery, tokenize } from './normalize';

/** Longest token list we will expand into SQL predicates. */
const MAX_TOKENS = 3;
/** Shortest token worth a substring predicate (below this, `%foo%` matches everything). */
const MIN_CONTAINS_LEN = 3;

export interface FuzzyTerms {
  /** Normalised full query. */
  q: string;
  /** `q%` — LIKE-escaped. */
  prefix: string;
  /** `%q%` — LIKE-escaped. */
  contains: string;
  /** Per-token variants, longest first, capped at {@link MAX_TOKENS}. */
  tokens: { t: string; prefix: string; contains: string }[];
}

/** Escape the LIKE metacharacters so a user can't smuggle in wildcards. */
function likeSafe(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/** Build the reusable term set for a raw query. */
export function fuzzyTerms(raw: string): FuzzyTerms {
  const q = normalizeQuery(raw);
  const escaped = likeSafe(q);
  const tokens = tokenize(q)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_TOKENS)
    .map((t) => {
      const e = likeSafe(t);
      return { t, prefix: `${e}%`, contains: `%${e}%` };
    });
  return { q, prefix: `${escaped}%`, contains: `%${escaped}%`, tokens };
}

/**
 * `rmh_search_norm(<column>)` — the folding used by both the indexes and every
 * query, so the planner can actually use those indexes.
 */
export function norm(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`public.rmh_search_norm(${column})`;
}

/**
 * A broad recall predicate for one normalised column.
 *
 * Four complementary signals, because each misses cases the others catch:
 * - `LIKE 'q%'` — short/exact prefixes, where trigram similarity is too thin.
 * - `LIKE '%q%'` — the query appearing anywhere, including mid-word.
 * - `% q` — whole-string trigram similarity: typo tolerance.
 * - `q <% col` — word similarity: the query matching *one word* of a long
 *   value, which is the long-display-name case.
 *
 * When `perToken` is set the same battery is applied to the individual query
 * tokens, so "ada lovelac" still reaches a row titled "Lovelace, Ada".
 */
export function fuzzyColumn(
  column: Prisma.Sql,
  terms: FuzzyTerms,
  opts: { perToken?: boolean } = {},
): Prisma.Sql {
  const col = norm(column);
  const parts: Prisma.Sql[] = [
    Prisma.sql`${col} LIKE ${terms.prefix}`,
    Prisma.sql`${col} % ${terms.q}`,
    Prisma.sql`${terms.q} <% ${col}`,
  ];
  if (terms.q.length >= MIN_CONTAINS_LEN) {
    parts.push(Prisma.sql`${col} LIKE ${terms.contains}`);
  }

  if (opts.perToken && terms.tokens.length > 1) {
    for (const token of terms.tokens) {
      parts.push(Prisma.sql`${col} LIKE ${token.prefix}`);
      if (token.t.length >= MIN_CONTAINS_LEN) {
        parts.push(Prisma.sql`${col} LIKE ${token.contains}`);
        parts.push(Prisma.sql`${col} % ${token.t}`);
      }
    }
  }

  return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
}

/** OR the recall predicate across several columns. */
export function fuzzyAny(
  columns: Prisma.Sql[],
  terms: FuzzyTerms,
  opts: { perToken?: boolean } = {},
): Prisma.Sql {
  return Prisma.sql`(${Prisma.join(
    columns.map((c) => fuzzyColumn(c, terms, opts)),
    ' OR ',
  )})`;
}

/**
 * A coarse SQL relevance number used only to *order the candidate pool* before
 * `LIMIT`. The real ranking happens in JS; this just makes sure the rows the
 * limit keeps are the plausible ones.
 */
export function sqlRank(columns: Prisma.Sql[], terms: FuzzyTerms): Prisma.Sql {
  const parts = columns.flatMap((c) => {
    const col = norm(c);
    return [
      Prisma.sql`COALESCE(similarity(${col}, ${terms.q}), 0)`,
      Prisma.sql`COALESCE(word_similarity(${terms.q}, ${col}), 0)`,
      Prisma.sql`(CASE WHEN ${col} LIKE ${terms.prefix} THEN 1.0 ELSE 0 END)`,
    ];
  });
  return Prisma.sql`GREATEST(${Prisma.join(parts, ', ')})`;
}
