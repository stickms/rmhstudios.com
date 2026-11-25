# 05 — Make and share a Lights Out board

Surface: `/lights-out/new` (make a board), `/lights-out/b/$id` (play one), `/lights-out/boards` (boards members made),
the report dialog. Wave 2. Namespace `lights-out-maker`. Site tier (Steel), with the board drawn as the daily puzzle
draws it.

## User story

As someone who plays the daily Lights Out, I want to design my own board, check that it can be solved, and send it to
friends to see who solves it in the fewest moves, so that there is more Lights Out than one puzzle a day and the puzzles
can be ones I made.

## Requirements elicitation

- **What exists (verified):**
  - The daily game (`components/lights-out/LightsOutGame.tsx`, `/daily/lights-out`) plays one seeded board a day.
    `lib/lights-out/lights-out.ts` has the board operations a maker needs (`createEmptyGrid`, `toggleCellInGrid`,
    `isSolved`, `generatePuzzle`) but **not a solver for maker-sized boards**: `solvePuzzle` (and `getOptimalMoves`,
    which calls it) is a brute force over press subsets capped at `1 << 15` masks ("feasible for up to ~15 cells"), so
    on a board of more than 15 cells it tries only subsets of the first 15 cells and answers `null` or a non-optimal
    count. A 5×5 board has 25 cells and a 7×7 board 49. (The daily's 4×4 rectangle has 16 cells and is already
    affected.)
  - Shapes (`lib/lights-out/shapes.ts`): rectangles, triangles and twelve masked shapes (`SHAPES`, not exported), one a
    day by seed.
  - Member-made puzzles exist for one other game: Connections grids (`ConnectionsGrid` / `ConnectionsPlay` in
    `prisma/schema/games.prisma`, `lib/party/connections.server.ts`, `components/party/ConnectionsPages.tsx`, the pages
    `/connections/new` and `/connections/u/$id`). Their pattern (denormalised play and solve counts, `hidden`, one play
    row per member) is the one to copy. Connections grids have no report path (`REPORT_ENTITY_TYPES` in
    `lib/moderation/report-constants.ts` has no entry for them); the new boards will.
  - Replays of a Lights Out solve exist (sprint 09 18) for the daily board only.
- **Decisions:**
  - **Making:** pick a shape (the daily shapes, exported from `shapes.ts`, or a rectangle from 3×3 to 7×7), then either
    press cells to set the starting lights or "Scramble" (random presses from the solved board, so the board is always
    solvable). The maker shows "Solvable in N moves" live (the exact solver below) and refuses to publish an unsolvable
    board, an already-dark board or one solvable in fewer than 3 moves. A title (up to 60 characters) is required.
  - **Playing:** the board page plays like the daily (the same cell buttons and labels), with "Restart" and no hint. On
    a solve, the press sequence is sent; the server replays it on the stored board and records the move count only if
    the sequence really turns every light off. Best moves per member are kept; a play is recorded once a member has
    pressed at least once.
  - **Fewest moves:** each board lists its ten fewest-move solvers (ties by time of solve), with board privacy applied
    (`leaderboardHiddenUserIds`, `BOARD_PRIVACY_READ_PATHS`), and the board's optimum ("best possible: N"). Blocked
    members (either way) are left out of the viewer's list.
  - **Boards page:** "Recently made" and "Most played" (25 each, cursor paged), and "Yours" for the signed-in member.
    Hidden boards and boards by banned or deleted authors are left out.
  - **Paths:** `/lights-out` itself stays the legacy redirect to the daily (`LEGACY_REDIRECTS` in
    `lib/route/legacy-redirects.ts` matches the exact path only), so the three new pages live under it without a parent
    route.
  - **Sharing:** the board page has the site's share control (copy link, post it through `/share`).
  - **Caps:** 10 new boards a day and 200 in all per member (`lockKey(tx, 'lights-out-boards:<userId>')`).
  - **Moderation:** a new report entity `lights-out-board` (the title is member text). It is removable: takedown sets
    `hidden`. The author can delete their board.
  - **Erasure** (as Connections): boards are published content others play and stay under "Deleted user" (`keep`, rule
    3); plays are erased. **Export:** the member's boards (title, shape, cells, created) and plays (board id, best
    moves, solved at).
  - **SEO:** `/lights-out/boards` is a public page with a section card in `lib/og/static-cards.ts` and an entry in the
    public sitemap; `/lights-out/new` is `personal` in `EXCLUDED_ROUTES`; `/lights-out/b/$id` is member content in
    `DYNAMIC_ROUTES` with `null` (reached from the boards page, as `/connections/u/$id` is), and unfurls with its own
    title through `definePage`.

## Functional requirements

