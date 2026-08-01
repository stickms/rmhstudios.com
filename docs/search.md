# Search — how the site finds things

> Reference doc. Code is in [`lib/search/`](../lib/search/), the route is
> [`app/routes/api/search.ts`](../app/routes/api/search.ts), and the index DDL
> is `prisma/migrations/20260801150000_search_fuzzy_v2/migration.sql`.

Search covers **nine corpora** on one relevance scale: people, posts, user
builds, blog posts, news articles, library documents, games, apps, and the
site's destination pages. `/search`, the ⌘K palette, the top-bar quick panel and
`/api/ai/search` all read the same ranking.

---

## The bug this replaced

`resolveUser()` renders `user_profile.displayName ?? user.name`. For anyone who
has ever set a display name, `user.name` is a stale OAuth artifact that nobody
has seen. The old people query matched only `user.name`, `user.username` and
`user.handle` — so **searching a person by the only name the site ever shows for
them returned nothing.**

The second half of the problem was `similarity()`. It compares whole strings, so
its score falls as the target gets longer. Measured on a real Postgres:

```
similarity('johnathan alexander smith', 'john')      = 0.148   ← below the 0.3 threshold
word_similarity('john', 'johnathan alexander smith') = 0.800   ← comfortably matches
```

A long display name was mathematically unreachable even when it _was_ being
searched. Both halves are fixed: `user_profile` is joined into the query, and
recall no longer rests on whole-string similarity alone.

---

## Two stages: recall, then precision

Every corpus follows the same shape.

**Stage 1 — recall, in Postgres.** Cast a wide, index-backed net for
_candidates_. Four complementary predicates per column, because each misses what
the others catch:

| Predicate    | Catches                                       |
| ------------ | --------------------------------------------- |
| `LIKE 'q%'`  | short/exact prefixes, where trigrams are thin |
| `LIKE '%q%'` | the query anywhere, including mid-word        |
| `% q`        | whole-string trigram similarity → typos       |
| `q <% col`   | word similarity → one word of a long value    |

Trigram GIN indexes accelerate all four, so a broad predicate is still cheap.
Multi-word queries additionally expand per token (capped at 3), so
`ada lovelac` reaches a row titled `Lovelace, Ada`.

**Stage 2 — precision, in JS.** `lib/search/score.ts` re-scores the candidates
on a 0..1 scale. In descending strength: exact → whole-string prefix → whole-word
→ word prefix → substring → acronym → per-token coverage (where typo tolerance
lives, via a transposition-aware bounded edit distance) → trigram Dice as a
floor. Popularity and recency are capped tiebreakers — they can shuffle
neighbours, never promote a weak match past a strong one.

That single shared scale is what makes the cross-corpus "Top" tab possible.

### Normalisation must match on both sides

`public.rmh_search_norm()` (lowercase + `unaccent`) is used by the indexes _and_
every query; `lib/search/normalize.ts` does the same folding in JS. If the two
drift, the planner stops using the indexes and JS re-scores text differently from
how the DB matched it. `unaccent` is installed inside an exception handler — on a
cluster that refuses it, normalisation degrades to `lower()` rather than failing
the deploy.

---

## Confidence

`CONFIDENCE.high = 0.72`, `CONFIDENCE.medium = 0.45`, and `MATCH_FLOOR = 0.3`
below which a field is treated as noise. Bands drive three things: the Top tab
splits confident hits from a "less certain" tail, a "did you mean" only appears
when nothing confident was found, and the model-assist pass is gated on them.

---

## The model-assisted pass (DeepSeek)

A language model is far too slow for a keystroke, so it never sits in that path.
Three guards:

1. **Gated** — only when the lexical pass came back below the medium band, i.e.
   when the user was about to see nothing useful anyway.
2. **Time-boxed** — raced against 1.5 s. A slow or hung call resolves to "no
   expansion" and the plain results ship.
3. **Cached** — query→expansion is viewer-independent, so it caches for hours;
   failures cache briefly so an outage can't turn every weak search into a wait.

The model only ever returns _alternative query terms_ and a spelling correction.
The same lexical search is then re-run with them, and hits found only that way
are discounted (×0.82) so an indirect match can't outrank a direct one. **The
model never ranks, filters, or invents results.**

Callers opt in with `?assist=1`. The search page sends a second request after the
first returns thin; the palette and quick panel never do.

---

## Response shape

```jsonc
{
  "people": [], "posts": [], "builds": [], "blog": [],  // legacy keys, unchanged shapes
  "groups": { "person": [SearchHit], "game": [SearchHit], ... },
  "top":    [SearchHit],                                 // ranked cross-corpus mix
  "meta":   { "normalized", "topScore", "confidence", "total",
              "expandedWith?", "suggestion?", "degraded?" }
}
```

The four legacy keys keep their original shapes: client bundles outlive a deploy,
and the palette and quick panel read them directly. `meta.degraded` lists corpora
whose query failed — one broken corpus returns partial results rather than a 500.

---

## Adding a corpus

1. Add the kind to `SEARCH_KINDS` and to a tab in `SEARCH_TAB_KINDS`
   (`lib/search/types.ts`).
2. Add trigram indexes on `public.rmh_search_norm(<column>)` in a migration.
3. For a database corpus, add an entry to `CORPORA` in `docs.server.ts` (or a
   dedicated module if it needs relations); for a static one, extend
   `lib/search/catalog.ts`.
4. Wire it into `runPass()` in `universal.server.ts`.
5. Add a per-kind icon and label in `components/search/SearchHitRow.tsx` —
   **spelled out as static `t()` calls**, never a computed key (see below).

## Gotchas

- **`lib/search/catalog.ts` is the one list of destination pages.** The ⌘K
  palette and `/api/search` both read it. It was duplicated once; the copies
  diverged, and the two surfaces disagreed about what the site contains.
- **Never build an i18n key by template string.** ``t(`kind-${hit.kind}`)`` is
  invisible to `i18next-parser`: the key never lands in `locales/`, and every
  non-English locale silently serves the English `defaultValue`. Spell the calls
  out in a `switch`.
- **The `search` namespace** must stay in `NAMESPACES` (`lib/i18n/config.ts`) —
  a JSON file in `locales/en/` that isn't registered is never loaded.
