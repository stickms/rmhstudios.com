# 03 — Race a friend's ghost in Neon Driftway

Surface: Neon Driftway's ghost switch (Off, Your best, World #1, and now **a friend**), a friend picker per level.
Wave 4. Namespace `friend-ghosts`. App tier (L8).

## User story

As a Neon Driftway player, I want to race the best run of a friend I follow and who follows me, on the level I am about
to drive, so that I chase a time I care about instead of only my own or a stranger's world record.

## Requirements elicitation

- **What exists (verified):**
  - Ghost racing (plan U9): `GET /api/replays/ghost?game=neon-driftway&level=1&vs=pb|top`
    (`app/routes/api/replays/ghost.ts`, `getGhostQuery` in `lib/game/replay-schema.ts`, `getGhostApi` in
    `lib/game/replay.contract.ts`) answers the caller's own best ghost (`pb`) or the best ghost among the top five of
    the **validated** leaderboard (`top`), never more than that board score, because a ghost's own score is
    client-reported (`getGhost` in `lib/replays.server.ts`). A player keeps one ghost per level (`saveGhost`); ghosts
    are `unlisted` replays. `GHOST_GAME_IDS` (`lib/game/replay-library.ts`) is `['neon-driftway']`.
  - The client cycles `GHOST_MODES = ['off', 'pb', 'top']` (`lib/neon-driftway/ghost.ts`, stored under the device key
    `ndw-ghost-mode`) with one button in `components/neon-driftway/NeonDriftwayUI.tsx`; `NeonDriftwayGame.tsx` fetches
    the ghost after the countdown starts and labels it "Your best" or the owner's name.
  - The game boards' friends scope is mutual follows (`scopeFilter('friends')` in
    `lib/game/leaderboard-scope.server.ts`), and leaves out members who hide from boards
    (`leaderboardHiddenUserIds`, `lib/game/leaderboard-privacy.server.ts`); `lib/replays.server.ts` is already in
    `BOARD_PRIVACY_READ_PATHS` (`lib/game/leaderboard-privacy.ts`).
- **Decisions:**
  - **Who:** mutual follows only (the boards' rule), never a member either side has blocked, a banned or
    deletion-pending account, or a member who hides from leaderboards. A one-way follower never gets a member's ghost.
  - **Which ghost:** the friend's ghost on that level, only if the friend holds a validated Neon Driftway board entry
    and the ghost's score does not exceed it (the `top` rule, so a forged upload cannot become a friend's time either).
  - **The picker:** a fourth mode, "A friend", opens a short list for the level: each mutual with a ghost there, their
    name and the ghost's time, sorted fastest first, at most 20. The chosen friend is remembered per level on the device
    (a new key `ndw-ghost-friend`, `lib/core/persist`, listed in the device-data registry under the Wave 0 anchor). If
    the remembered friend no longer qualifies, the run starts with no ghost and the picker says why in one line ("No
    ghost from Ada on this level").
  - **Requests:** `GET /api/replays/ghost/friends?game&level` (the list, no trace data) and
    `GET /api/replays/ghost?…&vs=friend&friend=<userId>` (one trace). Both require a session; both re-check every rule.
  - **No notices:** a friend is never told their ghost was raced.

## Functional requirements

1. FR-1 `lib/game/friend-ghosts.server.ts`: `friendGhostList(viewerId, game, level)` and
   `friendGhost(viewerId, game, level, friendId)`, built on `scopeFilter('friends')`, the block check and the
   adapter's validated board, listed in `BOARD_PRIVACY_READ_PATHS` under the Wave 0 anchor.
2. FR-2 `getGhostQuery` gains `vs: 'friend'` and an optional `friend` id (zod: required when `vs` is `friend`);
   `getGhost` delegates to FR-1 for it. A friends-list endpoint as a registered module
   `lib/game/api/replays.ghost.friends.server.ts` with its contract in `lib/game/replay.contract.ts`, unless
   `lib/api/__tests__/route-table.test.ts` says the static path must stay beside `app/routes/api/replays/ghost.ts`
   (CLAUDE.md §3: a static path leaves the router only with its `$param` sibling); then it is a route file
   `app/routes/api/replays/ghost.friends.ts` using `implement()`.
3. FR-3 `lib/neon-driftway/ghost.ts`: `GhostMode` gains `friend`; the per-level friend memory through
   `lib/core/persist`.
4. FR-4 UI: the mode button in `NeonDriftwayUI.tsx` cycles four modes; `components/neon-driftway/FriendGhostPicker.tsx`
   (a dialog of rows, signed-out: "Sign in to race friends"); the label on the ghost is the friend's name.
5. FR-5 Refusal: `GHOST_FRIEND_UNAVAILABLE` ("That ghost is not available") for a friend who does not qualify.

## Non-functional requirements

- **Privacy:** the list never names a member who does not qualify; a test covers each rule (one-way follow, block
  either way, hidden from boards, banned, no validated entry, ghost above the board score).
- **Performance:** one board read and one replay query per request; `Cache-Control: private, max-age=60` on the list and on a `vs=friend` trace (the existing route sends `max-age=300`
  for `pb` and `top`; a friend who unfollows or hides must drop out within a minute). An anonymous `vs=friend` is 401
  although the route stays `auth: 'optional'` for `pb` and `top`.
- **Accessibility:** the picker is a dialog with labelled rows; the ghost's lead is already read as text by the HUD.

## Data model and API

No schema change. `GET /api/replays/ghost/friends?game=neon-driftway&level=<n>` →
`{ friends: [{ userId, name, handle, image, timeMs }] }`; `GET /api/replays/ghost?game&level&vs=friend&friend=<id>` →
`{ ghost }` as today.

## Testing requirements

- Main suite `lib/game/__tests__/friend-ghosts.test.ts`: every exclusion rule above; the ghost-above-board rule; the
  list sort and cap; anonymous callers get 401.
- Product suite `lib/neon-driftway/__tests__/ghost-friend.product.test.ts`: the mode cycle and the per-level memory.
- Gates: board-privacy registry test (`lib/game/__tests__/`), route table, device registry, raw-fetch ratchet.

## Acceptance criteria

- [ ] Two mutuals who both drove level 3 can each race the other's ghost from the picker.
- [ ] A member who follows someone one way never sees that person in the list.
- [ ] A member who hides from leaderboards is in nobody's list.
- [ ] A forged ghost faster than the friend's board score is never served.

## Out of scope

Friend ghosts in other games (only Neon Driftway records ghosts), racing several ghosts at once, notifications.
