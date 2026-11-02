# Altair co-op multiplayer — design and status

Scope: `/altair/multiplayer`, `/altair/multiplayer/$lobbyId`,
`components/altair/multiplayer/*`, `lib/altair/multiplayer/*`,
`server/socket-server/handlers/altair.ts`. Single-player Altair
(`/altair`, `lib/altair/engine/*`) must never regress; multiplayer extends the
engine, it does not fork it.

## Status

| Phase | What                                                          | State  |
| ----- | ------------------------------------------------------------- | ------ |
| 0     | This design                                                   | done   |
| 1     | Lobby flow: a match can start; errors reach the player; tests | done   |
| 2     | Host simulation for 2–4 players                               | not started |
| 3     | Client: render snapshots, input, HUD, banners                 | not started |
| 4     | Results, drop-in, persistence                                 | not started |

Until phase 2 and 3 land, `MultiplayerGameScreen` shows an honest "not playable
yet" message with a Leave button (the interim from the placeholder-exit change).
Remove it in the same PR that lands the real match.

## Lobby state machine (phase 1, implemented)

```
WAITING --host Start (all ready, >=2, all connected)--> COUNTDOWN (5s)
COUNTDOWN --timer--> PLAYING --host ends / TPK / victory--> RESULTS --15s--> WAITING
COUNTDOWN --leave | kick | disconnect--> WAITING (everyone un-readied)
PLAYING --host gone past the 10s grace--> RESULTS (endedReason: 'host_left')
```

- Class choice and Ready both live on `LobbyWaiting`. The `CLASS_SELECT` state
  and `ClassSelectLobby` were the original plan; nothing ever entered that state
  so Start could not succeed. The state stays in the shared type (reserved) but
  is never entered.
- Changing class un-readies the player. Classes lock once COUNTDOWN begins.
- Only the host may Start; a second Start while counting is refused (`WRONG_STATE`).
- Hub rejections carry codes (`NOT_HOST`, `NOT_READY`, `NEED_MORE_PLAYERS`,
  `WRONG_STATE`, `INVALID_PAYLOAD`) and the lobby route toasts them.
- Tests: `server/socket-server/handlers/__tests__/altair-lobby.test.ts`.

## Simulation model (phases 2–3, decided)

**Host-authoritative.** The host's browser runs the one simulation for all N
players. The hub never simulates; it relays.

- Guests send `GAME_INPUT` at 20 Hz: `{seq, dx, dy, aim?}` (movement intent only;
  never positions, HP, damage or XP). The hub forwards it to the host tagged with
  the sender's `userId` (already implemented) — the host ignores input from users
  not in the lobby.
- The host steps the fixed 60 Hz sim, and every 3rd step (20 Hz) sends a
  `GameStateSnapshot` (`lib/altair/multiplayer/types.ts`) through the hub, which
  fans it out to guests and keeps `lastSnapshot`/`sharedKills`.
- Guests render the two latest snapshots, interpolated ~100 ms behind (one
  snapshot of buffer), extrapolating at most one interval. Local prediction of the
  guest's own movement is a later refinement; the first version shows own movement
  with the same interpolation (≈ one RTT + 50 ms of latency), which is acceptable
  for a survivor game with a 200 px/s walk speed.
- **Snapshot contents:** tick, game time, players (position, facing, HP, state,
  class, level, kills), enemies (id, def, position, HP — only those near a player,
  capped), enemy/player projectiles (position, velocity, radius, colour), pickups,
  boss state, shared kills. Positions are rounded to 0.1 px. Visual-only
  state (particles, damage numbers, hit flashes) is regenerated client-side from
  snapshot deltas and `GAME_EVENT`s, never sent.
- **Engine coupling.** The single-player engine is built around one
  `world.player`, `world.weapons`, one ability state and one effective-stats
  object (≈200 references). The multiplayer host runs the same systems by
  *context swap*: per fixed step, for each player in turn, the player-specific
  systems (movement, class abilities, catalysts, weapons, pickups) run with that
  player's entity/weapons/passives/ability state swapped into the world's single
  slots; the shared systems (enemy AI, bosses, wave director, collisions) run once
  and target through `world.players` (`engine/multiplayer/player-helpers.ts` and
  the `isMultiplayer` branch of `enemy-system.ts` already do this for targeting).
  The per-step body of `createGameLoop` is extracted into a reusable step function
  so single-player and the host share it; single-player output must stay
  bit-identical (verified by running a run before/after).
- **Scaling:** `ScalingState` (types.ts) scales enemy HP/damage/spawn budget with
  the alive player count; spawns happen around a random alive player.

## Shared objectives

- **Kills:** an enemy dies once; `sharedKills` counts all of them; each player's
  `kills` counts the ones their projectiles finished. Boss kills are shared.
- **XP and levels are per player.** Pickups go to whoever collects them (XP gems
  also trickle a share to teammates — `xpTrickleAccum` in the world type). Each
  player levels independently and gets their own upgrade overlay; the host rolls
  the choices and returns them to that player only. The overlay **does not pause
  the world** — a co-op match cannot pause for everyone. Instead the player is
  invulnerable while the overlay is open (capped at 10 s, then the first option
  is auto-picked).
- **Pause:** there is no pause. Esc opens a non-pausing menu (settings, leave).
  Solo-host pause is not offered either, since it would freeze guests.
- **Death:** at 0 HP a player is *downed* for `downTimer` seconds; a living
  teammate standing next to them fills `revivalProgress` and revives them
  (invulnerable briefly). If the timer expires they are *dead*, spectate a living
  teammate, and cannot be revived. All players dead/downed = TPK → results (defeat).
- **Win:** the same victory condition as single-player (wave director victory /
  final boss). Reported to the hub by the host.

## Drop-in, reconnect, host loss

- Drop-in uses the existing hub rule (`dropInAllowed`, `dropInWindow`): joiners get
  `GAME_PLAYER_JOINED`; the host spawns them beside the nearest living player at
  roughly the average team level, with a short invulnerability window. A joiner
  with no class yet picks one in a small overlay before spawning.
- A guest who drops keeps their slot for the hub's 10 s grace window (their
  character stands still and invulnerable-ish: shown as "reconnecting"); on
  reconnect the host resumes feeding them. After the grace they are removed and
  the host despawns them.
- **Host loss ends the run.** The simulation lives only in the host's page and
  cannot be rebuilt from a snapshot, so there is no host migration (the old
  half-built migration was removed). The hub tells guests `host_disconnected`
  immediately (banner with the grace countdown) and `host_reconnected` if the
  socket returns in time; past the grace it ends the match with
  `endedReason: 'host_left'` and everyone sees results plus a message.

## Results and persistence (phase 4)

The host reports final per-player stats with a host-only end-of-run event; the hub
clamps them (a client is untrusted) and broadcasts results. Nothing from a
multiplayer run awards coins or writes leaderboard rows unless the existing
single-player path already verifies results server-side — that path will be read
before anything is persisted, and a client-submitted score is never trusted for
coin rewards.
