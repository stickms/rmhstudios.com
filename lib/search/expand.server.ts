/**
 * Universal search — the model-assisted fallback.
 *
 * A language model is far too slow to sit in the path of every keystroke, so it
 * never does. Three guards keep it out of the way:
 *
 *  1. **Gated.** It runs only when the lexical passes came back below the
 *     medium-confidence band — i.e. when the user was about to see nothing
 *     useful anyway, and a second or so is worth spending.
 *  2. **Time-boxed.** Raced against {@link EXPAND_TIMEOUT_MS}. A slow or hung
 *     DeepSeek call resolves to "no expansion" and the plain results ship.
 *  3. **Cached.** Query→expansion is viewer-independent, so it caches for hours.
 *     Failures cache too (briefly), so an outage can't turn every weak search
 *     into a timeout.
 *
 * The output is only ever used to *re-run the same lexical search* with better
 * terms — the model never ranks, filters, or invents results.
 */

import { apiCache } from '@/lib/cache';
import { expandSearchQuery, isAITextConfigured, type QueryExpansion } from '@/lib/ai/text.server';
import { normalizeQuery } from './normalize';

/** Hard ceiling on how long a search will wait for the model. */
export const EXPAND_TIMEOUT_MS = 1_500;
const CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const FAILURE_TTL_MS = 60_000;
const EMPTY: QueryExpansion = { terms: [], correction: '' };

const cacheKey = (normalized: string) => `search:expand:${normalized}`;

/** Whether the assist layer is available at all (DEEPSEEK_API_KEY present). */
export function isExpansionAvailable(): boolean {
  return isAITextConfigured();
}

/**
 * Expand a weak query into alternative terms plus a spelling correction.
 *
 * Always resolves — never throws and never blocks longer than
 * {@link EXPAND_TIMEOUT_MS}. Returns empty terms when the model is unavailable,
 * slow, or had nothing to add.
 */
export async function expandQuery(rawQuery: string): Promise<QueryExpansion> {
  const normalized = normalizeQuery(rawQuery);
  if (!normalized || normalized.length < 2 || !isAITextConfigured()) return EMPTY;

  const key = cacheKey(normalized);
  const cached = apiCache.get<QueryExpansion>(key);
  if (cached) return cached;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      expandSearchQuery(rawQuery),
      new Promise<QueryExpansion>((resolve) => {
        timer = setTimeout(() => resolve(EMPTY), EXPAND_TIMEOUT_MS);
      }),
    ]);

    // Drop terms that just restate the query — retrying with them costs a round
    // trip and returns the same rows.
    const terms = result.terms.filter((t) => normalizeQuery(t) !== normalized);
    const correction =
      result.correction && normalizeQuery(result.correction) !== normalized
        ? result.correction
        : '';
    const cleaned: QueryExpansion = { terms, correction };

    // A timeout is cached only briefly: the underlying call may still be fine.
    apiCache.set(key, cleaned, terms.length || correction ? CACHE_TTL_MS : FAILURE_TTL_MS);
    return cleaned;
  } catch (error) {
    console.error('search expansion failed:', error);
    apiCache.set(key, EMPTY, FAILURE_TTL_MS);
    return EMPTY;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
