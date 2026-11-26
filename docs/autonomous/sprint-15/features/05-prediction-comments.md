# 05 — Prediction comments that respect blocks, and that you can delete or report

Surface: a market's discussion in Predictions (`components/forecasting/MarketPanel.tsx`, on `/predictions` and the
market panel), the moderation queue, Your reports, the data export. Wave 2. Namespace `prediction-comments`. Site tier
(Steel).

## User story

As a member discussing a prediction market, I want comments from people I blocked or muted to stay out of my view, to
delete a comment I regret, and to report one that crosses a line, so that the market's discussion is held to the same
rules as every other place members write to each other.

## Requirements elicitation

- **What exists (verified):**
  - `PredictionComment` (`prisma/schema/economy.prisma`: `predictionId`, `userId`, `body` 500, `side`, `shares` at the
    time, `createdAt`) is written by `addComment` and read by `listComments` (`lib/forecasting/forecasting.server.ts`),
    served by `GET`/`POST /api/predictions/$id/comments` (`lib/predictions/api/predictions.$id.comments.server.ts`,
    contracts `listPredictionCommentsApi`, `addPredictionCommentApi` in `lib/predictions/predictions.contract.ts`), and
    rendered by `components/forecasting/MarketPanel.tsx`.
  - `listComments` returns the newest 50 rows with **no block, mute or ban filter**: a member blocked either way, or
    muted, or banned, is shown to everyone. There is **no delete** (the route has `GET` and `POST` only) and **no
    report path** (`prediction-comment` is not in `REPORT_ENTITY_TYPES`).
  - The `POST` already checks the `comment` timeout (`restrictionResponse`, sprint 14 17) and the market's visibility
    (`visibleMarket`: pending or denied markets only for their creator).
  - Comments are not in the data export (`lib/account/api/account.export.server.ts` and the sprint export files carry
    none); the erasure registry keeps them under "Deleted user" (`PredictionComment: keep`).
  - `getHiddenAuthorIds(viewerId)` (`lib/moderation.server.ts`) returns blocks both ways and active mutes, cached.
- **Decisions:**
  - **Reads:** `listComments` leaves out hidden authors for a signed-in viewer and banned authors for everyone, and
    pages on (`createdAt`, `id`) with "Show earlier comments" (page 20) instead of the fixed 50.
  - **Delete your own:** `DELETE /api/predictions/comments/$id` (new) for the author; the row is deleted (a market's
    discussion is short-lived and nothing else references it). Admins may delete any.
  - **Report:** a new member-item type `prediction-comment` (the `PredictionComment` id): reportable by a signed-in
    member who can see the market, not their own; removable (deleted). The queue previews the body, the market title
    and the side held.
  - **Export:** the member's own comments (market title, body, side, shares, time) under the Wave 0 export anchor.
  - **Mute registry:** the read joins `MUTE_READ_PATHS` (`lib/moderation/mute-expiry.ts`) under the anchor.
  - **Self-exclusion:** Predictions is a risk surface (sprint 14 16); nothing here changes what an excluded member sees.

## Functional requirements

1. FR-1 `lib/forecasting/forecasting.server.ts`: `listComments(predictionId, viewerId, cursor)` with the filters and
   keyset paging; `deleteComment(id, userId, isAdmin)`; `exportPredictionComments(userId)`.
2. FR-2 Routes: the `GET` accepts `cursor` (zod, in the contract); `lib/predictions/api/predictions.comments.$id.server.ts`
   (new) `DELETE`, contract `deletePredictionCommentApi`.
3. FR-3 Report path: `prediction-comment` under the Wave 0 anchors in the six report files, with eligibility
   (`visibleMarket` for the reporter), a takedown branch (delete) and a preview.
4. FR-4 UI: in `MarketPanel.tsx`, a menu on each comment (`components/ui/menu.tsx`) with Delete (own, confirm) or
   Report (others, lazy `ReportDialog`); "Show earlier comments"; the comment body `dir="auto"` (already member text).
5. FR-5 `MUTE_READ_PATHS` and `USER_TEXT_RENDERERS` entries under the anchors.

## Non-functional requirements

- **One query for the hidden set** (the cached helper) and one for the page; no per-comment lookup.
- **Query shapes (verify against the schema):** `PredictionComment.side` is optional (`String?`); `userId` is required
  (`notIn`, never `null`); order `[{ createdAt: 'desc' }, { id: 'desc' }]`; the cursor is the `(createdAt, id)` pair
  encoded as one string, compared with `OR` (not Prisma's `cursor`, which skips on equal times).
- **The GET stays `private, no-store`** (the viewer's hidden set changes the answer).
- **Steel:** comment rows on rules, the menu is the overlay, no new arbitrary utilities.

## Testing requirements

- Main suite `lib/forecasting/__tests__/prediction-comments.test.ts` (fakes through `shapeChecked`, bodies through
  `assertJsonSafe`): a blocked, blocking, muted and banned author left out; paging across equal times without
  duplicates; delete by author, by admin, refused for others (`404`).
- Main suite `lib/moderation/__tests__/prediction-comment-reports.test.ts`: eligibility (hidden market, own comment),
  takedown deletes, preview.
- `lib/moderation/__tests__/music-reports.test.ts`, the mute read-path test, the export test
  (`lib/account/__tests__/export-sprint-15.test.ts`, enabling the `predictionComments` expectation).

## Acceptance criteria

- [ ] A member who blocked another no longer sees their comments on any market.
- [ ] A member deletes their own comment; it is gone for everyone.
- [ ] A comment can be reported, and "Resolve and remove" deletes it.
- [ ] Older comments load with "Show earlier comments" with no repeats.
- [ ] The data export lists the member's comments.

## Out of scope

Editing a comment, replies to comments, likes on comments, the AI advocate's text.