1. FR-1 Models `LightsOutBoard` and `LightsOutBoardPlay`; caps under the lock.
2. FR-2 `lib/lights-out/boards.ts` (pure): shape validation (`isAllowedShape`), board encoding (a row-major string of
   `0`/`1` over active cells), publish checks, and `replayPresses(board, presses)`; and `lib/lights-out/solve.ts`
   (pure): an exact minimum-press solver over GF(2) (Gaussian elimination on the press matrix of the shape's active
   cells, then the fewest-press solution over the null space, which is enumerated; refuse a shape whose null space has
   more than 2^16 vectors, which no allowed shape reaches). `solvePuzzle` and `getOptimalMoves` keep their signatures
   and call it, so the daily's 4×4 rectangle becomes exact; for every daily shape of 15 cells or fewer the move count is
   unchanged (a test compares the old brute force with the new solver on every daily shape over 200 seeds).
3. FR-3 `lib/lights-out/boards.server.ts`: create, list (recent, most played, mine), get, record a solve
   (compare-and-set on a better move count), delete (author), fewest-moves list.
4. FR-4 Registered endpoints with contracts in `lib/lights-out/boards.contract.ts`; writes `rateLimit: 'write'`; the
   solve endpoint `{ limit: 30, windowMs: 60_000 }`.
5. FR-5 Pages `app/routes/_site/lights-out.new.tsx`, `lights-out.b.$id.tsx`, `lights-out.boards.tsx` and
   `components/lights-out/BoardMaker.tsx`, `BoardPlay.tsx`, `BoardsList.tsx`; the board drawing is shared with the daily
   game by extracting its cell grid into `components/lights-out/LightsGrid.tsx` (no change to the daily's behaviour).
6. FR-6 The report entity (under the Wave 0 anchors in the report constants, the report route's target lookup and the
   takedown); erasure, export and sitemap entries under the anchors.

## Non-functional requirements

- **Integrity:** a recorded move count is always the length of a press sequence the server verified.
- **Accessibility:** each cell is a button with its row, column and state (as the daily's `cell-label`); the solvability
  line is announced politely; the maker and the board work by keyboard: each cell is a native button (Tab order row by
  row, Space or Enter toggles), as the daily's cells are.
- **Design:** Steel on the page; the board itself is a picture of the game and keeps the daily's drawing.

## Data model and API

- `LightsOutBoard` (`@@map("lights_out_board")`: `id`, `authorId` → `User` (relation `LightsOutBoards`), `title`
  `@db.VarChar(60)`, `shape Json`, `cells` `@db.VarChar(64)`, `optimalMoves Int`, `playCount Int @default(0)`,
  `solveCount Int @default(0)`, `hidden Boolean @default(false)`, `createdAt`, `@@index([hidden, createdAt])`,
  `@@index([hidden, playCount])`, `@@index([authorId, createdAt])`) and `LightsOutBoardPlay`
  (`@@map("lights_out_board_play")`: `id`, `boardId` → board (cascade), `userId` → `User` (relation
  `LightsOutBoardPlays`), `bestMoves Int?`, `solvedAt DateTime?`, `updatedAt`, `@@unique([boardId, userId])`,
  `@@index([userId])`, `@@index([boardId, bestMoves])`) in `prisma/schema/games.prisma`. Migration
  `20261201020300_s11_lights_out_maker`.
- Erasure registry: `LightsOutBoard` `keep` (rule 3), `LightsOutBoardPlay` `erase`.

## Testing requirements

- Product suite `lib/lights-out/__tests__/solve.product.test.ts`: the solver agrees with brute force on every shape of
  15 cells or fewer (200 seeded boards each); on 5×5 (null space of size 4) and 7×7 it returns a solution that clears
  the board and no shorter one exists (checked by enumerating the null space independently); unsolvable boards answer
  `null`; it runs a 7×7 board in under 50 ms (fastest of five runs).
- Product suite `lib/lights-out/__tests__/boards.product.test.ts`: shape validation (every daily shape and the rectangle
  range accepted, others refused), encoding round trip, publish refusals (unsolvable, dark, under 3 moves),
  `replayPresses` on solved and unsolved sequences, scramble always solvable over 500 seeds.
- Main suite `lib/lights-out/__tests__/boards.test.ts`: caps under the lock; a solve whose presses do not solve is not
  recorded; a worse move count does not replace a better one; hidden boards and banned authors absent from lists; the
  fewest-moves list applies board privacy and blocks; delete is author-only.
- Main suite `lib/account/__tests__/lights-out-boards-erasure.test.ts`: plays erased, boards kept.
- Report coverage (`lib/moderation/__tests__/music-reports.test.ts` holds every removable type's takedown), sitemap and
  OG coverage, board privacy registry, route table, user-text direction (the title renders with `dir="auto"`).

## Acceptance criteria

- [ ] A member draws a 5×5 board, sees "Solvable in 7 moves", publishes it and plays it from the link.
- [ ] A friend solves it in 9 moves and appears under the author on the fewest-moves list.
- [ ] An unsolvable board cannot be published.
- [ ] A reported board, removed by an admin, is gone from the boards page and its link.

## Out of scope

Daily scheduling of member boards (Connections has it; a later sprint could add it), comments on boards, ratings, other
puzzle modes' makers.
