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
| 2     | Host simulation for 2–4 players (`engine/multiplayer/host-sim.ts`) | done (pure logic + tests; not wired to a page yet) |
| 3A    | Client: host driver, snapshot rendering, guest input, host-leave | done (two real clients verified) |
| 3B    | Co-op feel: per-player level-up, revive/down UI, spectate, boss bar | done (two real clients verified) |
| 3C    | Robustness: touch, reconnect, drop-in, results/lobby loop     | done (two real clients verified) |
| 4     | Results, drop-in, persistence                                 | not started |

### Phase 3A as built

- **Host page** (`MultiplayerGameScreen`): `HostDriver` (`lib/altair/multiplayer/host-driver.ts`) wraps
  `HostSim`: an accumulator turns wall time into 60 Hz steps (at most 15 per call; a longer stall drops
  the backlog instead of replaying it), a snapshot goes out every 3rd step, guests that go quiet for 1 s
  are told to stand still. It is driven by a **worker metronome** (`tick-worker.ts`): background-tab
  main-thread timers are throttled to ~1 Hz, worker messages are not, so a hidden host tab keeps
  feeding guests. Without Worker support it falls back to `setInterval` (throttled when hidden: the
  one known limitation). Not verified on a real backgrounded tab here.
- **Every client, host included**, draws from snapshots: `decodeSnapshot` -> `SnapshotBuffer`
  (`snapshot-buffer.ts`, sampled 100 ms behind for guests, 50 ms for the host's own loopback) ->
  `SnapshotView` (`snapshot-view.ts`, builds the `GameWorld` the single-player renderer draws, entities
  pooled by id so sprite animation persists) -> `renderFrame(…, { players })`. The renderer gained one
  optional argument (`RenderExtras`) for teammate bodies, rings and name tags; single-player passes none.
- Lingering pools are not flagged on the wire, so the view treats a stationary projectile of radius >= 30
  as a pool. Particles and damage numbers are not reconstructed yet.
- **Hub:** guest `GAME_INPUT` is shape-validated and rebuilt field by field before it reaches the
  host; host snapshots are shape/size-checked; new host-only `GAME_END` carries the run outcome and
  per-player counters (clamped; `coinsEarned` is always 0 for co-op). Players are reached through a
  per-user room, not one remembered socket id: a tab holds several sockets to the hub (call socket and
  others), and the last one to connect used to steal the slot, so the Altair client stopped receiving
  snapshots. A player is only "disconnected" when their LAST socket closes.
### Phase 3B as built

- Level-up: the host's `HostDriver` announces each newly opened overlay once (`onLevelUpOffer`); the host
  sends it to that guest only (`altair:game:level_up_offer`, host-only, options rebuilt by the hub) or opens
  it locally; the guest answers with a bare index (`altair:game:level_up_choice`, rate limited: it had no rule
  before and would have been dropped). `LevelUpPicker` is the single-player picker, extracted from
  `LevelUpScreen`, with a countdown; nothing pauses. The overlay closes on a pick or when the snapshot says
  the host auto-picked.
- HUD: team rows (name, class colour, level, HP, Down Ns, dead, "Choosing..."), team kills and clock, boss
  bar from the snapshot, "you are down" / spectating banner. Revive progress is a ring drawn on the downed
  body by the renderer (it fills while a teammate stands in range). A dead player's camera follows a living
  teammate.
- Fixed (play3): the wave table has a boss entry at t=300 and another wave starting at t=300 after it, and the director took the LAST matching wave, so no boss ever spawned. The director now scans the boss entries directly (30 s window, never while a boss lives). Verified: Hollow King + bar in single-player and on a co-op guest.

### Phase 3C as built

- The lobby route no longer swaps a live match for a "Connecting..." screen on a socket drop (that
  unmounted the host page, i.e. destroyed the simulation); the match shows its own banner. Snapshots
  and guest input are sent `volatile`, so nothing stale replays after a reconnect.
- Drop-in: a mid-run joiner (hub rules unchanged) sees a class picker and picks once (the hub accepts a
  class from a PLAYING player who has none); the hub announces `GAME_PLAYER_JOINED` with the class and the
  host calls `HostSim.addPlayer`; `GAME_PLAYER_LEFT` (after the grace) calls `removePlayer`.
- Results: no "Play Again" button (it did nothing); the hub reopens the lobby 15 s after results and the
  screen says so. Coins are not shown: co-op runs earn none. `ClassSelectLobby` (unreachable) is gone.
- Persistence, for whoever builds it (read, not built): `/api/altair/match` already exists
  (server-to-server, `ALTAIR_SERVER_SECRET` bearer) and writes `AltairMatch`, `AltairMatchPlayer`, the
  co-op profile (`totalCoopCoins` from `coinsEarned`) and achievements, but it only CLAMPS what it is
  given, and nothing calls it (the hub does not). Single-player's `/api/altair/meta` likewise stores
  whatever coin balance the client sends (bounded to 0-100M), so neither path verifies a run. Co-op
  numbers come from the host's browser, which every other player must treat as untrusted, so they must
  not mint coins as sent: persisting them needs either server-side re-simulation or caps derived from
  run time plus a way for guests to dispute the report. Until then the hub's results carry
  `coinsEarned: 0` and nothing is written.

- A host page that mounts mid-run (reload) cannot resume the match; it says so and offers Leave.

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

### Phase 2 as built

- `engine/sim-step.ts` holds the fixed step as phases (world prep · player actions ·
  enemies+boss · collisions · player post · world post); single-player runs them once
  (`stepSimulation`), `engine/multiplayer/host-sim.ts` (`HostSim`) runs the player-owned
  phases per player under `swapIn`/`swapOut` (`player-state.ts`) and the rest once.
  Single-player is pinned by `engine/__tests__/golden-master.test.ts` (full-world hashes over
  9 seeded scenarios) — if a hash moves you changed gameplay.
- `handleCollisions` takes `CollisionOptions`: the host calls it once per player filtered by
  `ownerId` (stamped on projectiles/hitboxes/auras/summons after each player's phase), advances
  enemy projectiles once (`advanceShared`), and processes deaths itself, per killer
  (`processEnemyDeaths`), crediting whoever dropped the enemy to 0 HP (`lastHitBy`).
- Pickups go to the nearest living player. XP trickles 25% to each living teammate.
- Scaling per living player: enemy HP ×(1+0.5n), damage ×(1+0.15n), spawn budget ×(1+0.6n), boss
  HP ×(1+0.8n) (n = players − 1); applied once to newly created enemies.
- The shared systems (enemy spawns, boss aim) target ONE living player, rotating every 2 s
  (`FOCUS_PERIOD`); enemy AI targets the nearest. Boss attacks therefore aim at the focus player.
- Level-ups: `getPendingLevelUp` / `chooseUpgrade`; auto-pick of the first option after 10 s;
  the player is invulnerable while the overlay is open; the world never pauses. Reroll/banish
  are not offered in co-op yet.
- Downed 25 s, revived by a teammate within 70 px for 3 s (50% HP, 2.5 s grace), else dead.
- Wire format: `GameStateSnapshot` is flat number arrays (positions in tenths of a pixel);
  `multiplayer/snapshot.ts` encodes (interest radius 1100 px, capped), decodes (validating) and
  interpolates (`snapshotAlpha`, at most one interval of extrapolation, snaps on teleports).

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
