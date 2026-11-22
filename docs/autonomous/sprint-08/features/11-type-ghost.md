# 11 — Race your own best in RMHType

Surface: RMHType solo mode (`/rmhtype/solo`, app tier), the RMHType socket
handler and the progress page. Wave 4. Namespace `type-ghost`.

## User story

As a typist practising the same passages, I want a faint second caret that
types the passage the way I did on my best run, so that I can see, as I type,
whether I am ahead of myself — the thing that makes a fifth attempt at a
passage worth it.

## Requirements elicitation

- **What exists (verified):**
  - Solo runs are scored by the socket handler
    (`server/socket-server/handlers/rmhtype.ts`, "Create solo match record",
    `isSolo: true`), which writes `RmhTypeMatch` with `passageId` and
    `RmhTypeMatchPlayer` (`wpm`, `accuracy`, `timeMs`), and the progress page
    reads them (`lib/rmhtype/progress.server.ts`).
  - The passage is picked by the server (`lib/rmhtype/sources.ts`: "the
    server picks the passage (the text is what scoring is measured
    against)"); the client UI is `components/rmhtype/RmhTypeSoloPage.tsx`
    with `TypingStats.tsx`.
  - Keystroke accounting is pure and timer-free (`lib/rmhtype/typing-run.ts`),
    and the key statistics deliberately keep "counters rather than a keystroke
    log" (`keystats.ts`).
  - There is no pace or ghost caret anywhere (`grep -rni "pace caret\|ghost"
    lib/rmhtype` finds none).
- **Decisions:**
  - **What a ghost is:** a progress curve — the number of correct characters
    reached at each 250 ms of the run, as a small integer array (at most
    `MAX_GHOST_SAMPLES = 2 400`, ten minutes) — not a keystroke log: no key
    identities, no errors, nothing a key logger would want. Stored per member
    per passage (`RmhTypeGhost (userId, passageId, wpm, timeMs, samples Int[],
    createdAt)`, `@@id([userId, passageId])`).
  - **When it is saved:** the solo finish event already carries the result;
    it now also carries `samples`. The server keeps it only when the run is a
    new best WPM for that passage for that member, the passage is a stored
    one (never `room.aiPassage`, a passage written to order for one run, and
    never the `'unknown'` fallback id — the same rule `persistSoloResult`
    already applies), accuracy ≥ 90%, and the
    curve is **plausible**: monotonic, ends at the passage length, its
    duration within ±500 ms of the server's `timeMs`, no 250 ms step implying
    more than `MAX_WPM`. An implausible curve is dropped silently (the run's
    score is unaffected). A member keeps at most **500** ghosts; saving the
    501st deletes their least recently raced one (`updatedAt`), in the same
    transaction.
  - **Racing it:** when a solo passage starts and the member has a ghost for
    it, the client fetches it (`GET /api/rmhtype/ghosts/{passageId}` — a
    React Query read; the RMHType route is not an island) and draws a second
    caret at the ghost's position, advanced **on each of the member's own
    keystrokes and on one 250 ms `setInterval`** that the solo page owns
    only while the run is typing and a ghost is shown (solo runs get no
    progress broadcast from the hub — `startProgressBroadcast` is for
    multiplayer rounds — so without it the ghost would freeze whenever the
    member pauses). The interval starts at `rmhtype:solo:started`, and is
    cleared on the result, on the run's timeout, when the tab is hidden and
    on unmount; the position is computed from elapsed time at each render.
    No frame loop and no `requestAnimationFrame`; nothing runs before the
    start or after the finish (app tier, a live run is not "at rest"). The finish
    screen shows "Ahead of your best by 1.4 s" or "Behind by 0.8 s".
  - **Control:** a "Race my best" switch in the solo settings (default on;
    device preference with a `lib/device-data/registry.ts` line), and "Clear
    my ghosts" on the progress page (`useConfirm`). The caret is decorative
    for sighted users and `aria-hidden`; the ahead/behind line is announced
    at the end of a run only.
  - Multiplayer rooms, the daily and lessons are unchanged.

## Functional requirements

1. FR-1 The solo finish event carries `samples`; the handler validates and
   upserts the ghost on a new passage best.
2. FR-2 `GET /api/rmhtype/ghosts/{passageId}` (own ghost only) and
   `DELETE /api/rmhtype/ghosts` (all of the member's).
3. FR-3 The ghost caret and the ahead/behind result line.
4. FR-4 The switch and the clear control.
5. FR-5 Erasure and export.

## Non-functional requirements

- **Correctness:** the plausibility check is pure and shared by the handler
  and its test; a ghost never replaces a faster one.
- **Performance:** a ghost is at most ~10 KB; one read per passage start; the
  caret costs one position computation per render.
- **Security:** `auth: 'required'`; the socket handler accepts samples only
  from the authenticated socket's own run.
- **Privacy:** own ghost only; never shown to others or the API; erased.
- **Design:** app tier (`components/rmhtype/rmhtype.css`), a lower-contrast
  caret using the existing RMHType muted token.
- **i18n:** `type-ghost`.

## Data model and API

- `RmhTypeGhost` in `prisma/schema/rmhtype.prisma` (plus `updatedAt` for the
  500 cap)
  (`@@map("rmhtype_ghost")`), back-relation under the auth anchor. Migration
  `20261128040100_s08_type_ghost`.
- `lib/rmhtype/ghost.ts` (pure: `GHOST_STEP_MS = 250`, `MAX_GHOST_SAMPLES`,
  `isPlausibleGhost`, `ghostPositionAt`, `aheadByMs`), `ghost-schema.ts`,
  `ghost.contract.ts`, `ghost.server.ts` (`saveGhostIfBest`, `getGhost`,
  `clearGhosts`, `exportTypeGhosts`, `typeGhostErasureOps`); modules
  `lib/rmhtype/api/rmhtype.ghosts.$passageId.server.ts`,
  `rmhtype.ghosts.server.ts`.
- Edits: `server/socket-server/handlers/rmhtype.ts` (solo finish),
  `lib/rmhtype/socket.ts` (event type), `RmhTypeSoloPage.tsx`,
  `TypingStats.tsx`, `components/rmhtype/ProgressPage.tsx`.
- Registry: `RmhTypeGhost` → `erase`.

## Testing requirements

- Product suite `lib/rmhtype/__tests__/ghost.product.test.ts`: plausibility
  (monotonic, end, duration, speed), position interpolation, ahead/behind.
- Main suite `lib/rmhtype/__tests__/ghost.test.ts`: saved only on a new best
  with ≥ 90% accuracy; never for a generated passage or `'unknown'`; the
  501st ghost evicts the oldest; never replaces a faster ghost; own-only read; clear.
- Main suite `lib/account/__tests__/type-ghost-erasure.test.ts`.
- Existing: the RMHType socket handler tests, `raf-loop-allowlist`,
  `useeffect-fetch-ratchet`, device-data registry test.

## Acceptance criteria

- [ ] After a best run on a passage, the next attempt shows the ghost caret
      moving at the earlier pace and the finish line says ahead or behind.
- [ ] A fabricated curve at 400 WPM is not stored.
- [ ] Turning the switch off hides the caret; Clear removes every ghost.
- [ ] 390 px and 1280 px, RMHType's light and dark looks, once in `ar`.

## Out of scope

Racing other members' ghosts, ghosts in multiplayer rooms, the daily, or
lessons, replaying a run's keystrokes.
