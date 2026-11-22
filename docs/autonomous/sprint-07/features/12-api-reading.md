# 12 — Highlights, notes and shelves in the developer API

Surface: `/api/v1/me/highlights*`, `/api/v1/me/shelves*`,
`/api/v1/me/reading-goal`, the OpenAPI document, SDK and docs. Wave 6. No
namespace.

## User story

As a reader who keeps notes in my own notes app, I want a script to pull every
highlight and note I make on the site's books, blog and news, newest first and
from where it last stopped, so that my notes app has them without me exporting a
file every week.

As a reader, I want my script to mark a book as read when I finish it
elsewhere, so that my shelves and yearly goal stay true.

## Requirements elicitation

- **What exists (verified):**
  - Highlights with optional notes on library books, blog posts and news
    (`ReadingHighlight`, `prisma/schema/library.prisma`: `docKind`, `docKey`,
    `exact`, `prefix`, `suffix`, `note`, `isPublic`), served to the site by
    `lib/reading/highlights.server.ts` (`listMyHighlights` with a cursor,
    `searchHighlights` with filters, `updateHighlight`, `deleteHighlight`,
    `exportHighlights`) and exported as a file (`lib/reading/highlights-export.ts`,
    sprint 02 14).
  - Shelves and the yearly goal: `ReadingShelfEntry` (`want`, `reading`,
    `read`, `pages`, `finishedAt`), `ReadingGoal` (`books` | `pages`), and
    `lib/reading/shelves.server.ts` (`getMyShelves`, `setShelf`,
    `removeShelf`, `getGoalProgress`, `setGoal`).
  - The developer API has none of this (`ls app/routes/api/v1/me`: no
    highlights or shelves) and no reading scope (`lib/api/scopes.ts`).
  - Sprint 06 13 is the worked example for a `me/*` v1 domain (keyset cursor,
    write budget, `NULLABLE` in `scripts/generate-sdk.ts`).
- **Decisions:**
  - Scopes: `read:reading` ("Read your highlights, notes, shelves and reading
    goal") and `write:reading` ("Edit, publish, unpublish and delete your
    highlights and notes, and edit your shelves"). Making a highlight public
    through the API runs `updateHighlight`, so the site's rules for public
    highlights apply. Wildcard keys (`read:*`, `write:*`, `*`) satisfy them as
    for every scope; the changelog says so, because private notes are among
    the most personal data the API serves. No endpoint takes a `userId`.
  - Endpoints:
    - `GET /api/v1/me/highlights?cursor&kind&since&hasNote&visibility` — newest
      first; `since` (ISO) returns highlights **updated** after that instant
      (ordered by `updatedAt` then `id`, with its own cursor), which is what a
      sync needs. Each item: id, document kind, key, title and site URL, quote
      (`exact`), `note`, `isPublic`, `createdAt`, `updatedAt`.
    - `PATCH /api/v1/me/highlights/$id` `{ note?: string | null, isPublic? }`
      and `DELETE /api/v1/me/highlights/$id` — through `updateHighlight` and
      `deleteHighlight`, so the passage counters and public-highlight rules
      are the site's.
    - `GET /api/v1/me/shelves?shelf` and `PUT /api/v1/me/shelves/$slug`
      `{ shelf, pages?, finishedAt? }`, `DELETE /api/v1/me/shelves/$slug` —
      through `setShelf`/`removeShelf`; an unknown library slug is a 404.
    - `GET /api/v1/me/reading-goal?year` — the goal and progress
      (`getGoalProgress`).
  - Creating highlights through the API is out of scope: a highlight anchors to
    a text position (`start`, `end`, `version`) the site computes from the
    rendered document; accepting positions from a script would create anchors
    that do not resolve.
  - Deleted documents: a highlight whose document no longer exists is returned
    with `document: null` (the site's notebook shows these as "Removed"), so a
    sync never silently loses a note.
  - Deletions are not tombstoned: a sync that needs to know about deleted
    highlights compares ids (documented in the endpoint description). A
    tombstone table is out of scope.

## Functional requirements

1. FR-1 The seven endpoints above with their scopes, key restrictions and rate
   limits.
2. FR-2 The `since` sync mode with a stable `(updatedAt, id)` keyset. **No
   index is added** (decided in validation, so the schema question is not
   left to the implementer): the query filters on `userId`, which leads two
   existing `ReadingHighlight` indexes, and one member's highlights are a
   small set (the site's own export caps at `EXPORT_CAP` = 10 000,
   `lib/reading/highlights-export.ts:12`); sorting them per page is cheap. If
   a later measurement disagrees, an index is a follow-up.
3. FR-3 OpenAPI entries under the `s07-12 api-reading` anchor, the two scopes,
   `NULLABLE` entries (`note`, `document`, `finishedAt`, `goal`), regenerated
   SDK and API docs, changelog and scopes docs.
4. FR-4 `Idempotency-Key` on writes as elsewhere, and a per-key write budget
   (`writeBudgetExceeded`, as in the flashcards API) on PATCH, PUT and DELETE.

## Non-functional requirements

- **Additive only.**
- **Privacy:** only the key owner's own rows, ever; private notes are returned
  only to the owner's key (they are the owner's).
- **Correctness:** writes go through the site functions, so public highlight
  counters (`ReadingPassageStat`, `ReadingHighlightPassage`) stay right.
- **Performance:** a page is at most 100 items; one query plus one batched
  document-title lookup per page.
- **No conflict with feature 18** (same wave): this feature does not edit
  `lib/reading/*.server.ts` beyond importing; if a list function is missing,
  it goes in `lib/api/v1/reading.server.ts`.

## Data model and API

- No schema change.
- `lib/api/v1/reading-schema.ts`, `lib/api/v1/reading.server.ts`.
- Route files `app/routes/api/v1/me/highlights.ts`, `me/highlights/$id.ts`,
  `me/shelves.ts`, `me/shelves/$slug.ts`, `me/reading-goal.ts`.
- `lib/api/scopes.ts`, `lib/api/registry.ts` (anchor),
  `scripts/generate-sdk.ts` (anchor), regenerated SDK and docs.

## Testing requirements

- Main suite `lib/api/v1/__tests__/reading-api.test.ts`: scope required; only
  the owner's rows; `since` returns edited highlights in `(updatedAt, id)`
  order across a page boundary with equal timestamps; patch note and
  visibility through the site function (passage counter updated when made
  public); delete; shelf set to `read` with `finishedAt` counts toward the
  goal; unknown slug 404; removed document → `document: null`.
- The existing OpenAPI, registry and SDK tests.
- Gate tests: route table, migration safety if a migration was added.

## Acceptance criteria

- [ ] A script syncing with `since` receives a note edited on the site a minute
      ago and nothing older.
- [ ] Marking a book read through the API moves the yearly goal on the site.
- [ ] Another member's key cannot read anyone else's highlights.
- [ ] The SDK has typed methods and no `unknown` fields.

## Out of scope

Creating highlights, deletion tombstones, public highlights of other members,
reading time (feature 18), webhooks for highlights.
