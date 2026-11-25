# 06 — Draft, test and fix your Connections grids

Surface: `/connections/new` (save as a draft, try it), `/connections/mine` (new: your grids with their figures), the
grid page (edit until someone plays it). Wave 2. Namespace `connections-maker`. Site tier (Steel).

## User story

As a member who makes Connections grids, I want to save a grid before it is finished, try it as a player would, fix a
typo after publishing as long as nobody has played it, and see how my published grids are doing, so that I publish
grids I am proud of and know which ones people enjoyed.

## Requirements elicitation

- **What exists (verified):**
  - `ConnectionsGrid` (`prisma/schema/games.prisma`: `authorId`, `title VarChar(80)`, `groups Json` — four groups of a
    label and four items, `playCount`, `solveCount`, `ratingSum`, `ratingCount`, `dailyDate`, `hidden`, `createdAt`;
    no `updatedAt`) and `ConnectionsPlay` (one per member per grid, guesses checked on the server).
  - `lib/party/connections.server.ts`: `createGrid` publishes immediately (capped at `MAX_GRIDS_PER_MEMBER`),
    `listGrids` (cached 30 s under `connections:list`: today's daily, newest 60 not hidden, top rated), `getGrid` (the
    author sees the solution and cannot play), `submitGuess`, `rateGrid`, `deleteGrid`, `scheduleGrid` (admin).
    Endpoints are registered modules in `lib/party/api/connections.grids*.server.ts` with contracts in
    `lib/party/connections.contract.ts`. The pages are `components/party/ConnectionsPages.tsx` (`ConnectionsSection`
    on `/daily` via `app/routes/daily/index.tsx`, `ConnectionsNew` on `app/routes/_site/connections.new.tsx`,
    `ConnectionsPlay` on `app/routes/_site/connections.u.$id.tsx`).
  - There is no edit, no draft, no list of a member's own grids, and no way to try a grid before strangers do: a typo
    in a published grid can only be fixed by deleting it.
  - The erasure registry keeps grids (`ConnectionsGrid: keep`, rule 3: published content others use).
- **Decisions:**
  - **Drafts:** a new column `draft Boolean @default(false)`. "Save draft" stores the grid unpublished; drafts are in no
    list, no daily, no link for anyone but the author (`getGrid` answers 404 to anyone else), and count toward
    `MAX_GRIDS_PER_MEMBER`. The cap is checked and the row created in one transaction under
    `lockKey(tx, 'connections-grids:<authorId>')` (today `createGrid` counts and then creates with no lock, so two
    quick saves could pass a cap of one; drafts make saving frequent). "Publish" turns a complete draft into a grid (the same validation as today) and stamps
    `publishedAt`; existing rows are published (the migration sets `publishedAt = "createdAt"`).
  - **Try it:** the author plays their draft or grid in a practice mode on the client: the four groups are shuffled
    with the same `stableOrder` rule, guesses are checked in the browser against the author's own groups (the author
    already sees the solution), and nothing is written.
  - **Edit:** the author may change the title, labels and items while the grid has no play by another member
    (`playCount = 0` and no `ConnectionsPlay` rows); after that it is locked, and the page says why. The edit runs as a
    compare-and-set (`updateMany` where `playCount = 0`) so a play that lands first wins. Today `submitGuess` reads
    the grid's `groups` **before** its transaction and creates the first `ConnectionsPlay` inside it, so an edit landing
    between the two would let a guess be judged against the old groups. So the edit and the first play serialise:
    `updateGrid` takes `lockKey(tx, 'connections-grid:<id>')` before its CAS, and `submitGuess` takes the same lock and
    re-reads `groups` (and `draft`, `hidden`) inside its transaction before judging.
  - **Your grids** (`/connections/mine`, personal): drafts first, then published grids with plays, solve rate, average
    rating (shown once there are 3 ratings), whether it was a daily, and "Hidden by a moderator" for a hidden one. Rows
    on rules, figures in `t-meta`.
  - **Erasure:** drafts are erased with the account (they were never published); published grids stay under "Deleted
    user" as today. The registry entry becomes `ConnectionsGrid: { decision: 'erase', scope: 'draft rows only
    (draft = true); published grids stay under "Deleted user" (rule 3)', reason: … }`: the erasure coverage test
    fails any `keep` model that `anonymizeAccount` touches ("touches no keep, todo or cascade model"), and an `erase`
    entry with a `scope` is how the registry states a partial erasure (`CardTrade`, `CommunityHandover`).

