# 02 — Your House Always Wins game, and your Nightrail lines, on every device

Surface: The House Always Wins main menu and its save, Nightrail's level select, Settings > Cloud saves
(`/settings/cloud-saves`). Wave 2. Namespace `haw-saves`. App tier (L8) in both games; the settings row is site tier.

## User story

As a member who plays The House Always Wins for an hour at a time, I want my run (and my New Game+ run) to follow my
account, so that clearing my browser or switching to the laptop does not send me back to the lobby with my debt
reset; and as a Nightrail player, I want the lines I unlocked to come with me too.

## Requirements elicitation

- **What exists (verified):**
  - The House Always Wins is a 20–90 minute metroidvania (`GAME_CAPABILITIES['house-always-wins']` in
    `lib/game-capabilities.ts`: `save: 'local-only'`). Its whole run is the zustand store
    `useHouseAlwaysWinsStore` (`lib/store/houseAlwaysWinsStore.ts`: debt, chips, keys, abilities, flags, checkpoint,
    deaths, visited rooms), persisted under `haw-save-v2` (classic) or `haw-ngplus-v1` (New Game+), the slot chosen
    once per page load (`slotStorageName(activeSlot())`, `lib/house-always-wins/ngplus.ts`). NG+ meta is `haw-meta-v1`
    (`META_KEY` in `ngplus.ts`).
  - The gate `components/house-always-wins/HouseAlwaysWinsGate.tsx` no longer requires sign-in; nothing reaches the
    server.
  - Nightrail keeps unlocked lines in `localStorage` `nightrail.unlocks` with hand-written read and write functions
    (`features/nightrail/ui/NightrailGame.tsx`, `loadUnlocks` / `saveUnlocks`); `GAME_CAPABILITIES.nightrail.save` is
    `'local-only'` with a comment saying the `NightrailPlayer` row is a board record, not progress.
  - The shared kit: `createCloudSave` (`lib/game-saves/cloud-save.ts`: local copy first and owner-stamped, the account
    copy through `/api/game-saves/:gameId`, `resolve()` returns a conflict instead of picking), `chooseSave` and
    `SaveSummary` (`lib/game-saves/conflict.ts`), the shared conflict dialog `components/shared/SaveConflictDialog.tsx`,
    the allowlist `SHARED_SAVE_GAMES` (`lib/game-saves/registry.ts`, 500 KB cap) and the optional compare-and-set
    `expectedUpdatedAt` added in sprint 14 (`lib/game-saves/api/game-saves.$gameId.server.ts`: the GET answers
    `{ saveData, updatedAt }`, a stale write answers `409` with the current `updatedAt`). Neon Driftway's unlocks
    (`lib/neon-driftway/cloud.ts`) are the exact model for Nightrail's.
  - **What the kit does not do (verified at validation):** `jsonTransport` never sends `expectedUpdatedAt` and treats
    a `409` as a plain failure, and `createCloudSave` has exactly one `localKey`. Hearthworks therefore wrote its own
    transport (`features/hearthworks/engine/save/account.ts`: it remembers the `updatedAt` it read or wrote, sends it,
    and after a `409` stops uploading for the session and offers the choice on the next menu). The House's run spans
    three keys (`haw-save-v2`, `haw-ngplus-v1`, `haw-meta-v1`).
  - Settings > Cloud saves (`app/routes/_site/settings/cloud-saves.tsx`) lists the shared-table games.
  - `lib/device-data/registry.ts` lists `nightrail.unlocks` and the `haw-meta` prefix (which covers `haw-meta-v1`), but
    **not** `haw-save-v2` or `haw-ngplus-v1`, the two zustand keys that hold the run.
- **Decisions:**
  - **Two save ids** on the shared table: `house-always-wins` (the classic run and, inside the same row, the NG+ run and
    the NG+ meta as three sections, so one row per member) and `nightrail` (the sorted list of unlocked lines).
    Both join `SHARED_SAVE_GAMES`; the capability claims become `save: 'shared-table'` (the capability test checks the
    claim against the registry).
  - **The local copies stay first and keep their keys**: the zustand persist keys are not renamed. Nightrail uses
    `createCloudSave` with `localKey: 'nightrail.unlocks'`. The House cannot (three keys, one `localKey`): its module
    composes `HawSave` from the three keys itself (`readLocal`: parse every present key, return `null` if the classic
    or NG+ envelope fails to parse, so a corrupt key is never uploaded) and applies a chosen account copy by writing
    each section back to its own key only after the whole payload parsed, then
    `useHouseAlwaysWinsStore.persist.rehydrate()`. It uses the kit's `chooseSave` / `SaveSummary`
    (`lib/game-saves/conflict.ts`) and `SaveConflictDialog`, with its owner stamp under `haw-save-v2::meta` (the kit's
    `${localKey}::meta` convention). Both modules' transports are compare-and-set ones on the Hearthworks model: the
    `updatedAt` from the last read or write is sent as `expectedUpdatedAt` (`null` when the account had no row), and a
    `409` stops uploads for the session and re-resolves on the next menu visit, which asks. The pagehide beacon sends
    the same `expectedUpdatedAt`, so a stale tab's last write is refused, never applied; the local write has already
    landed either way. `jsonTransport` and `createCloudSave` themselves are not changed.
  - **When the account copy is written:** House Always Wins at a save point (`setCheckpoint`), on a room change at
    most every 2 minutes, and on `pagehide` (beacon; the body is far below 60,000 bytes); Nightrail when a line
    unlocks. Both send `expectedUpdatedAt`; a `409` reloads the account copy and asks.
  - **Conflicts:** monotonic counters for the House are `visitedRooms` count, keys, abilities count and debt paid
    (`summarize` shows rooms visited, chips and debt); Nightrail's merge is the union of unlocked lines, so it never
    asks (a union loses nothing).
  - **Guests:** no request; a local run made as a guest is offered to the account on the next signed-in visit ("Keep
    this run on your account"), as the kit already does for other games.
  - **Starting over:** "New run" in the House's menu clears the local slot and writes the empty run to the account copy
    (with `expectedUpdatedAt`), after a confirm (`useConfirm`).
  - **Export and erasure:** `GameSave` rows are already exported and erased; nothing new.

## Functional requirements

1. FR-1 `lib/house-always-wins/cloud.ts` (new): `houseAlwaysWinsSave`, the kit's `CloudSave` shape (`resolve`,
   `commit`, `writeCloud`, `writeBeacon`, `clear`) built over the three keys with `parse` (validates the zustand
   envelope `{ state, version }` of each slot as the store writes it), `monotonic`, `summarize`, and its
   compare-and-set transport.
