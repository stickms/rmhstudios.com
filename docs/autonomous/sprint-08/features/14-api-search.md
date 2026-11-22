# 14 — Search in the developer API

Surface: `GET /api/v1/search/posts`, `GET /api/v1/search/people`. Wave 5. No
namespace.

## User story

As a member who runs a community bot, I want to search public posts with the
same operators the site understands (`from:@ada in:pixel-art has:media`) and
to find people by name, so that my bot can answer "what did we say about the
jam theme?" without scraping pages.

## Requirements elicitation

- **What exists (verified):**
  - `lib/search/parse.ts` (`parseQuery`: `from:@user`, `in:community`,
    `has:media`, `type:`, `before:` / `after:`; "Unknown operators …"),
    `lib/search/posts.server.ts` (`searchPostsScored`, public, undeleted,
    unlocked posts only: `"deletedAt" IS NULL`, `audience = 'PUBLIC'`,
    `"unlockPrice" IS NULL`; `postToHit`), `lib/search/people.server.ts`
    (`searchPeopleScored`, `personToHit`), and the site endpoint
    `lib/search/api/search.server.ts`. Semantic search
    (`embeddings.server.ts`, `hybrid.ts`) is separate.
  - The v1 API has no search (`ls app/routes/api/v1`); `GET /api/v1/feed` and
    `GET /api/v1/users/{handle}/posts` are the only post reads, and sprint 07
    11 added community posts.
  - The site's read-path registries that every post read must honour:
    quiet counts (`QUIET_COUNT_READ_PATHS`, sprint 04 14), content warnings and
    GIF descriptions (sprint 06 15/16 registries), quiz polls (sprint 07 19,
    `QUIZ_READ_PATHS`), and the community gate (private and banned).
- **Decisions:**
  - Scope `read:search` (one scope for both; group "Search").
  - **Posts:** `q` (1–200 chars, the site's operators), `limit` 1–50,
    `cursor` (opaque: the last hit's score and id), results serialised with
    the **same v1 post serialiser** the feed uses
    (`lib/api/serializers.server.ts`), so the read-path rules apply by
    construction; the new route files are added to every read-path registry
    that lists v1 post readers. Posts in private communities never appear
    (the search's public predicate plus the community visibility check); a
    post whose author blocks the key owner, or whom the key owner blocks, is
    dropped (`hiddenAuthorIds`, as the site passes).
  - **The registries by name:** `QUIET_COUNT_READ_PATHS`
    (`lib/feed/quiet-counts.ts`), `CONTENT_WARNING_READ_PATHS` /
    `CONTENT_WARNING_EXEMPT_PATHS` (`lib/feed/content-warning.ts`),
    `GIF_ALT_READ_PATHS` / `GIF_ALT_EXEMPT_PATHS` (`lib/feed/gif-alt.ts`),
    `QUIZ_READ_PATHS` / `QUIZ_NEVER_PATHS` (`lib/feed/quiz-poll.ts`). Each new
    file goes in the read list when it reads the field, or in the exempt /
    never map with its reason (a feed, like `lib/rss.ts`, is a "never" path for
    quiz answers).
  - **People:** `q` (1–100), `limit` 1–25, public profile fields only (as
    `GET /api/v1/users/{handle}`), deleted accounts (`isDeletedAccount`, and
    `deletionScheduledAt` set: hidden at once by the deletion request) and
    banned accounts excluded, blocked either way excluded. The site's
    `searchPeopleScored` does not drop banned or deletion-scheduled accounts
    itself, so the v1 handler filters the hydrated rows (the site search is
    unchanged).
  - Keyword search only: `semantic` is not exposed (it spends embedding
    compute per call). Each search costs **3 units** against the key's daily
    quota (the `cost` option of `withDeveloperApi`,
    `lib/api/with-developer-api.server.ts`; `usage.server.ts` only records
    what that option charges), and the key's per-minute limit applies.
  - Results are not cached across keys (they depend on the key owner's
    blocks).

## Functional requirements

1. FR-1 The two endpoints with validation, cursor, limits and the 3-unit cost.
2. FR-2 Blocks and private communities honoured; the read-path registries
   list the new files.
3. FR-3 Registry, scope, `NULLABLE`, SDK, docs, changelog and scopes doc.
4. FR-4 Test-mode fixtures.

## Non-functional requirements

- **Performance:** the existing indexed queries (`content_tsv`, trigram);
  `limit` caps the page; no N+1 in serialisation (the serialiser's batch
  loaders).
- **Security:** zod on `q`, `limit`, `cursor`; operators are parsed, never
  interpolated (the existing parser and `Prisma.sql`).
- **Privacy:** public content only; blocks both ways.
- **Compatibility:** additive.

## Data model and API

- No schema change.
- `lib/api/v1/search-schema.ts`, `lib/api/v1/search.server.ts`; route files
  `app/routes/api/v1/search/posts.ts`, `search/people.ts`.
- Edits: the read-path registries' lists (no edit to `usage.server.ts`: the
  cost is the route's `withDeveloperApi({ cost: 3 })`).

## Testing requirements

- Main suite `lib/api/__tests__/v1-search.test.ts`: scope; operators passed
  through; private community excluded; blocks both ways; cursor stable;
  3 units counted; serialiser shared (quiet counts honoured).
- Every read-path registry test passes with the new files listed.
- Existing: `lib/search/__tests__/*`.

## Acceptance criteria

- [ ] `q=from:@ada has:media` returns Ada's public media posts, newest first
      when there is no free text.
- [ ] A post in a private community never appears.
- [ ] A post by someone who blocked the key owner never appears.
- [ ] SDK and docs list both endpoints.

## Out of scope

Semantic search, searching messages, drafts, highlights or communities by
name through the API, saved searches.
