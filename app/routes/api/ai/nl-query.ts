import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { assertAiBudget } from '@/lib/ai/budget.server';
import { isAiConfigured, runTaskJson } from '@/lib/ai/provider.server';
import { asData, systemFor, NL_SEARCH_QUERY } from '@/lib/ai/prompts';
import type { ParsedQuery } from '@/lib/search/parse';
import type { SearchTab } from '@/lib/search/types';

/**
 * POST /api/ai/nl-query — turn "posts about the ladder rewrite from ben last
 * month" into the operator query the search page already understands (A13).
 *
 * The site has a perfectly good query grammar (`from:`, `in:`, `has:media`,
 * `before:`/`after:` — `lib/search/parse.ts`) that almost nobody uses, because
 * discovering it requires reading a cheatsheet. This endpoint is a translator
 * on top of the grammar, not a second search path: it emits the *same*
 * `ParsedQuery` shape `parseQuery()` produces, so the caller hands the result
 * to the existing search with no new code behind it.
 *
 * **Failure is a null, never an error.** A model that returns prose, invents a
 * handle, or times out must degrade to "search for what they typed" —
 * literally, the thing that happened before this endpoint existed. An error
 * here would make search *worse* than not having AI, which is the one outcome
 * that is not allowed. The route mirrors that: `{ query: null }` with a 200.
 */

/* -------------------------------------------------------------------------- */
/* Model contract                                                             */
/* -------------------------------------------------------------------------- */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What `NL_SEARCH_QUERY` promises to return. Every field optional and every
 * bound explicit — this is untrusted output, and the only reason to parse it
 * strictly is so `toStructuredQuery` can answer `null` instead of passing
 * something malformed into a database query.
 */
const modelSchema = z.object({
  terms: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  from: z.string().trim().max(40).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  after: z.string().regex(DATE_RE).optional(),
  before: z.string().regex(DATE_RE).optional(),
  kind: z.enum(['post', 'user', 'game', 'doc', 'any']).optional(),
});

/**
 * The model's coarse `kind` mapped onto the tabs the search page actually has
 * (`lib/search/types.ts`). The two vocabularies are not the same size — see the
 * note on `StructuredQuery` — so this is a deliberate lossy projection:
 * `game` widens to the `places` tab (games, apps and site pages) and `doc`
 * lands on `library`.
 */
const KIND_TO_TAB: Record<'post' | 'user' | 'game' | 'doc' | 'any', SearchTab> = {
  post: 'posts',
  user: 'people',
  game: 'places',
  doc: 'library',
  any: 'top',
};

/* -------------------------------------------------------------------------- */
/* Public shape                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A `ParsedQuery` the search stack already consumes, plus the one thing the
 * grammar has no operator for.
 *
 * Two mismatches between the prompt's contract and `ParsedQuery` are resolved
 * here rather than left for the caller:
 *
 *  - **`tags`** has no operator in `parseQuery()`. Tags are folded back into
 *    `text` as `#tag` tokens, which is how a user would have typed them and how
 *    the post index already matches them.
 *  - **`kind`** is not a query operator at all; it selects a *tab*. It is
 *    surfaced as `tab` so a caller can pass it to `universalSearch({ tab })`,
 *    and `ParsedQuery` is left exactly as `parseQuery()` would have built it.
 *
 * The reverse gaps — `in:community` and `has:media` — the prompt never emits,
 * so they are simply absent, as they are from any query that did not use them.
 */
export interface StructuredQuery extends ParsedQuery {
  /** Which search tab the request implies, when it implied one. */
  tab?: SearchTab;
}

/** Same ceiling `parseQuery()` enforces, so a translated query cannot outrank a typed one. */
const MAX_OPERATORS = 4;

/**
 * Translate natural language into a structured query.
 *
 * Returns `null` on *any* doubt — provider off, provider failure, unparseable
 * output, or output that parsed but carried nothing usable. `null` means "fall
 * back to literal search"; it never means "no results".
 */
export async function toStructuredQuery(
  text: string,
  opts: { userId?: string | null } = {},
): Promise<StructuredQuery | null> {
  const input = text.trim();
  if (!input) return null;
  if (!isAiConfigured()) return null;

  let raw: z.infer<typeof modelSchema>;
  try {
    raw = await runTaskJson(
      'compose-assist',
      systemFor(NL_SEARCH_QUERY),
      asData(input),
      (value) => modelSchema.parse(value),
      {
        userId: opts.userId ?? null,
        promptId: NL_SEARCH_QUERY.id,
        promptVer: NL_SEARCH_QUERY.version,
      },
    );
  } catch {
    // Provider failure, timeout, prose instead of JSON, or output that failed
    // the schema — all the same answer. See the header: degrading to literal
    // search is the requirement, not an error path.
    return null;
  }

  // Tags have no operator in the grammar, so they go back into the text as the
  // `#tag` tokens a user would have typed; the post index already matches those.
  const words = [...(raw.terms ?? []), ...(raw.tags ?? []).map((t) => `#${t.replace(/^#/, '')}`)];
  const queryText = words.join(' ').trim();

  // `from` arrives with or without the sigil depending on how the request was
  // phrased; `ParsedQuery.from` is documented as a bare handle.
  const from = raw.from?.replace(/^@/, '').trim() || undefined;

  const operatorCount = Math.min(
    MAX_OPERATORS,
    [from, raw.before, raw.after].filter(Boolean).length,
  );

  // Nothing usable: no words and no operator. Returning an empty query would
  // search for "" and show the whole index, which is worse than falling back.
  if (!queryText && operatorCount === 0) return null;

  return {
    text: queryText,
    ...(from ? { from } : {}),
    ...(raw.before ? { before: raw.before } : {}),
    ...(raw.after ? { after: raw.after } : {}),
    operatorCount,
    ...(raw.kind && raw.kind !== 'any' ? { tab: KIND_TO_TAB[raw.kind] } : {}),
  };
}

/* -------------------------------------------------------------------------- */
/* Route                                                                      */
/* -------------------------------------------------------------------------- */

const bodySchema = z.object({ text: z.string().trim().min(1).max(300) });

export const Route = createFileRoute('/api/ai/nl-query')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'ai', body: bodySchema, label: 'POST /api/ai/nl-query' },
        async ({ userId, body }) => {
          await assertAiBudget(userId);
          const query = await toStructuredQuery(body.text, { userId });
          // Always a 200. `null` is the documented "search literally" signal,
          // not a failure the client should surface.
          return Response.json({ query });
        },
      ),
    },
  },
});