## Functional requirements

1. FR-1 Migration `20261202020100_s12_connections_maker`: `draft BOOLEAN NOT NULL DEFAULT false`, `publishedAt
   TIMESTAMP(3)` with existing rows set from `createdAt`, `updatedAt TIMESTAMP(3)`; a plain index
   `connections_grid_authorId_draft_idx` is **not** added (the existing `[authorId, createdAt]` serves the list).
2. FR-2 `lib/party/connections.server.ts`: `createGrid({ draft })`, `updateGrid` (CAS on no plays), `publishGrid`,
   `listMyGrids`; every public read adds `draft: false` (`listGrids`, `getGrid` for non-authors, `submitGuess`,
   `rateGrid`, `scheduleGrid` refuses a draft); the cap under its lock; the edit/first-play lock above.
3. FR-3 Endpoints: `PATCH /api/connections/grids/$id` (edit), `POST /api/connections/grids/$id/publish`,
   `GET /api/connections/mine`, as registered modules with contracts; writes `rateLimit: 'write'`.
4. FR-4 `lib/party/connections-practice.ts` (pure): the practice checker used by the try-it mode.
5. FR-5 UI: `ConnectionsNew` gains "Save draft" and "Try it"; `ConnectionsPlay` gains "Edit" for the author while
   unplayed; `components/party/ConnectionsMine.tsx` on `app/routes/_site/connections.mine.tsx` (`EXCLUDED_ROUTES`
   personal, under the Wave 0 sitemap anchor); one ink primary per view (R4: "Publish" on the form).
6. FR-6 Refusals: `CONNECTIONS_GRID_PLAYED` ("This grid has been played, so it can no longer be changed"),
   `CONNECTIONS_GRID_INCOMPLETE` ("Fill in all four groups before publishing").
7. FR-7 Erasure op (`connectionsGrid.deleteMany({ where: { authorId, draft: true } })`) under the Wave 0 anchor; the
   registry entry changed to a scoped `erase` as above; `pnpm docs:deletion`.

## Non-functional requirements

- **Privacy:** a draft is never in a list, the cache, a daily, the sitemap or an OG card; a test covers each read.
- **Integrity:** an edit never changes a grid someone has played (the CAS); guesses stay checked on the server.
- **Accessibility:** practice mode announces results as the real game does; names and titles `dir="auto"`.

## Data model and API

`ConnectionsGrid` gains `draft Boolean @default(false)`, `publishedAt DateTime?`, `updatedAt DateTime?`.
`GET /api/connections/mine` → `{ grids: [{ id, title, draft, publishedAt, playCount, solveCount, ratingAverage,
ratingCount, dailyDate, hidden }] }`.

## Testing requirements

- Main suite `lib/party/__tests__/connections-maker.test.ts`: a draft is 404 to others, absent from `listGrids` and the
  daily, cannot be guessed, rated or scheduled; an edit after another member's play is refused, and the CAS loses to a
  concurrent first play (and a guess after a concurrent edit is judged against the new groups); publish validates;
  the cap counts drafts and holds under two concurrent saves.
- Product suite `lib/party/__tests__/connections-practice.product.test.ts`.
- Main suite `lib/account/__tests__/connections-drafts-erasure.test.ts`: drafts go, published grids stay.
- Gates: route table, sitemap coverage, OG coverage, design consistency and Steel flat, arrival coverage, user-text
  direction, quiet counts (`playCount` is not a post count; classify honestly under the Wave 0 anchor if the scan
  asks).

## Acceptance criteria

- [ ] A member saves a half-made grid, comes back, tries it, publishes it.
- [ ] Nobody but the author can open a draft by its link.
- [ ] A typo can be fixed before the first play and not after.
- [ ] `/connections/mine` shows plays, solve rate and rating for each published grid.

## Out of scope

Co-authors, scheduling one's own grid as a daily (admin only), reports on grids (16 adds them).