2. FR-2 `features/nightrail/engine/cloud.ts` (new): `nightrailSave = createCloudSave(…)`, the Neon Driftway shape,
   union merge, with the same compare-and-set transport passed as `transport`.
   The transport is one new module, `lib/game-saves/cas-transport.ts` (`casJsonTransport(gameId)`: the
   `CloudTransport` shape plus the remembered `updatedAt` and a `stale` flag), used by both games; tested in
   `lib/game-saves/__tests__/cas-transport.test.ts` (sends the last `updatedAt`, `null` for no row; a `409` sets
   `stale` and blocks further writes; the beacon carries `expectedUpdatedAt`).
3. FR-3 `lib/game-saves/registry.ts`: `'house-always-wins'` and `'nightrail'` join `SHARED_SAVE_GAMES` (with the
   comment); `lib/game-capabilities.ts` claims `shared-table` for both with honest comments.
4. FR-4 The House's gate resolves the save before the shell mounts (a conflict opens `SaveConflictDialog`), and the
   menu shows "Saved on this device" / "Saved to your account" / "Not saved to your account yet" as a status line.
5. FR-5 `features/nightrail/ui/NightrailGame.tsx` replaces `loadUnlocks` / `saveUnlocks` with the kit.
6. FR-6 Settings > Cloud saves lists both games (their summaries) with "Delete account copy".

## Non-functional requirements

- **Nothing is lost:** the local write is synchronous and first; a stale device's write is refused (`409`), never
  applied; an unreadable account copy is ignored and logged once.
- **No new requests for guests**, and one read per page load for members (with the kit's 8 s deadline).
- **Island rule:** Nightrail is an island (`features/nightrail/feature.ts`, `delivery: 'island'`): no React Query or
  router imports (`lib/__tests__/islands.test.ts`); the kit's `fetch` transport is allowed.
- **Storage:** `haw-save-v2`, `haw-ngplus-v1` and `haw-save-v2::meta` join the `game-saves` entry of
  `lib/device-data/registry.ts` (the House's run was never listed); every other key keeps its line; reads through
  `lib/core/persist`.
- **Size:** the House's composed payload is checked against `MAX_SAVE_BYTES` (`lib/game-saves/registry.ts`, 500 KB)
  before it is sent, and against the beacon's 64 KB before the pagehide beacon (over it, the ordinary keepalive write
  is tried and the local copy stands).
- **Query shapes:** none new (the save route is unchanged).

## Testing requirements

- Main suite `lib/house-always-wins/__tests__/cloud.test.ts`: parse accepts both slots and rejects a corrupt
  envelope; a corrupt local key is never uploaded and never overwritten by a failed parse; an existing local run with
  no account copy is uploaded with `expectedUpdatedAt: null` (no data loss on first sign-in); a `409` stops uploads and
  the next resolve asks; monotonic counters; a guest run is claimable, another member's is not; a payload over the
  cap is not sent.
- Main suite `features/nightrail/engine/__tests__/cloud.test.ts`: union merge, never a conflict, sorted output.
- Main suite: the save route's existing tests with `house-always-wins` and `nightrail` (allowlist, 500 KB cap).
- The capability test (`lib/__tests__/game-capabilities.test.ts`), the device registry test, the islands test.

## Acceptance criteria

- [ ] A member plays the House on one browser, opens it on another, and continues from the same save point.
- [ ] When both browsers moved on, the member is asked which run to keep before anything is overwritten.
- [ ] Nightrail lines unlocked on a phone are open on the desktop.
- [ ] A guest's play makes no request; after signing in, the guest run can be kept on the account.
- [ ] Settings > Cloud saves lists both games and can delete either account copy.

## Out of scope

Several save slots, cloud saves for Velum 2099, Portal or Half-Life 2, Nightrail settings.
