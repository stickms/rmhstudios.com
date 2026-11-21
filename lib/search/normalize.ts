/**
 * Universal search — text normalisation.
 *
 * Every layer of search folds text the same way, and it has to match what
 * Postgres does in `public.rmh_search_norm()` (see
 * prisma/migrations/20260801150000_search_fuzzy_v2): lowercase + strip
 * diacritics. If the two ever drift, the JS re-ranking scores text the DB
 * matched on differently, and results reorder for no visible reason.
 *
 * Client-safe (no server imports) — the command palette scores the static
 * catalog in the browser with exactly these helpers.
 */

/**
 * Lowercase + strip diacritics. `José` → `jose`, `Ångström` → `angstrom`.
 * Punctuation is preserved here; {@link foldWords} is the variant that drops it.
 *
 * NFKD splits a precomposed character into base + combining mark, so removing
 * the marks leaves the ASCII-ish base. Scripts without combining marks (CJK,
 * Hebrew, Arabic) pass through untouched.
 */
export function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Fold, then reduce to space-separated word characters — the form used for
 * token-level comparisons. `@Renée_D-2` → `renee d 2`.
 *
 * `\p{L}\p{N}` keeps letters and digits in every script, so this is not
 * Latin-only; everything else (punctuation, emoji, separators) becomes a space.
 */
export function foldWords(text: string): string {
  return fold(text)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Normalise a user-typed query: fold it and drop the sigils people habitually
 * type in front of a name. Searching `@ada` and `ada` must find the same person
 * — the `@` is how the site *renders* handles, not part of the handle itself.
 */
export function normalizeQuery(raw: string): string {
  return foldWords(raw.replace(/^\s*[@#/]+/, ''));
}

/** Split normalised text into tokens. Returns `[]` for blank input. */
export function tokenize(normalized: string): string[] {
  return normalized ? normalized.split(' ').filter(Boolean) : [];
}

/**
 * First letter of each token — `"RMH Studios Box"` → `"rsb"`. Lets an acronym
 * query find the thing it abbreviates.
 */
export function initials(normalized: string): string {
  return tokenize(normalized)
    .map((t) => t[0] ?? '')
    .join('');
}

/**
 * Character trigrams of a token, padded the way pg_trgm pads: two leading
 * spaces and one trailing space, so prefixes and suffixes carry weight.
 * `"cat"` → `"  c"`, `" ca"`, `"cat"`, `"at "`.
 */
export function trigrams(token: string): Set<string> {
  const padded = `  ${token} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  return out;
}

/** Trigram set for a whole (possibly multi-word) normalised string. */
export function trigramSet(normalized: string): Set<string> {
  const out = new Set<string>();
  for (const token of tokenize(normalized)) {
    for (const g of trigrams(token)) out.add(g);
  }
  return out;
}
