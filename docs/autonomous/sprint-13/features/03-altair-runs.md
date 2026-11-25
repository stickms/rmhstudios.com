# 03 — Your Altair runs, solo and co-op

Surface: Altair's main menu ("Your runs", a new screen), the data export. Wave 5. Namespace `altair-runs`. App tier (L8).

## User story

As an Altair player, I want to see my recent runs — the class I played, how long I survived, my kills and bosses, whether
the run was verified and, if it was refused, why — and my co-op matches with who I played with, so that I can tell how I
am improving and understand why a run did not count.

## Requirements elicitation

- **What exists (verified):**
  - Solo runs are issued, submitted and verified on the server: `AltairSoloRun` (`prisma/schema/games/altair.prisma`:
    `seed`, `classId`, `doubleTime`, `loadout`, `status` open | submitted | verified | rejected | unverified | abandoned
    | expired, `issuedAt`, `submittedAt`, `verifiedAt`, `result` "the replay's numbers (never the client's claim) once
    verified", `rejectReason`, `coinsCredited`, `firstClearBonus`; `@@index([userId, issuedAt(sort: Desc)])`), written by
    `features/altair/engine/solo/issue.server.ts`, `persist.server.ts` and `queue.server.ts`, read only for the run in
    progress (`features/altair/api/altair.run.status.server.ts`, `altair.run.finish.server.ts`).
  - Co-op matches are recorded by the hub's verified-run path: `AltairMatch` (`victory`, `durationMs`, `playerCount`,
    `doubleTime`, `sharedKills`, `bossesDefeated`) and `AltairMatchPlayer` (`userName` copy, `classId`, `finalLevel`,
    `kills`, `coinsEarned`, `timeSurvived`, `wasDowned`, `wasRevived`, `revivesGiven`, `wasAliveAtEnd`;
    `@@index([userId])`), written by `features/altair/engine/verify/persist.server.ts`. **Nothing reads either list**:
    the only other references are the erasure (`lib/account/erasure-games.server.ts`: `AltairMatchPlayer` is
    `deidentify`, `AltairSoloRun` is `erase`).
  - Neither is in the data export (no `altairSoloRun` or `altairMatchPlayer` in `lib/account/`'s export files).
  - The game's menu is a set of screens (`features/altair/ui/screens/MenuScreen.tsx`, `BestiaryScreen.tsx`,
    `MetaShopScreen.tsx`); its contract is `features/altair/engine/altair.contract.ts`.
- **Decisions:**
  - **What is listed:** the member's own solo runs that left `open` (submitted, verified, rejected, unverified,
    abandoned, expired), newest first, 20 a page with a cursor on `(issuedAt, id)`; and their co-op matches, newest
    first, 20 a page on `(createdAt, id)` of their `AltairMatchPlayer` row.
  - **A solo row:** class, double time, when, status in words, and for a verified run the replay's time survived, kills,
    level and bosses (from `result`, parsed with a zod schema; a row whose `result` does not parse shows the status
    only), the coins credited and a first-clear mark. A rejected run shows its reason in words from a fixed map of the
    verifier's reason codes; an unknown code shows "The run could not be checked". Nothing the client claimed is shown.
  - **A co-op row:** victory or not, duration, players, the member's own numbers, and teammates' names. Teammate names
    are read **now** from their user rows (joined, never the copied `userName`), so a renamed teammate shows their
    current name and an erased one shows "Deleted user"; a teammate the member blocks, or who blocks them, shows
    "A player".
  - **Whose:** only the member's own rows; the endpoint takes no user id.
  - **Export:** the member's solo runs (without seeds or loadouts) and their co-op rows (their own numbers and the
    match's), under the sprint 13 export anchor, as `altairRuns`.

## Functional requirements

1. FR-1 `features/altair/engine/runs.ts` (new, pure): the status and reject-reason words as keys, the `result` zod
   schema, the cursor codec.
2. FR-2 `features/altair/engine/runs.server.ts` (new): `listSoloRuns(userId, cursor)`, `listCoopMatches(userId, cursor)`
   (teammates joined by id; blocks read once per page), `exportAltairRuns(userId)`.
3. FR-3 Endpoints (registered modules, `rateLimit: 'read'`): `GET /api/altair/runs?kind=solo|coop&cursor=` in
   `features/altair/api/altair.runs.server.ts`, declared in `altair.contract.ts`.
4. FR-4 `features/altair/ui/screens/RunsScreen.tsx` (new), reached from `MenuScreen.tsx` ("Your runs"), with "Solo" and
   "Co-op" views, loading, empty ("No finished runs yet"), error and signed-out states, in the game's own look.
5. FR-5 The export property `altairRuns` under `// s13-03 altair-runs` in `lib/account/export-sprint-13.server.ts`.

## Non-functional requirements

- **Privacy:** no other member's solo run is ever readable; a co-op teammate's own numbers are shown only as the match
  recorded them for the member's match (the match is shared content), never the teammate's other matches.
- **Honesty:** only server-verified numbers are shown; the copied `userName` is never rendered.
- **Performance:** both reads use the existing indexes (`[userId, issuedAt]`, `[userId]` with `createdAt`); no new index.

## Data model and API

No schema change. `GET /api/altair/runs?kind=solo` → `{ runs: SoloRunView[], nextCursor }`; `kind=coop` →
`{ matches: CoopMatchView[], nextCursor }`.

## Testing requirements

- Main suite `features/altair/engine/__tests__/runs.server.test.ts`: only the caller's rows; open runs excluded; a
  rejected run's reason maps; an unparsable `result` shows the status only; a blocked teammate is "A player"; an erased
  one is "Deleted user"; the cursor pages without gaps.
- Product suite `features/altair/engine/__tests__/runs.product.test.ts`: the cursor codec and the reason map.
- `features/altair/ui/__tests__/runs-screen.test.tsx` (`renderToStaticMarkup`): empty, a verified and a rejected row.
- `lib/account/__tests__/export-sprint-13.test.ts` (key `altairRuns`), the user-text direction gate.

## Acceptance criteria

- [ ] After a verified solo run, "Your runs" lists it with the replay's time survived and kills.
- [ ] A refused run shows why in words.
- [ ] A co-op match lists the teammates by their current names, and a blocked teammate as "A player".
- [ ] The data export carries `altairRuns`.

## Out of scope

Other members' runs, replays of a past run, co-op leaderboards (the existing board stays as it is).
